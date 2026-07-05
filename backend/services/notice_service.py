"""
Notice Service — Orchestrator for notice API operations.
"""

import logging
from datetime import datetime

from sqlalchemy import and_, func, or_

from db.models.notice import Notice
from db.models.student_registry import StudentRegistry
from db.models.user_notice import UserNotice
from db.session import SessionLocal
from services.session_store import session_store

logger = logging.getLogger(__name__)


def get_student_program(roll_number: str) -> str | None:
    """Look up the student's program from student_registry."""
    with SessionLocal() as session:
        record = session.query(StudentRegistry.program).filter(
            StudentRegistry.roll_number == roll_number
        ).one_or_none()
        return record.program if record else None


def fetch_notices_for_user(
    token: str,
    limit: int = 10,
    offset: int = 0,
    category: str | None = None,
    include_dismissed: bool = False,
) -> dict:
    """Fetch paginated notices filtered by student's program."""
    record = session_store.get(token)
    if record is None:
        raise PermissionError("Session expired")

    roll_number = record.roll_number
    program = get_student_program(roll_number) or record.program_full or record.program_sn

    with SessionLocal() as session:
        query = session.query(Notice).filter(Notice.processing_status == "done")

        # No program filter needed — notices are scraped from the student's
        # authenticated portal session which already returns only their notices.

        # Category filter
        if category and category != "All":
            query = query.filter(Notice.category == category)

        # Dismiss filter
        if not include_dismissed:
            dismissed_ids = (
                session.query(UserNotice.notice_id)
                .filter(UserNotice.user_id == roll_number, UserNotice.dismissed == True)
                .subquery()
            )
            query = query.filter(~Notice.notice_id.in_(dismissed_ids))

        total = query.count()
        notices = (
            query.order_by(Notice.notice_id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        # Get user interaction states
        notice_ids = [n.notice_id for n in notices]
        user_states = {}
        if notice_ids:
            user_notice_rows = (
                session.query(UserNotice)
                .filter(UserNotice.user_id == roll_number, UserNotice.notice_id.in_(notice_ids))
                .all()
            )
            for un in user_notice_rows:
                user_states[un.notice_id] = {
                    "bookmarked": un.bookmarked,
                    "dismissed": un.dismissed,
                    "opened": un.opened_at is not None,
                }

        result_notices = []
        for n in notices:
            state = user_states.get(n.notice_id, {})
            result_notices.append({
                "noticeId": n.notice_id,
                "title": n.title,
                "portalDate": n.portal_date.isoformat() if n.portal_date else None,
                "category": n.category,
                "categoryConfidence": n.category_confidence,
                "summary": n.summary,
                "deadline": n.deadline.isoformat() if n.deadline else None,
                "deadlineRaw": n.deadline_raw,
                "priority": n.priority,
                "isImportant": n.is_important,
                "keywords": n.keywords,
                "bookmarked": state.get("bookmarked", False),
                "dismissed": state.get("dismissed", False),
                "isRead": state.get("opened", False),
            })

    return {"notices": result_notices, "total": total, "limit": limit, "offset": offset}


def get_notice_detail(token: str, notice_id: int) -> dict | None:
    """Get full notice detail and mark as opened."""
    record = session_store.get(token)
    if record is None:
        raise PermissionError("Session expired")

    roll_number = record.roll_number
    now = datetime.utcnow()

    with SessionLocal() as session:
        notice = session.query(Notice).filter(Notice.notice_id == notice_id).one_or_none()
        if not notice:
            return None

        # Update viewed count
        notice.viewed_count += 1

        # Update user_notices
        user_notice = (
            session.query(UserNotice)
            .filter(UserNotice.user_id == roll_number, UserNotice.notice_id == notice_id)
            .one_or_none()
        )
        if user_notice:
            user_notice.last_viewed = now
            if not user_notice.opened_at:
                user_notice.opened_at = now
        else:
            user_notice = UserNotice(
                user_id=roll_number,
                notice_id=notice_id,
                opened_at=now,
                last_viewed=now,
                created_at=now,
            )
            session.add(user_notice)

        session.commit()

        return {
            "noticeId": notice.notice_id,
            "title": notice.title,
            "portalDate": notice.portal_date.isoformat() if notice.portal_date else None,
            "category": notice.category,
            "categoryConfidence": notice.category_confidence,
            "summary": notice.summary,
            "extractedText": notice.extracted_text,
            "cleanedText": notice.cleaned_text,
            "keywords": notice.keywords,
            "deadline": notice.deadline.isoformat() if notice.deadline else None,
            "deadlineRaw": notice.deadline_raw,
            "priority": notice.priority,
            "isImportant": notice.is_important,
            "targetProgram": notice.target_program,
            "pdfUrlPath": notice.pdf_url_path,
            "bookmarked": user_notice.bookmarked if user_notice else False,
            "dismissed": user_notice.dismissed if user_notice else False,
        }


def get_notice_stats(token: str) -> dict:
    """Get notice counts: unread, critical, bookmarked, dismissed, total."""
    record = session_store.get(token)
    if record is None:
        raise PermissionError("Session expired")

    roll_number = record.roll_number
    program = get_student_program(roll_number) or record.program_full or record.program_sn

    with SessionLocal() as session:
        base_query = session.query(Notice).filter(Notice.processing_status == "done")
        # No program filter — portal already shows only relevant notices per student

        total_all = base_query.count()

        # Get user interactions
        user_notices = (
            session.query(UserNotice)
            .filter(UserNotice.user_id == roll_number)
            .all()
        )
        read_ids = {un.notice_id for un in user_notices if un.opened_at}
        bookmarked_ids = {un.notice_id for un in user_notices if un.bookmarked}
        dismissed_ids = {un.notice_id for un in user_notices if un.dismissed}

        # All visible notice IDs
        visible_ids = {n.notice_id for n in base_query.all()}
        total = len(visible_ids - dismissed_ids)
        unread = len(visible_ids - read_ids - dismissed_ids)

        # Critical (priority > 60, not dismissed)
        critical = base_query.filter(Notice.priority > 60, ~Notice.notice_id.in_(dismissed_ids)).count()

    return {
        "unread": unread,
        "critical": critical,
        "bookmarked": len(bookmarked_ids & visible_ids),
        "dismissed": len(dismissed_ids & visible_ids),
        "total": total,
    }


def toggle_bookmark(token: str, notice_id: int) -> dict:
    """Toggle bookmark for a notice."""
    record = session_store.get(token)
    if record is None:
        raise PermissionError("Session expired")

    roll_number = record.roll_number
    now = datetime.utcnow()

    with SessionLocal() as session:
        user_notice = (
            session.query(UserNotice)
            .filter(UserNotice.user_id == roll_number, UserNotice.notice_id == notice_id)
            .one_or_none()
        )
        if user_notice:
            user_notice.bookmarked = not user_notice.bookmarked
            new_state = user_notice.bookmarked
        else:
            user_notice = UserNotice(
                user_id=roll_number,
                notice_id=notice_id,
                bookmarked=True,
                created_at=now,
            )
            session.add(user_notice)
            new_state = True
        session.commit()

    return {"bookmarked": new_state}


def dismiss_notice(token: str, notice_id: int) -> dict:
    """Dismiss a notice for a user."""
    record = session_store.get(token)
    if record is None:
        raise PermissionError("Session expired")

    roll_number = record.roll_number
    now = datetime.utcnow()

    with SessionLocal() as session:
        user_notice = (
            session.query(UserNotice)
            .filter(UserNotice.user_id == roll_number, UserNotice.notice_id == notice_id)
            .one_or_none()
        )
        if user_notice:
            user_notice.dismissed = True
        else:
            user_notice = UserNotice(
                user_id=roll_number,
                notice_id=notice_id,
                dismissed=True,
                created_at=now,
            )
            session.add(user_notice)
        session.commit()

    return {"dismissed": True}
