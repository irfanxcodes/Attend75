"""
Account Deletion Service — Cascade delete all notification-related data for a student.

Removes: push_subscriptions, notification_history, notification_preferences,
attendance_alert_states, premium_subscriptions. Payment transactions are
retained for 365 days per legal requirements (Req 18.3/18.5).
"""

import logging

from db.models.attendance_alert_state import AttendanceAlertState
from db.models.notification_history import NotificationHistory
from db.models.notification_preference import NotificationPreference
from db.models.premium_subscription import PremiumSubscription
from db.models.push_subscription import PushSubscription
from db.session import SessionLocal

logger = logging.getLogger(__name__)


def delete_notification_data_for_student(roll_number: str) -> dict:
    """
    Delete all push/notification data for a student. Called on account deletion.
    Payment transactions are intentionally NOT deleted (legal retention).
    Returns counts of deleted rows per table.
    """
    with SessionLocal() as session:
        push_deleted = (
            session.query(PushSubscription)
            .filter(PushSubscription.roll_number == roll_number)
            .delete(synchronize_session=False)
        )
        history_deleted = (
            session.query(NotificationHistory)
            .filter(NotificationHistory.roll_number == roll_number)
            .delete(synchronize_session=False)
        )
        prefs_deleted = (
            session.query(NotificationPreference)
            .filter(NotificationPreference.roll_number == roll_number)
            .delete(synchronize_session=False)
        )
        alerts_deleted = (
            session.query(AttendanceAlertState)
            .filter(AttendanceAlertState.roll_number == roll_number)
            .delete(synchronize_session=False)
        )
        premium_deleted = (
            session.query(PremiumSubscription)
            .filter(PremiumSubscription.roll_number == roll_number)
            .delete(synchronize_session=False)
        )

        session.commit()

    result = {
        "push_subscriptions": push_deleted,
        "notification_history": history_deleted,
        "notification_preferences": prefs_deleted,
        "attendance_alert_states": alerts_deleted,
        "premium_subscriptions": premium_deleted,
    }
    logger.info("Account deletion cascade for %s: %s", roll_number, result)
    return result
