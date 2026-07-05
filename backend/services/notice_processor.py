"""
Notice Processor — PDF extraction and metadata generation pipeline.

Downloads PDFs to memory, extracts text via pdfplumber, generates all metadata,
stores in DB, discards PDF bytes. Never writes PDFs to disk.
"""

import io
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

from db.models.notice import Notice
from db.session import SessionLocal
from scrapers.portal_scraper import PortalScraper
from services.notice_classifier import (
    classify,
    clean_text,
    detect_deadline,
    detect_program,
    extract_keywords,
    generate_summary,
    score_priority,
)

logger = logging.getLogger(__name__)


def process_notice(notice_id: int, title: str, portal_date, pdf_url_path: str, scraper: PortalScraper, source_program: str | None = None) -> bool:
    """
    Full processing pipeline for a single notice.
    Downloads PDF to memory, extracts text, generates metadata, stores in DB.
    Returns True on success, False on failure.
    """
    try:
        # Step 1: Download PDF to memory
        pdf_url = f"{scraper.base_url.rstrip('/')}/{pdf_url_path}"
        response = scraper.session.get(pdf_url, timeout=15)
        if response.status_code != 200:
            logger.warning("PDF download failed for notice %d: HTTP %d", notice_id, response.status_code)
            _mark_failed(notice_id, title, portal_date, pdf_url_path, source_program)
            return False

        pdf_bytes = io.BytesIO(response.content)

        # Step 2: Extract text via pdfplumber
        import pdfplumber
        extracted_text = ""
        try:
            with pdfplumber.open(pdf_bytes) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        extracted_text += page_text + "\n"
        except Exception as exc:
            logger.warning("pdfplumber failed for notice %d: %s", notice_id, exc)

        # Step 3: Discard PDF bytes
        del pdf_bytes

        # Step 4: Clean text
        cleaned = clean_text(extracted_text)

        # Step 5: Classify category
        category, category_confidence = classify(title, cleaned)

        # Step 6: Detect deadline
        deadline, deadline_raw = detect_deadline(cleaned)

        # Step 7: Score priority
        priority = score_priority(title, cleaned, deadline)
        is_important = priority > 60

        # Step 8: Generate summary
        summary = generate_summary(cleaned, title, category)

        # Step 9: Detect program
        target_program, confidence_score = detect_program(title, cleaned, source_program)

        # Step 10: Extract keywords
        keywords = extract_keywords(title, cleaned, category)

        # Step 11: Store in DB
        _store_notice(
            notice_id=notice_id,
            title=title,
            portal_date=portal_date,
            category=category,
            category_confidence=category_confidence,
            summary=summary,
            extracted_text=extracted_text,
            cleaned_text=cleaned,
            keywords=keywords,
            deadline=deadline,
            deadline_raw=deadline_raw,
            priority=priority,
            is_important=is_important,
            target_program=target_program,
            confidence_score=confidence_score,
            pdf_url_path=pdf_url_path,
            source_program=source_program,
        )

        return True

    except Exception as exc:
        logger.exception("Unexpected error processing notice %d: %s", notice_id, exc)
        _mark_failed(notice_id, title, portal_date, pdf_url_path, source_program)
        return False


def process_batch(notices: list[dict], scraper: PortalScraper, source_program: str | None = None, max_workers: int = 4) -> int:
    """
    Process multiple notices in parallel.
    Returns count of successfully processed notices.
    """
    if not notices:
        return 0

    success_count = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {}
        for n in notices:
            future = executor.submit(
                process_notice,
                notice_id=n["notice_id"],
                title=n["title"],
                portal_date=n["portal_date"],
                pdf_url_path=n["pdf_url_path"],
                scraper=scraper,
                source_program=source_program,
            )
            futures[future] = n["notice_id"]

        for future in as_completed(futures):
            nid = futures[future]
            try:
                if future.result():
                    success_count += 1
            except Exception as exc:
                logger.error("Notice %d processing raised: %s", nid, exc)

    logger.info("Batch processed: %d/%d notices successful", success_count, len(notices))
    return success_count


def _store_notice(*, notice_id, title, portal_date, category, category_confidence, summary,
                  extracted_text, cleaned_text, keywords, deadline, deadline_raw, priority,
                  is_important, target_program, confidence_score, pdf_url_path, source_program):
    """Insert or update a notice in the database."""
    now = datetime.utcnow()
    with SessionLocal() as session:
        existing = session.query(Notice).filter(Notice.notice_id == notice_id).one_or_none()
        if existing:
            existing.title = title
            existing.category = category
            existing.category_confidence = category_confidence
            existing.summary = summary
            existing.extracted_text = extracted_text
            existing.cleaned_text = cleaned_text
            existing.keywords = keywords
            existing.deadline = deadline
            existing.deadline_raw = deadline_raw
            existing.priority = priority
            existing.is_important = is_important
            existing.target_program = target_program
            existing.confidence_score = confidence_score
            existing.processing_status = "done"
            existing.source_program = source_program
            existing.updated_at = now
        else:
            notice = Notice(
                notice_id=notice_id,
                title=title,
                portal_date=portal_date,
                category=category,
                category_confidence=category_confidence,
                summary=summary,
                extracted_text=extracted_text,
                cleaned_text=cleaned_text,
                keywords=keywords,
                deadline=deadline,
                deadline_raw=deadline_raw,
                priority=priority,
                is_important=is_important,
                target_program=target_program,
                confidence_score=confidence_score,
                viewed_count=0,
                pdf_url_path=pdf_url_path,
                processing_status="done",
                processing_version=1,
                source_program=source_program,
                created_at=now,
                updated_at=now,
            )
            session.add(notice)
        session.commit()


def _mark_failed(notice_id, title, portal_date, pdf_url_path, source_program):
    """Mark a notice as failed in the database."""
    now = datetime.utcnow()
    with SessionLocal() as session:
        existing = session.query(Notice).filter(Notice.notice_id == notice_id).one_or_none()
        if existing:
            existing.processing_status = "failed"
            existing.updated_at = now
        else:
            notice = Notice(
                notice_id=notice_id,
                title=title,
                portal_date=portal_date,
                pdf_url_path=pdf_url_path,
                processing_status="failed",
                source_program=source_program,
                created_at=now,
                updated_at=now,
            )
            session.add(notice)
        session.commit()
