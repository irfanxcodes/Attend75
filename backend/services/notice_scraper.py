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

    if len(html) < 200:
        logger.warning("Notice.aspx returned suspiciously short response (%d bytes)", len(html))
        return []

    # Check for Bootstrap card layout with no table — portal session expired/redirected
    # The portal returns a small Bootstrap-based card page (~2800 bytes) when session is stale
    from bs4 import BeautifulSoup as _BS
    _quick_soup = _BS(html, "html.parser")
    _tables = _quick_soup.find_all("table")
    _has_card = _quick_soup.find(class_="card-body") or _quick_soup.find(class_="card-block")
    if len(_tables) == 0 and _has_card:
        logger.warning("Notice.aspx returned Bootstrap card page with no table (session likely stale, page_len=%d)", len(html))
        return []

    return _parse_notice_table(html)


def _parse_notice_table(html: str) -> list[dict]:
    """Parse the notice board HTML table into a list of notice dicts."""
    soup = BeautifulSoup(html, "html.parser")

    # Strategy 1: Find table by ID (common portal pattern)
    table = soup.find("table", {"id": "table"})

    # Strategy 2: Find any table with "NoticeID" links
    if not table:
        for t in soup.find_all("table"):
            if t.find("a", href=lambda h: h and "NoticeID" in str(h)):
                table = t
                break

    # Strategy 3: Find first table with enough rows
    if not table:
        for t in soup.find_all("table"):
            rows = t.find_all("tr")
            if len(rows) >= 3:  # At least header + 2 data rows
                table = t
                break

    # Strategy 4: Generic first table (original fallback)
    if not table:
        table = soup.find("table")

    if not table:
        # Log page structure hints for debugging
        all_tables = soup.find_all("table")
        all_divs_with_class = [(d.get("class", []), d.get("id", "")) for d in soup.find_all(class_=True)][:5]
        logger.warning("No notice table found on Notice.aspx (tables=%d, page_len=%d, sample_elements=%s)", len(all_tables), len(html), all_divs_with_class)
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
