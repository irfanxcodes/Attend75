import logging
import re
from collections import defaultdict
from datetime import date

from sqlalchemy import func

from db.models.studyme_event import StudyMeEvent
from db.session import SessionLocal
from services.feedback_service import list_all_feedback
from services.session_store import session_store

logger = logging.getLogger(__name__)

STUDYME_EVENT_TYPES = {
    "studyme_opened",
    "studyme_subject_opened",
    "studyme_lesson_opened",
    "studyme_topic_opened",
    "studyme_pdf_opened",
    "studyme_pdf_page_next",
    "studyme_pdf_page_prev",
    "studyme_lesson_ai_opened",
    "studyme_lesson_ai_copied",
    "studyme_topic_prompt_copied",
    "studyme_lesson_completed",
    "studyme_lesson_important_toggled",
    "studyme_topic_important_toggled",
    "studyme_feedback_sent",
}

_FUNNEL_STEPS = [
    ("studyme_opened", "StudyMe opened"),
    ("studyme_lesson_opened", "Lesson opened"),
    ("studyme_topic_opened", "Topic opened"),
    ("studyme_pdf_opened", "PDF opened"),
    ("ai_prompt_used", "AI prompt used"),
    ("studyme_lesson_completed", "Lesson completed"),
]

_AI_USAGE_EVENTS = {
    "studyme_lesson_ai_opened",
    "studyme_lesson_ai_copied",
    "studyme_topic_prompt_copied",
}

_SUBJECT_KEYWORDS = {
    "financial management": ["financial management", "fm"],
    "marketing management": ["marketing management", "marketing"],
    "human resource management": ["human resource management", "hrm", "human resources"],
    "business statistics": ["business statistics", "statistics"],
    "business economics": ["business economics", "economics"],
    "management accounting": ["management accounting"],
    "financial accounting": ["financial accounting", "accounting"],
    "cost accounting": ["cost accounting"],
    "business law": ["business law", "law"],
    "operations management": ["operations management"],
    "organizational behavior": ["organizational behavior"],
    "research methodology": ["research methodology"],
    "entrepreneurship": ["entrepreneurship"],
    "taxation": ["taxation", "tax"],
    "business communication": ["business communication", "communication"],
    "computer applications": ["computer applications", "computer"],
}


def _normalize_text(value: str | None) -> str | None:
    cleaned = str(value or "").strip()
    return cleaned or None


def _normalize_event_type(event_type: str | None) -> str | None:
    normalized = str(event_type or "").strip().lower()
    if normalized not in STUDYME_EVENT_TYPES:
        return None
    return normalized


def _resolve_user_name(token: str | None, fallback_user_name: str | None) -> str | None:
    cleaned_token = str(token or "").strip()
    if cleaned_token:
        record = session_store.get(cleaned_token)
        if record is not None:
            return _normalize_text(record.user_name or record.roll_number)
    return _normalize_text(fallback_user_name)


def record_studyme_event(
    *,
    event_type: str,
    token: str | None = None,
    user_name: str | None = None,
    subject_name: str | None = None,
    lesson_name: str | None = None,
    topic_name: str | None = None,
    event_date: str | None = None,
) -> dict[str, str | None]:
    normalized_event_type = _normalize_event_type(event_type)
    if normalized_event_type is None:
        raise ValueError("Invalid StudyMe event type")

    resolved_event_date = date.today()
    if event_date:
        try:
            resolved_event_date = date.fromisoformat(str(event_date).strip())
        except ValueError:
            resolved_event_date = date.today()

    resolved_user_name = _resolve_user_name(token, user_name)

    with SessionLocal() as session:
        event = StudyMeEvent(
            event_type=normalized_event_type,
            user_name=resolved_user_name,
            subject_name=_normalize_text(subject_name),
            lesson_name=_normalize_text(lesson_name),
            topic_name=_normalize_text(topic_name),
            event_date=resolved_event_date,
        )
        session.add(event)
        session.commit()

    return {
        "event_type": normalized_event_type,
        "user_name": resolved_user_name,
        "subject_name": _normalize_text(subject_name),
        "lesson_name": _normalize_text(lesson_name),
        "topic_name": _normalize_text(topic_name),
        "event_date": resolved_event_date.isoformat(),
    }


def _extract_requested_subjects(feedback_items: list[dict[str, str]]) -> list[dict[str, str | int | None]]:
    subject_stats: dict[str, dict[str, object]] = {}

    for item in feedback_items:
        message = str(item.get("message") or "").lower()
        if not message:
            continue

        semester_match = re.search(r"\bsemester\s*([1-8])\b", message)
        semester_label = f"Semester {semester_match.group(1)}" if semester_match else None

        for subject_name, aliases in _SUBJECT_KEYWORDS.items():
            if not any(alias in message for alias in aliases):
                continue

            bucket = subject_stats.setdefault(subject_name, {"count": 0, "semesters": defaultdict(int)})
            bucket["count"] = int(bucket["count"]) + 1
            if semester_label:
                bucket["semesters"][semester_label] += 1

    items: list[dict[str, str | int | None]] = []
    for subject_name, stats in subject_stats.items():
        semester_counts = stats.get("semesters") or {}
        top_semester = None
        if semester_counts:
            top_semester = max(semester_counts.items(), key=lambda item: (item[1], item[0]))[0]

        items.append(
            {
                "subjectName": subject_name.title(),
                "count": int(stats.get("count") or 0),
                "semester": top_semester,
            }
        )

    items.sort(key=lambda item: (-int(item["count"]), str(item["subjectName"])))
    return items


def _group_feedback_categories(feedback_items: list[dict[str, str]]) -> list[dict[str, str | int]]:
    category_rules = [
        ("Subject Requests", ["subject", "add", "next subject", "please add", "include"]),
        ("AI Improvements", ["ai", "prompt", "chatgpt"]),
        ("PDF Experience", ["pdf", "page", "viewer"]),
        ("Lesson Content", ["lesson", "topic", "studyme"]),
        ("Bugs / Issues", ["bug", "issue", "error", "broken", "not working"]),
    ]
    counts: dict[str, int] = defaultdict(int)

    for item in feedback_items:
        message = str(item.get("message") or "").lower()
        if not message:
            continue

        matched_category = "Other"
        for category, keywords in category_rules:
            if any(keyword in message for keyword in keywords):
                matched_category = category
                break
        counts[matched_category] += 1

    grouped = [
        {"category": category, "count": count}
        for category, count in counts.items()
    ]
    grouped.sort(key=lambda item: (-int(item["count"]), str(item["category"])))
    return grouped


def _common_feedback_suggestions(feedback_items: list[dict[str, str]]) -> list[dict[str, str | int]]:
    counts: dict[str, int] = defaultdict(int)

    for item in feedback_items:
        message = re.sub(r"\s+", " ", str(item.get("message") or "").strip())
        normalized = re.sub(r"[^a-z0-9\s]", "", message.lower())
        if len(normalized) < 12:
            continue
        counts[normalized] += 1

    suggestions = [
        {"suggestion": original, "count": count}
        for original, count in counts.items()
    ]
    suggestions.sort(key=lambda item: (-int(item["count"]), str(item["suggestion"])))
    return suggestions[:5]


def get_studyme_analytics() -> dict:
    today = date.today()

    with SessionLocal() as session:
        events = session.query(StudyMeEvent).order_by(StudyMeEvent.created_at.asc()).all()

        total_users = int(
            session.query(func.count(func.distinct(StudyMeEvent.user_name)))
            .filter(StudyMeEvent.user_name.isnot(None))
            .scalar()
            or 0
        )
        users_today = int(
            session.query(func.count(func.distinct(StudyMeEvent.user_name)))
            .filter(StudyMeEvent.user_name.isnot(None))
            .filter(StudyMeEvent.event_date == today)
            .scalar()
            or 0
        )

    event_counts: dict[str, int] = defaultdict(int)
    lesson_buckets: dict[str, dict[str, object]] = {}
    topic_buckets: dict[tuple[str, str], dict[str, object]] = {}
    pdf_by_lesson: dict[str, int] = defaultdict(int)

    for event in events:
        event_counts[event.event_type] += 1

        lesson_name = _normalize_text(event.lesson_name)
        topic_name = _normalize_text(event.topic_name)
        user_name = _normalize_text(event.user_name)

        if lesson_name:
            lesson_bucket = lesson_buckets.setdefault(
                lesson_name,
                {
                    "lessonName": lesson_name,
                    "totalOpens": 0,
                    "uniqueUsers": set(),
                    "completionCount": 0,
                    "aiPromptUsageCount": 0,
                    "topicPromptCopyCount": 0,
                    "pdfOpenCount": 0,
                    "importantVotesCount": 0,
                },
            )

            if event.event_type == "studyme_lesson_opened":
                lesson_bucket["totalOpens"] = int(lesson_bucket["totalOpens"]) + 1
                if user_name:
                    lesson_bucket["uniqueUsers"].add(user_name)
            elif event.event_type == "studyme_lesson_completed":
                lesson_bucket["completionCount"] = int(lesson_bucket["completionCount"]) + 1
            elif event.event_type in {"studyme_lesson_ai_opened", "studyme_lesson_ai_copied"}:
                lesson_bucket["aiPromptUsageCount"] = int(lesson_bucket["aiPromptUsageCount"]) + 1
            elif event.event_type == "studyme_topic_prompt_copied":
                lesson_bucket["topicPromptCopyCount"] = int(lesson_bucket["topicPromptCopyCount"]) + 1
            elif event.event_type == "studyme_pdf_opened":
                lesson_bucket["pdfOpenCount"] = int(lesson_bucket["pdfOpenCount"]) + 1
                pdf_by_lesson[lesson_name] += 1
            elif event.event_type == "studyme_lesson_important_toggled":
                lesson_bucket["importantVotesCount"] = int(lesson_bucket["importantVotesCount"]) + 1

        if lesson_name and topic_name:
            topic_bucket = topic_buckets.setdefault(
                (lesson_name, topic_name),
                {
                    "topicName": topic_name,
                    "parentLesson": lesson_name,
                    "topicOpens": 0,
                    "pdfOpens": 0,
                    "promptCopies": 0,
                    "importantVotes": 0,
                },
            )

            if event.event_type == "studyme_topic_opened":
                topic_bucket["topicOpens"] = int(topic_bucket["topicOpens"]) + 1
            elif event.event_type == "studyme_pdf_opened":
                topic_bucket["pdfOpens"] = int(topic_bucket["pdfOpens"]) + 1
            elif event.event_type == "studyme_topic_prompt_copied":
                topic_bucket["promptCopies"] = int(topic_bucket["promptCopies"]) + 1
            elif event.event_type == "studyme_topic_important_toggled":
                topic_bucket["importantVotes"] = int(topic_bucket["importantVotes"]) + 1

    lesson_rows = []
    for bucket in lesson_buckets.values():
        total_opens = int(bucket["totalOpens"])
        completions = int(bucket["completionCount"])
        lesson_rows.append(
            {
                "lessonName": bucket["lessonName"],
                "totalOpens": total_opens,
                "uniqueUsers": len(bucket["uniqueUsers"]),
                "completionCount": completions,
                "aiPromptUsageCount": int(bucket["aiPromptUsageCount"]),
                "topicPromptCopyCount": int(bucket["topicPromptCopyCount"]),
                "pdfOpenCount": int(bucket["pdfOpenCount"]),
                "importantVotesCount": int(bucket["importantVotesCount"]),
                "completionRate": round((completions / total_opens) * 100, 2) if total_opens > 0 else 0.0,
            }
        )
    lesson_rows.sort(key=lambda item: (-int(item["totalOpens"]), str(item["lessonName"])))

    topic_rows = list(topic_buckets.values())
    topic_rows.sort(key=lambda item: (-int(item["topicOpens"]), str(item["topicName"])))

    ai_topic_rows = [row for row in topic_rows if int(row["promptCopies"]) > 0]
    ai_topic_rows.sort(key=lambda item: (-int(item["promptCopies"]), str(item["topicName"])))

    funnel_counts = {
        "studyme_opened": int(event_counts["studyme_opened"]),
        "studyme_lesson_opened": int(event_counts["studyme_lesson_opened"]),
        "studyme_topic_opened": int(event_counts["studyme_topic_opened"]),
        "studyme_pdf_opened": int(event_counts["studyme_pdf_opened"]),
        "ai_prompt_used": sum(int(event_counts[event_name]) for event_name in _AI_USAGE_EVENTS),
        "studyme_lesson_completed": int(event_counts["studyme_lesson_completed"]),
    }

    funnel = []
    previous_count = None
    for key, label in _FUNNEL_STEPS:
        count = int(funnel_counts.get(key, 0))
        drop_off = max((previous_count or 0) - count, 0) if previous_count is not None else 0
        drop_off_percent = round((drop_off / previous_count) * 100, 2) if previous_count else 0.0
        funnel.append(
            {
                "step": label,
                "count": count,
                "dropOffCount": drop_off,
                "dropOffPercent": drop_off_percent,
            }
        )
        previous_count = count

    feedback_items = list_all_feedback()
    requested_subjects = _extract_requested_subjects(feedback_items)
    feedback_categories = _group_feedback_categories(feedback_items)
    common_suggestions = _common_feedback_suggestions(feedback_items)

    return {
        "overview": {
            "totalStudyMeUsers": total_users,
            "studyMeUsersToday": users_today,
            "totalLessonOpens": int(event_counts["studyme_lesson_opened"]),
            "totalTopicOpens": int(event_counts["studyme_topic_opened"]),
            "totalPdfOpens": int(event_counts["studyme_pdf_opened"]),
            "totalAiPromptCopies": int(event_counts["studyme_lesson_ai_copied"] + event_counts["studyme_topic_prompt_copied"]),
            "totalLessonCompletions": int(event_counts["studyme_lesson_completed"]),
        },
        "funnel": funnel,
        "lessonAnalytics": lesson_rows,
        "topicAnalytics": topic_rows,
        "aiUsageInsights": {
            "lessonAiOpenedCount": int(event_counts["studyme_lesson_ai_opened"]),
            "lessonAiCopiedCount": int(event_counts["studyme_lesson_ai_copied"]),
            "topicPromptCopiedCount": int(event_counts["studyme_topic_prompt_copied"]),
            "mostUsedTopicsForAi": ai_topic_rows[:10],
        },
        "pdfEngagement": {
            "totalPdfOpens": int(event_counts["studyme_pdf_opened"]),
            "pageNextCount": int(event_counts["studyme_pdf_page_next"]),
            "pagePrevCount": int(event_counts["studyme_pdf_page_prev"]),
            "pdfOpensPerLesson": [
                {"lessonName": lesson_name, "count": count}
                for lesson_name, count in sorted(pdf_by_lesson.items(), key=lambda item: (-item[1], item[0]))
            ],
        },
        "demandInsights": {
            "requestedSubjects": requested_subjects,
            "commonSuggestions": common_suggestions,
            "feedbackCategories": feedback_categories,
            "studyMeFeedbackCount": int(event_counts["studyme_feedback_sent"]),
        },
        "eventCounts": dict(sorted(event_counts.items())),
    }
