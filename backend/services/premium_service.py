"""
Premium Service — Manages premium subscription status checks and gating.
"""

from datetime import datetime, timedelta

from db.models.premium_subscription import PremiumSubscription
from db.session import SessionLocal


def is_premium(roll_number: str) -> bool:
    """Check if a student has an active premium subscription (including grace period)."""
    with SessionLocal() as session:
        sub = session.query(PremiumSubscription).filter(
            PremiumSubscription.roll_number == roll_number
        ).one_or_none()

        if sub is None:
            return False

        now = datetime.utcnow()

        if sub.status == "active" and sub.expiry_date > now:
            return True

        if sub.status == "grace" and sub.grace_ends_at and sub.grace_ends_at > now:
            return True

        return False


def get_subscription_status(roll_number: str) -> dict:
    """Get detailed subscription status for frontend display."""
    with SessionLocal() as session:
        sub = session.query(PremiumSubscription).filter(
            PremiumSubscription.roll_number == roll_number
        ).one_or_none()

        if sub is None:
            # Check waitlist
            from db.models.premium_waitlist import PremiumWaitlist
            on_waitlist = session.query(PremiumWaitlist).filter(
                PremiumWaitlist.roll_number == roll_number
            ).first() is not None
            return {"is_premium": False, "status": "none", "plan": None, "waitlisted": on_waitlist}

        now = datetime.utcnow()
        is_active = False
        grace_remaining_days = None

        if sub.status == "active" and sub.expiry_date > now:
            is_active = True
        elif sub.status == "grace" and sub.grace_ends_at and sub.grace_ends_at > now:
            is_active = True
            grace_remaining_days = max(0, (sub.grace_ends_at - now).days)

        return {
            "is_premium": is_active,
            "status": sub.status,
            "plan": sub.plan,
            "expiry_date": sub.expiry_date.isoformat() if sub.expiry_date else None,
            "grace_remaining_days": grace_remaining_days,
            "waitlisted": False,
        }


def activate_premium(roll_number: str, phonepe_subscription_id: str | None = None) -> PremiumSubscription:
    """Activate or renew a premium subscription."""
    now = datetime.utcnow()
    expiry = now + timedelta(days=30)

    with SessionLocal() as session:
        sub = session.query(PremiumSubscription).filter(
            PremiumSubscription.roll_number == roll_number
        ).one_or_none()

        if sub:
            # Renew: extend from current expiry if still active, otherwise from now
            if sub.expiry_date > now:
                sub.expiry_date = sub.expiry_date + timedelta(days=30)
            else:
                sub.expiry_date = expiry
            sub.status = "active"
            sub.grace_ends_at = None
            sub.payment_status = "success"
            if phonepe_subscription_id:
                sub.phonepe_subscription_id = phonepe_subscription_id
            sub.updated_at = now
        else:
            sub = PremiumSubscription(
                roll_number=roll_number,
                plan="monthly_19",
                status="active",
                start_date=now,
                expiry_date=expiry,
                phonepe_subscription_id=phonepe_subscription_id,
                payment_status="success",
                created_at=now,
                updated_at=now,
            )
            session.add(sub)

        session.commit()
        session.refresh(sub)
        return sub


def enter_grace_period(roll_number: str) -> None:
    """Move a subscription into grace period (3 days after expiry)."""
    now = datetime.utcnow()
    with SessionLocal() as session:
        sub = session.query(PremiumSubscription).filter(
            PremiumSubscription.roll_number == roll_number
        ).one_or_none()
        if sub and sub.status == "active":
            sub.status = "grace"
            sub.grace_ends_at = now + timedelta(days=3)
            sub.payment_status = "failed"
            sub.updated_at = now
            session.commit()


def expire_subscription(roll_number: str) -> None:
    """Expire a subscription after grace period ends."""
    now = datetime.utcnow()
    with SessionLocal() as session:
        sub = session.query(PremiumSubscription).filter(
            PremiumSubscription.roll_number == roll_number
        ).one_or_none()
        if sub:
            sub.status = "expired"
            sub.updated_at = now
            session.commit()


def cancel_subscription(roll_number: str) -> None:
    """Cancel a subscription (access continues until expiry)."""
    now = datetime.utcnow()
    with SessionLocal() as session:
        sub = session.query(PremiumSubscription).filter(
            PremiumSubscription.roll_number == roll_number
        ).one_or_none()
        if sub:
            sub.status = "cancelled"
            sub.cancelled_at = now
            sub.updated_at = now
            session.commit()
