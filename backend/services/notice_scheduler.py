"""
Notice Scheduler — Periodic background notice scraping every 30 minutes.
"""

import logging
import threading
import time

from db.models.notice import Notice
from db.session import SessionLocal
from services.notice_processor import process_batch
from services.notice_scraper import scrape_notice_list
from services.session_store import session_store

logger = logging.getLogger(__name__)

_INTERVAL_SECONDS = 1800  # 30 minutes


class NoticeScheduler:
    def __init__(self):
        self._running = False
        self._lock = threading.Lock()
        self._timer: threading.Timer | None = None
        self._scrape_in_progress = False

    def start(self):
        """Start the periodic scrape loop."""
        self._running = True
        self._schedule_next()
        logger.info("NoticeScheduler started (interval=%ds)", _INTERVAL_SECONDS)

    def stop(self):
        """Stop the scheduler gracefully."""
        self._running = False
        if self._timer:
            self._timer.cancel()
        logger.info("NoticeScheduler stopped")

    @property
    def is_scraping(self) -> bool:
        return self._scrape_in_progress

    def _schedule_next(self):
        if not self._running:
            return
        self._timer = threading.Timer(_INTERVAL_SECONDS, self._run_cycle)
        self._timer.daemon = True
        self._timer.start()

    def _run_cycle(self):
        """Run one scrape cycle, then schedule the next."""
        try:
            self._execute_scrape()
        except Exception as exc:
            logger.exception("NoticeScheduler cycle failed: %s", exc)
        finally:
            self._schedule_next()

    def _execute_scrape(self):
        """Pick one active session per program and scrape notices for each."""
        with self._lock:
            if self._scrape_in_progress:
                logger.debug("Scrape already in progress, skipping")
                return
            self._scrape_in_progress = True

        try:
            # Group active sessions by program
            sessions_by_program = {}
            now = __import__('time').time()
            with session_store._lock:
                for r in session_store._sessions.values():
                    prog = r.program_full or r.program_sn or "unknown"
                    if prog not in sessions_by_program:
                        sessions_by_program[prog] = r

            if not sessions_by_program:
                logger.debug("No active sessions available for notice scraping")
                return

            for prog, record in sessions_by_program.items():
                try:
                    scraper = record.scraper
                    source_program = record.program_full or record.program_sn

                    notices = scrape_notice_list(scraper)
                    if not notices:
                        continue

                    new_notices = _filter_new_notices(notices)
                    if not new_notices:
                        continue

                    logger.info("Scheduled scrape found %d new notices for program=%s", len(new_notices), prog)
                    with record.scraper_lock:
                        process_batch(new_notices, scraper, source_program=source_program)
                    # Dispatch push notifications for newly processed notices
                    try:
                        from services.notice_dispatcher import dispatch_for_new_notices
                        processed_ids = [n["notice_id"] for n in new_notices]
                        dispatch_for_new_notices(processed_ids)
                    except Exception as dispatch_exc:
                        logger.warning("Notice dispatch failed for program=%s: %s", prog, dispatch_exc)
                except Exception as exc:
                    logger.warning("Scheduled scrape failed for program=%s: %s", prog, exc)

        finally:
            self._scrape_in_progress = False

    def trigger_immediate(self, scraper, source_program: str | None = None) -> dict:
        """Trigger an immediate scrape (called from API endpoint)."""
        with self._lock:
            if self._scrape_in_progress:
                return {"status": "in_progress", "message": "Scrape already running"}
            self._scrape_in_progress = True

        try:
            notices = scrape_notice_list(scraper)
            if not notices:
                return {"status": "done", "new_count": 0, "message": "No notices found"}

            new_notices = _filter_new_notices(notices)
            if not new_notices:
                return {"status": "done", "new_count": 0, "message": "All notices already processed"}

            count = process_batch(new_notices, scraper, source_program=source_program)
            # Dispatch push notifications for newly processed notices
            try:
                from services.notice_dispatcher import dispatch_for_new_notices
                processed_ids = [n["notice_id"] for n in new_notices]
                dispatch_for_new_notices(processed_ids)
            except Exception as dispatch_exc:
                logger.warning("Notice dispatch failed on immediate scrape: %s", dispatch_exc)
            return {"status": "done", "new_count": count, "message": f"{count} new notices processed"}
        finally:
            self._scrape_in_progress = False


def _filter_new_notices(notices: list[dict]) -> list[dict]:
    """Return only notices not yet in the database."""
    notice_ids = [n["notice_id"] for n in notices]
    with SessionLocal() as session:
        existing_ids = set(
            row[0] for row in
            session.query(Notice.notice_id)
            .filter(Notice.notice_id.in_(notice_ids))
            .filter(Notice.processing_status == "done")
            .all()
        )
    return [n for n in notices if n["notice_id"] not in existing_ids]


# Global scheduler instance
notice_scheduler = NoticeScheduler()
