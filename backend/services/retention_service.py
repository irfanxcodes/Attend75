"""
Retention Service — Periodic cleanup of aged notification/payment data.

Req 8.5 / 18.2: notification_history rows older than 90 days are deleted.
Req 18.3: payment_transactions rows older than 365 days are deleted.

Runs as a daily threading.Timer loop, same pattern as NoticeScheduler.
"""

import logging
import threading
from datetime import datetime, timedelta

from db.models.notification_history import NotificationHistory
from db.models.payment_transaction import PaymentTransaction
from db.session import SessionLocal

logger = logging.getLogger(__name__)

NOTIFICATION_HISTORY_RETENTION_DAYS = 90
PAYMENT_TRANSACTION_RETENTION_DAYS = 365

_RUN_INTERVAL_SECONDS = 24 * 3600  # daily


def cleanup_notification_history(days: int = NOTIFICATION_HISTORY_RETENTION_DAYS) -> int:
    """Delete notification_history rows older than `days`. Returns count deleted."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    with SessionLocal() as session:
        deleted = (
            session.query(NotificationHistory)
            .filter(NotificationHistory.created_at < cutoff)
            .delete(synchronize_session=False)
        )
        session.commit()
        return deleted


def cleanup_payment_transactions(days: int = PAYMENT_TRANSACTION_RETENTION_DAYS) -> int:
    """Delete payment_transactions rows older than `days`. Returns count deleted."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    with SessionLocal() as session:
        deleted = (
            session.query(PaymentTransaction)
            .filter(PaymentTransaction.created_at < cutoff)
            .delete(synchronize_session=False)
        )
        session.commit()
        return deleted


class RetentionScheduler:
    """Daily background loop that runs both cleanup jobs. Mirrors NoticeScheduler."""

    def __init__(self, interval_seconds: int = _RUN_INTERVAL_SECONDS):
        self._interval_seconds = interval_seconds
        self._running = False
        self._timer: threading.Timer | None = None

    def start(self) -> None:
        self._running = True
        self._schedule_next()
        logger.info("RetentionScheduler started (interval=%ds)", self._interval_seconds)

    def stop(self) -> None:
        self._running = False
        if self._timer:
            self._timer.cancel()
        logger.info("RetentionScheduler stopped")

    def _schedule_next(self) -> None:
        if not self._running:
            return
        self._timer = threading.Timer(self._interval_seconds, self._run_cycle)
        self._timer.daemon = True
        self._timer.start()

    def _run_cycle(self) -> None:
        try:
            history_deleted = cleanup_notification_history()
            payments_deleted = cleanup_payment_transactions()
            logger.info(
                "RetentionScheduler cycle: deleted %d notification_history rows, %d payment_transactions rows",
                history_deleted,
                payments_deleted,
            )
        except Exception:
            logger.exception("RetentionScheduler cycle failed")
        finally:
            self._schedule_next()


retention_scheduler = RetentionScheduler()
