"""
Payload Builder — Single source of truth for constructing Notification_Payload dicts.

Every notification dispatcher (notice, deadline, timetable, attendance, digest,
weekly summary, nudge, broadcast, marks) funnels through build_payload() so the
4KB size cap (Req 7.2) and category/priority conventions are enforced in one place.

Valid category strings: "notice", "attendance", "timetable", "digest",
"weekly_summary", "nudge", "broadcast", "marks", "relink"
"""

import json

# TTL (seconds) by priority — Req 7.4
CATEGORY_TTL_SECONDS = {
    "standard": 24 * 3600,
    "high": 48 * 3600,
}

MAX_PAYLOAD_BYTES = 4096

DEFAULT_ICON = "/icons/icon-192.png"
DEFAULT_BADGE = "/icons/badge-72.png"

# Priority order used for batch consolidation (Req 3.3) — higher score = higher priority
CATEGORY_PRIORITY_ORDER = [
    "Exam",
    "Fee",
    "Academic",
    "Internship",
    "Event",
    "Guest Lecture",
    "General",
]


def is_high_priority(category: str | None, notice_priority: int | None = None) -> bool:
    """
    A notice is high-priority if its category is "Exam" OR its numeric priority
    score is greater than 60 (Req 3.4 / Property 11).
    """
    if category == "Exam":
        return True
    if notice_priority is not None and notice_priority > 60:
        return True
    return False


def notice_deep_link(notice_id: int) -> str:
    return f"/app/notices?open={notice_id}"


def highest_priority_category(categories: list[str]) -> str:
    """
    Given a list of notice categories, return the one that ranks highest per
    CATEGORY_PRIORITY_ORDER. Unknown categories are treated as lowest priority
    (ranked after "General").
    """
    if not categories:
        return "General"

    def rank(cat: str) -> int:
        try:
            return CATEGORY_PRIORITY_ORDER.index(cat)
        except ValueError:
            return len(CATEGORY_PRIORITY_ORDER)

    return min(categories, key=rank)


def _truncate_to_fit(payload: dict, max_bytes: int = MAX_PAYLOAD_BYTES) -> dict:
    """
    If the serialized payload exceeds max_bytes, progressively truncate the
    "body" field (preserving title/deepLink/category which are small and
    required for the client to render/act) until it fits.
    """
    serialized = json.dumps(payload)
    if len(serialized.encode("utf-8")) <= max_bytes:
        return payload

    body = payload.get("body", "")
    # Binary-search-ish shrink: repeatedly cut body in chunks until it fits.
    low, high = 0, len(body)
    best = ""
    while low <= high:
        mid = (low + high) // 2
        candidate = dict(payload)
        candidate["body"] = body[:mid] + ("..." if mid < len(body) else "")
        candidate_size = len(json.dumps(candidate).encode("utf-8"))
        if candidate_size <= max_bytes:
            best = candidate["body"]
            low = mid + 1
        else:
            high = mid - 1

    payload = dict(payload)
    payload["body"] = best
    return payload


def build_payload(
    category: str,
    title: str,
    body: str,
    deep_link: str | None = None,
    priority: str = "standard",
    icon: str = DEFAULT_ICON,
    badge: str = DEFAULT_BADGE,
    actions: list[dict] | None = None,
) -> dict:
    """
    Build a Notification_Payload dict, guaranteed to serialize to <= 4096 bytes.

    Required fields are always present: category, title, body, priority, icon, badge.
    deepLink and actions are optional (None / [] when not applicable).
    """
    payload = {
        "category": category,
        "title": title,
        "body": body or "",
        "deepLink": deep_link,
        "priority": priority if priority in CATEGORY_TTL_SECONDS else "standard",
        "icon": icon,
        "badge": badge,
        "actions": actions or [],
    }
    return _truncate_to_fit(payload)
