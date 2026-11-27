"""
Support Service — Track contribution attempts and stats.
"""
import logging
from datetime import datetime
from sqlalchemy import func
from db.models.support_contribution import SupportContribution
from db.session import SessionLocal

logger = logging.getLogger(__name__)


def track_contribution_event(
    roll_number: str,
    card_style: str,
    action_type: str,
    amount: int | None = None,
    utr_reference: str | None = None
) -> dict:
    """
    Track a contribution-related event (view, click, submit).
    Returns the created contribution record.
    """
    with SessionLocal() as session:
        contribution = SupportContribution(
            roll_number=roll_number,
            card_style=card_style,
            action_type=action_type,
            amount=amount,
            utr_reference=utr_reference,
            status="pending"
        )
        session.add(contribution)
        session.commit()
        session.refresh(contribution)
        
        return {
            "id": contribution.id,
            "roll_number": contribution.roll_number,
            "card_style": contribution.card_style,
            "action_type": contribution.action_type,
            "amount": contribution.amount,
            "status": contribution.status,
            "created_at": contribution.created_at.isoformat() if contribution.created_at else None
        }


def mark_as_thanked(roll_number: str) -> bool:
    """
    Mark the latest contribution from this user as 'thanked'.
    Returns True if a record was updated.
    """
    with SessionLocal() as session:
        latest = (
            session.query(SupportContribution)
            .filter(
                SupportContribution.roll_number == roll_number,
                SupportContribution.action_type == "submit",
                SupportContribution.status == "pending"
            )
            .order_by(SupportContribution.created_at.desc())
            .first()
        )
        
        if latest:
            latest.status = "thanked"
            latest.updated_at = datetime.utcnow()
            session.commit()
            return True
        return False


def get_contribution_stats() -> dict:
    """
    Get aggregate contribution stats for display on cards.
    Returns total contributors count (unique students who submitted).
    """
    with SessionLocal() as session:
        # Count unique students who have submitted (clicked amount or submitted custom)
        contributor_count = int(
            session.query(func.count(func.distinct(SupportContribution.roll_number)))
            .filter(SupportContribution.action_type.in_(["click_amount", "submit"]))
            .scalar() or 0
        )
        
        # Total amount (sum of all confirmed contributions with amounts)
        total_amount = int(
            session.query(func.sum(SupportContribution.amount))
            .filter(
                SupportContribution.status == "confirmed",
                SupportContribution.amount.isnot(None)
            )
            .scalar() or 0
        )
        
        return {
            "contributors_this_month": contributor_count,
            "total_amount": total_amount
        }


def has_user_seen_thank_you(roll_number: str) -> bool:
    """
    Check if the user has already been thanked (seen the thank you modal).
    Returns True if they have a 'thanked' or 'confirmed' contribution.
    """
    with SessionLocal() as session:
        thanked = (
            session.query(SupportContribution)
            .filter(
                SupportContribution.roll_number == roll_number,
                SupportContribution.status.in_(["thanked", "confirmed"])
            )
            .first()
        )
        return thanked is not None


def get_all_contributions(limit: int = 100, offset: int = 0) -> list[dict]:
    """
    Get all contributions for admin review (paginated).
    """
    with SessionLocal() as session:
        contributions = (
            session.query(SupportContribution)
            .order_by(SupportContribution.created_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )
        
        return [
            {
                "id": c.id,
                "roll_number": c.roll_number,
                "amount": c.amount,
                "utr_reference": c.utr_reference,
                "card_style": c.card_style,
                "action_type": c.action_type,
                "status": c.status,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in contributions
        ]


def update_contribution_status(contribution_id: int, status: str, utr_reference: str | None = None) -> dict | None:
    """
    Admin: Update contribution status (confirm payment, add UTR).
    """
    if status not in ["pending", "thanked", "confirmed"]:
        raise ValueError("Invalid status")
    
    with SessionLocal() as session:
        contribution = session.query(SupportContribution).filter(SupportContribution.id == contribution_id).first()
        if not contribution:
            return None
        
        contribution.status = status
        contribution.updated_at = datetime.utcnow()
        
        if utr_reference:
            contribution.utr_reference = utr_reference
        
        session.commit()
        session.refresh(contribution)
        
        return {
            "id": contribution.id,
            "roll_number": contribution.roll_number,
            "amount": contribution.amount,
            "utr_reference": contribution.utr_reference,
            "status": contribution.status,
            "updated_at": contribution.updated_at.isoformat() if contribution.updated_at else None,
        }
