"""
Notice Scraper — Fetches Notice.aspx and parses the notice list.
"""

import logging
import re
from datetime import date, datetime

from bs4 import BeautifulSoup

from scrapers.portal_scraper import PortalScraper

logger = logging.getLogger(__name__)


def scrape_notice_list(scraper: PortalScraper) -> list[dict]:
    """
    Fetch Notice.aspx using the scraper's authenticated session.
    Returns list of {notice_id, title, portal_date, viewed, pdf_url_path}.
    """
    notice_url = scraper._build_url("Notice.aspx")

    try:
        response = scraper.session.get(
            notice_url,
            timeout=scraper.request_timeout,
            headers={"Referer": scraper._build_url("Index.aspx")},
        )
        response.raise_for_status()
    except Exception as exc:
        logger.error("Failed to fetch Notice.aspx: %s", exc)
        return []

    html = response.text
    if scraper._looks_like_login_page(html):
        logger.warning("Notice.aspx returned login page — session likely expired")
        return []

    return _parse_notice_table(html)


def _parse_notice_table(html: str) -> list[dict]:
    """Parse the notice board HTML table into a list of notice dicts."""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")
    if not table:
        logger.warning("No table found on Notice.aspx")
        return []

    rows = table.find_all("tr")[1:]  # skip header
    notices = []

    for row in rows:
        cells = row.find_all("td")
        if len(cells) < 4:
            continue

        # Column 1: serial (skip)
        # Column 2: notice title + link
        link_tag = cells[1].find("a")
        if not link_tag:
            continue

        title = link_tag.get_text(strip=True)
        href = link_tag.get("href", "")

        # Extract NoticeID from href
        nid_match = re.search(r"NoticeID=(\d+)", href)
        if not nid_match:
            continue
        notice_id = int(nid_match.group(1))

        # Column 3: viewed status (✓ or ✗)
        viewed_html = str(cells[2])
        viewed = "check" in viewed_html.lower() or "✓" in viewed_html or "text-success" in viewed_html

        # Column 4: date (DD/MM/YYYY)
        date_text = cells[3].get_text(strip=True)
        portal_date = _parse_date(date_text)

        # PDF URL path
        pdf_url_path = f"Notice/{notice_id}.pdf"

        notices.append({
            "notice_id": notice_id,
            "title": title,
            "portal_date": portal_date,
            "viewed": viewed,
            "pdf_url_path": pdf_url_path,
        })

    return notices


def _parse_date(date_str: str) -> date:
    """Parse DD/MM/YYYY date string."""
    try:
        return datetime.strptime(date_str.strip(), "%d/%m/%Y").date()
    except (ValueError, AttributeError):
        return date.today()
