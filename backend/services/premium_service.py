"""
Premium Service — Stub. No active payment integration.
Premium is not currently offered; all users are non-premium.
"""


def is_premium(roll_number: str) -> bool:
    """Premium is not active. Always returns False."""
    return False


def get_subscription_status(roll_number: str) -> dict:
    """Return a not-subscribed status. Waitlist check is handled in the router."""
    return {
        "is_premium": False,
        "status": "none",
        "plan": None,
        "waitlisted": False,
    }
