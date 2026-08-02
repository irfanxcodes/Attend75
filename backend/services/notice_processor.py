"""
Notice Processor — PDF extraction and metadata generation pipeline.

Downloads PDFs to memory, extracts text via pdfplumber, generates all metadata,
stores in DB, discards PDF bytes. Never writes PDFs to disk.
"""

import io
import logging
from datetime import datetime

from db.models.notice import Notice
from db.session import SessionLocal
from scrapers.portal_scraper import PortalScraper
from services.notice_classifier import (
    classify,
    clean_text,
    detect_deadline,
    detect_program,
    detect_target_semesters,
    extract_keywords,
    generate_summary,
    score_priority,
)

logger = logging.getLogger(__name__)


def _extract_page_with_tables(page) -> str:
    """
    Extract text from a pdfplumber page, rendering tables as ASCII tables.
    Non-table text is extracted normally. Tables get column-aligned formatting.
    """
    tables = page.find_tables()
    if not tables:
        # No tables on this page — plain extraction
        return page.extract_text() or ""

    # Collect table bounding boxes so we can exclude them from plain text
    table_bboxes = []
    for table in tables:
        if table.bbox:
            table_bboxes.append(table.bbox)

    # Extract text outside tables
    page_without_tables = page
    for bbox in table_bboxes:
        page_without_tables = page_without_tables.outside_bbox(bbox)

    non_table_text = page_without_tables.extract_text() or ""

    # Build ASCII tables
    ascii_tables = []
    for table in tables:
        rows = table.extract()
        if not rows:
            continue
        ascii_tables.append(_rows_to_ascii_table(rows))

    # Combine: non-table text first, then tables
    parts = []
    if non_table_text.strip():
        parts.append(non_table_text.strip())
    for t in ascii_tables:
        parts.append(t)

    return "\n\n".join(parts)


def _rows_to_ascii_table(rows: list[list[str | None]]) -> str:
    """Convert a list of rows (each row is a list of cell strings) to an ASCII table."""
    if not rows:
        return ""

    # Normalize cells: replace None with empty, strip whitespace, collapse newlines within cells
    cleaned_rows = []
    for row in rows:
        cleaned_row = []
        for cell in row:
            if cell is None:
                cleaned_row.append("")
            else:
                # Collapse internal newlines to space
                cleaned_row.append(" ".join(str(cell).split()))
        cleaned_rows.append(cleaned_row)

    # Determine max columns (some rows may have fewer)
    max_cols = max(len(r) for r in cleaned_rows)

    # Pad rows to have equal columns
    for row in cleaned_rows:
        while len(row) < max_cols:
            row.append("")

    # Calculate column widths (cap at 60 to keep things readable; was 40 but
    # that truncated long faculty names and caused the ellipsis replacement in
    # clean_text to corrupt the stored text).
    col_widths = []
    for col_idx in range(max_cols):
        max_w = max(len(row[col_idx]) for row in cleaned_rows)
        col_widths.append(min(max_w, 60))

    # Truncate cells that exceed column width — use plain ASCII "~" so that
    # clean_text (which strips non-ASCII) does not replace it with a space and
    # create spurious cell content.
    for row in cleaned_rows:
        for i, cell in enumerate(row):
            if len(cell) > col_widths[i]:
                row[i] = cell[:col_widths[i] - 1] + "~"

    # Build the table
    def separator():
        return "+" + "+".join("-" * (w + 2) for w in col_widths) + "+"

    def format_row(row):
        cells = []
        for i, cell in enumerate(row):
            cells.append(f" {cell:<{col_widths[i]}} ")
        return "|" + "|".join(cells) + "|"

    lines = [separator()]
    for idx, row in enumerate(cleaned_rows):
        lines.append(format_row(row))
        # Add separator after header row (first row) and at the end
        if idx == 0:
            lines.append(separator())
    lines.append(separator())

    return "\n".join(lines)


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

        # Skip PDFs larger than 5MB to avoid OOM on small servers
        if len(response.content) > 5 * 1024 * 1024:
            logger.warning("PDF too large for notice %d: %d bytes, skipping extraction", notice_id, len(response.content))
            extracted_text = ""
        else:
            pdf_bytes = io.BytesIO(response.content)

            # Step 2: Extract text via pdfplumber (with table detection)
            import pdfplumber
            extracted_text = ""
            try:
                with pdfplumber.open(pdf_bytes) as pdf:
                    # Limit to first 10 pages to control memory
                    for page in pdf.pages[:10]:
                        page_text = _extract_page_with_tables(page)
                        if page_text:
                            extracted_text += page_text + "\n"
            except Exception as exc:
                logger.warning("pdfplumber failed for notice %d: %s", notice_id, exc)

            # Step 3: Discard PDF bytes
            del pdf_bytes

        # Free the response body
        del response

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

        # Step 9b: Detect target semesters from title and text
        target_semesters = detect_target_semesters(title, cleaned)

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
            target_semesters=target_semesters,
            confidence_score=confidence_score,
            pdf_url_path=pdf_url_path,
            source_program=source_program,
        )

        return True

    except Exception as exc:
        logger.exception("Unexpected error processing notice %d: %s", notice_id, exc)
        _mark_failed(notice_id, title, portal_date, pdf_url_path, source_program)
        return False


def process_batch(notices: list[dict], scraper: PortalScraper, source_program: str | None = None, max_workers: int = 1, max_notices: int = 15) -> int:
    """
    Process notices sequentially to avoid OOM on small servers.
    Caps batch at max_notices to prevent long-running operations.
    Returns count of successfully processed notices.
    """
    if not notices:
        return 0

    # Cap the batch size to avoid OOM and long blocking
    batch = notices[:max_notices]
    success_count = 0

    for n in batch:
        try:
            if process_notice(
                notice_id=n["notice_id"],
                title=n["title"],
                portal_date=n["portal_date"],
                pdf_url_path=n["pdf_url_path"],
                scraper=scraper,
                source_program=source_program,
            ):
                success_count += 1
        except Exception as exc:
            logger.error("Notice %d processing raised: %s", n["notice_id"], exc)

    logger.info("Batch processed: %d/%d notices successful (capped at %d)", success_count, len(batch), max_notices)
    return success_count


def _store_notice(*, notice_id, title, portal_date, category, category_confidence, summary,
                  extracted_text, cleaned_text, keywords, deadline, deadline_raw, priority,
                  is_important, target_program, target_semesters, confidence_score, pdf_url_path, source_program):
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
            existing.target_semesters = target_semesters
            existing.confidence_score = confidence_score
            existing.processing_status = "done"
            existing.source_program = source_program
            existing.updated_at = now
            # Preserve notification_sent_at — if it was already stamped, keep it.
            # If it's still NULL on an existing notice, stamp it now to prevent
            # re-dispatching a notice that was processed before the notification
            # system existed (or was previously failed and retried).
            if existing.notification_sent_at is None:
                existing.notification_sent_at = now
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
                target_semesters=target_semesters,
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
            # Stamp notification_sent_at so the dispatcher never sends a
            # notification for a failed (unparseable) notice.
            if existing.notification_sent_at is None:
                existing.notification_sent_at = now
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
