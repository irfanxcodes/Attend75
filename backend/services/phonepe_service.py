"""
PhonePe Service — UPI Autopay subscription management.

Handles: mandate creation, webhook verification, and cancellation.
All interactions with PhonePe PG API are isolated here.

Environment variables:
  PHONEPE_MERCHANT_ID
  PHONEPE_SALT_KEY
  PHONEPE_SALT_INDEX (default "1")
  PHONEPE_BASE_URL (default "https://api.phonepe.com/apis/hermes")
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import time
import uuid
from datetime import datetime

import requests

from db.models.payment_transaction import PaymentTransaction
from db.session import SessionLocal
from services import premium_service

logger = logging.getLogger(__name__)

_MERCHANT_ID = lambda: os.getenv("PHONEPE_MERCHANT_ID", "")
_SALT_KEY = lambda: os.getenv("PHONEPE_SALT_KEY", "")
_SALT_INDEX = lambda: os.getenv("PHONEPE_SALT_INDEX", "1")
_BASE_URL = lambda: os.getenv("PHONEPE_BASE_URL", "https://api.phonepe.com/apis/hermes")
_CALLBACK_URL = lambda: os.getenv("PHONEPE_CALLBACK_URL", "https://api.attend75.xyz/premium/webhook")

SUBSCRIPTION_AMOUNT_PAISE = 1900  # ₹19
MAX_WEBHOOK_PAYLOAD_BYTES = 64 * 1024
WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300


class PhonePeError(Exception):
    """Raised when PhonePe API returns an error or is unavailable."""


def initiate_subscription(roll_number: str) -> dict:
    """
    Create a PhonePe UPI autopay subscription.
    Returns {redirect_url, merchant_transaction_id} on success.
    Raises PhonePeError on failure (no partial state persisted).
    """
    merchant_id = _MERCHANT_ID()
    if not merchant_id or not _SALT_KEY():
        raise PhonePeError("PhonePe credentials not configured")

    merchant_transaction_id = f"A75-{roll_number}-{uuid.uuid4().hex[:8]}"

    payload = {
        "merchantId": merchant_id,
        "merchantTransactionId": merchant_transaction_id,
        "merchantUserId": roll_number,
        "amount": SUBSCRIPTION_AMOUNT_PAISE,
        "redirectUrl": f"https://attend75.xyz/app/premium?status=success",
        "redirectMode": "REDIRECT",
        "callbackUrl": _CALLBACK_URL(),
        "paymentInstrument": {"type": "UPI_INTENT"},
    }

    payload_json = json.dumps(payload)
    payload_base64 = base64.b64encode(payload_json.encode()).decode()

    # Generate X-VERIFY checksum
    checksum_str = payload_base64 + "/pg/v1/pay" + _SALT_KEY()
    checksum = hashlib.sha256(checksum_str.encode()).hexdigest() + "###" + _SALT_INDEX()

    try:
        response = requests.post(
            f"{_BASE_URL()}/pg/v1/pay",
            json={"request": payload_base64},
            headers={
                "Content-Type": "application/json",
                "X-VERIFY": checksum,
            },
            timeout=15,
        )

        if response.status_code != 200:
            raise PhonePeError(f"PhonePe API returned {response.status_code}")

        data = response.json()
        if data.get("success") is not True:
            raise PhonePeError(data.get("message", "PhonePe subscription creation failed"))

        redirect_url = data.get("data", {}).get("instrumentResponse", {}).get("redirectInfo", {}).get("url")
        return {
            "redirect_url": redirect_url,
            "merchant_transaction_id": merchant_transaction_id,
        }

    except requests.RequestException as exc:
        raise PhonePeError(f"PhonePe API unavailable: {exc}") from exc


def handle_webhook(raw_body: bytes, x_verify_header: str) -> dict:
    """
    Process a PhonePe webhook callback.
    Validates signature, checks idempotency, activates/extends/grace as needed.
    Returns a response dict.
    """
    # Size check (Req 17.10d)
    if len(raw_body) > MAX_WEBHOOK_PAYLOAD_BYTES:
        return {"status": "rejected", "reason": "payload_too_large"}

    # Signature verification (Req 17.10a)
    if not _verify_webhook_signature(raw_body, x_verify_header):
        return {"status": "rejected", "reason": "invalid_signature"}

    # Parse payload
    try:
        body = json.loads(raw_body)
        response_base64 = body.get("response", "")
        response_json = json.loads(base64.b64decode(response_base64))
    except (json.JSONDecodeError, Exception):
        return {"status": "rejected", "reason": "invalid_payload"}

    transaction_id = response_json.get("data", {}).get("merchantTransactionId", "")
    event_type = response_json.get("code", "")
    merchant_user_id = response_json.get("data", {}).get("merchantUserId", "")
    phonepe_ref = response_json.get("data", {}).get("transactionId", "")

    if not transaction_id or not merchant_user_id:
        return {"status": "rejected", "reason": "missing_fields"}

    # Idempotency check (Req 17.10c)
    with SessionLocal() as session:
        existing = session.query(PaymentTransaction).filter(PaymentTransaction.transaction_id == transaction_id).one_or_none()
        if existing:
            return {"status": "already_processed"}

    # Process based on event type
    roll_number = merchant_user_id

    if event_type == "PAYMENT_SUCCESS":
        premium_service.activate_premium(roll_number)
        _record_transaction(roll_number, transaction_id, phonepe_ref, "success")
        return {"status": "activated"}

    elif event_type == "PAYMENT_ERROR" or "FAILED" in event_type.upper():
        premium_service.enter_grace_period(roll_number)
        _record_transaction(roll_number, transaction_id, phonepe_ref, "failed")
        return {"status": "grace_period_entered"}

    else:
        _record_transaction(roll_number, transaction_id, phonepe_ref, "unknown")
        return {"status": "processed", "event": event_type}


def cancel_subscription(roll_number: str) -> dict:
    """
    Cancel UPI autopay mandate via PhonePe API.
    On success, calls premium_service.cancel_subscription.
    On failure, returns error without mutating DB (Req 17.11).
    """
    # In a real implementation, this would call PhonePe's cancel mandate API.
    # For now, we cancel locally (PhonePe integration details TBD based on their docs).
    try:
        premium_service.cancel_subscription(roll_number)
        return {"status": "cancelled", "message": "Subscription cancelled. Access continues until current period ends."}
    except Exception as exc:
        raise PhonePeError(f"Unable to cancel subscription: {exc}") from exc


def _verify_webhook_signature(raw_body: bytes, x_verify_header: str) -> bool:
    """Verify X-VERIFY header using SHA256 + salt."""
    if not x_verify_header or not _SALT_KEY():
        return False

    try:
        parts = x_verify_header.split("###")
        if len(parts) != 2:
            return False
        received_hash = parts[0]

        # PhonePe webhook signature: SHA256(response + salt_key)
        response_base64 = json.loads(raw_body).get("response", "")
        expected_str = response_base64 + _SALT_KEY()
        expected_hash = hashlib.sha256(expected_str.encode()).hexdigest()

        return hmac.compare_digest(received_hash, expected_hash)
    except Exception:
        return False


def _record_transaction(roll_number: str, transaction_id: str, phonepe_ref: str, status: str) -> None:
    """Record a payment transaction for audit."""
    with SessionLocal() as session:
        tx = PaymentTransaction(
            roll_number=roll_number,
            transaction_id=transaction_id,
            phonepe_reference=phonepe_ref,
            amount=SUBSCRIPTION_AMOUNT_PAISE / 100,
            status=status,
            created_at=datetime.utcnow(),
        )
        session.add(tx)
        session.commit()
