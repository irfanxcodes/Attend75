from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationInfo, field_validator
from pydantic import model_validator


class LoginRequest(BaseModel):
    roll_number: str = Field(..., description="College roll number")
    password: str = Field(..., description="Portal password")

    @model_validator(mode="before")
    @classmethod
    def map_username_to_roll_number(cls, values: Any) -> Any:
        if isinstance(values, dict):
            roll_number_aliases = ["roll_number", "username", "rollNumber", "txtLogin", "login_id"]
            password_aliases = ["password", "txtPassword", "passcode"]

            roll_number_value = None
            for alias in roll_number_aliases:
                if alias in values and values.get(alias) is not None:
                    roll_number_value = values.get(alias)
                    break

            password_value = None
            for alias in password_aliases:
                if alias in values and values.get(alias) is not None:
                    password_value = values.get(alias)
                    break

            if "roll_number" not in values and roll_number_value is not None:
                values["roll_number"] = roll_number_value

            if "password" not in values and password_value is not None:
                values["password"] = password_value

        return values

    @field_validator("roll_number", "password")
    @classmethod
    def validate_non_empty(cls, value: str, info: ValidationInfo) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(f"{info.field_name} must not be empty")
        return cleaned


class ApiResponse(BaseModel):
    status: str
    message: str
    data: dict[str, Any] | None = None


class AttendanceRequest(BaseModel):
    token: str = Field(..., description="Session token from /login")
    semester_id: str | None = Field(default=None, description="Semester id from attendance dropdown")
    program_id: str | None = Field(default=None, description="Program/course id for students with multiple programs")
    force_refresh: bool = Field(default=False, description="Bypass scraper cache and fetch fresh portal data")

    @field_validator("token")
    @classmethod
    def validate_token(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("token must not be empty")
        return cleaned


class AttendanceHistoryRequest(BaseModel):
    token: str = Field(..., description="Session token from /login")
    semester_id: str | None = Field(default=None, description="Semester id from attendance dropdown")
    date: str | None = Field(default=None, description="Date in YYYY-MM-DD format")

    @field_validator("token")
    @classmethod
    def validate_history_token(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("token must not be empty")
        return cleaned


class FeatureUsageEventRequest(BaseModel):
    token: str = Field(..., description="Session token from /login")
    feature_name: Literal["mail_faculty"] = Field(..., description="Feature identifier")
    action_type: Literal["compose_opened", "send_confirmed"] = Field(..., description="Tracked action type")
    subject_code: str | None = Field(default=None, description="Optional subject code")
    subject_name: str | None = Field(default=None, description="Optional subject name")
    attendance_date: str | None = Field(default=None, description="Optional attendance date in YYYY-MM-DD")

    @field_validator("token")
    @classmethod
    def validate_event_token(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("token must not be empty")
        return cleaned

    @field_validator("subject_code", "subject_name", "attendance_date")
    @classmethod
    def normalize_optional_event_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class FeedbackRequest(BaseModel):
    message: str = Field(..., description="User feedback text")
    user_name: str | None = Field(default=None, description="Display name of feedback submitter")

    @field_validator("message")
    @classmethod
    def validate_feedback_message(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("message must not be empty")
        return cleaned

    @field_validator("user_name")
    @classmethod
    def validate_user_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class StudyMeEventRequest(BaseModel):
    event_type: str = Field(..., description="StudyMe event type")
    token: str | None = Field(default=None, description="Optional session token")
    user_name: str | None = Field(default=None, description="Fallback display name for anonymous tracking")
    subject_name: str | None = Field(default=None, description="StudyMe subject name")
    lesson_name: str | None = Field(default=None, description="StudyMe lesson name")
    topic_name: str | None = Field(default=None, description="StudyMe topic name")
    event_date: str | None = Field(default=None, description="Event date in YYYY-MM-DD format")

    @field_validator("event_type")
    @classmethod
    def validate_event_type(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if not cleaned:
            raise ValueError("event_type must not be empty")
        return cleaned

    @field_validator("token", "user_name", "subject_name", "lesson_name", "topic_name", "event_date")
    @classmethod
    def normalize_optional_studyme_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class StudyMeImportanceQueryRequest(BaseModel):
    token: str = Field(..., description="Session token from /login")
    subject_id: str = Field(..., description="StudyMe subject identifier")
    lesson_ids: list[str] = Field(default_factory=list, description="Lesson ids to include in the response")
    topic_ids: list[str] = Field(default_factory=list, description="Topic ids to include in the response")

    @field_validator("token", "subject_id")
    @classmethod
    def validate_required_studyme_importance_fields(cls, value: str, info: ValidationInfo) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(f"{info.field_name} must not be empty")
        return cleaned

    @field_validator("lesson_ids", "topic_ids")
    @classmethod
    def normalize_studyme_id_lists(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        for item in value:
            cleaned = str(item or "").strip()
            if cleaned:
                normalized.append(cleaned)
        return normalized


class StudyMeLessonImportantToggleRequest(BaseModel):
    token: str = Field(..., description="Session token from /login")
    subject_id: str = Field(..., description="StudyMe subject identifier")
    subject_name: str | None = Field(default=None, description="Subject title for analytics/admin summaries")
    lesson_id: str = Field(..., description="StudyMe lesson identifier")
    lesson_name: str | None = Field(default=None, description="Lesson title for analytics/admin summaries")

    @field_validator("token", "subject_id", "lesson_id")
    @classmethod
    def validate_required_lesson_toggle_fields(cls, value: str, info: ValidationInfo) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(f"{info.field_name} must not be empty")
        return cleaned

    @field_validator("subject_name", "lesson_name")
    @classmethod
    def normalize_optional_lesson_toggle_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class StudyMeTopicImportantToggleRequest(BaseModel):
    token: str = Field(..., description="Session token from /login")
    subject_id: str = Field(..., description="StudyMe subject identifier")
    subject_name: str | None = Field(default=None, description="Subject title for analytics/admin summaries")
    lesson_id: str = Field(..., description="Parent lesson identifier")
    lesson_name: str | None = Field(default=None, description="Parent lesson title for analytics/admin summaries")
    topic_id: str = Field(..., description="StudyMe topic identifier")
    topic_name: str | None = Field(default=None, description="Topic title for analytics/admin summaries")

    @field_validator("token", "subject_id", "lesson_id", "topic_id")
    @classmethod
    def validate_required_topic_toggle_fields(cls, value: str, info: ValidationInfo) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(f"{info.field_name} must not be empty")
        return cleaned

    @field_validator("subject_name", "lesson_name", "topic_name")
    @classmethod
    def normalize_optional_topic_toggle_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class AdminFeedbackStatusUpdateRequest(BaseModel):
    status: Literal["new", "reviewed", "resolved"] = Field(..., description="Updated feedback status")


class SessionStatusRequest(BaseModel):
    token: str = Field(..., description="Session token from /login")

    @field_validator("token")
    @classmethod
    def validate_session_status_token(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("token must not be empty")
        return cleaned


class FirebaseLoginRequest(BaseModel):
    id_token: str = Field(..., description="Firebase ID token from frontend")

    @field_validator("id_token")
    @classmethod
    def validate_id_token(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("id_token must not be empty")
        return cleaned


class FirebaseLinkCredentialsRequest(BaseModel):
    id_token: str = Field(..., description="Firebase ID token from frontend")
    roll_number: str = Field(..., description="College roll number")
    password: str = Field(..., description="Portal password")

    @field_validator("id_token", "roll_number", "password")
    @classmethod
    def validate_non_empty_fields(cls, value: str, info: ValidationInfo) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(f"{info.field_name} must not be empty")
        return cleaned


class AdminPasswordLoginRequest(BaseModel):
    username: str = Field(..., description="Admin username")
    password: str = Field(..., description="Admin password")

    @field_validator("username", "password")
    @classmethod
    def validate_non_empty_admin_fields(cls, value: str, info: ValidationInfo) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(f"{info.field_name} must not be empty")
        return cleaned


class RatingRequest(BaseModel):
    token: str = Field(..., description="Session token from /login")
    rating: int = Field(..., ge=1, le=5, description="Star rating from 1 to 5")

    @field_validator("token")
    @classmethod
    def validate_rating_token(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("token must not be empty")
        return cleaned


class PushSubscribeKeys(BaseModel):
    p256dh: str = Field(..., description="P256DH public key from PushSubscription")
    auth: str = Field(..., description="Auth secret from PushSubscription")

    @field_validator("p256dh", "auth")
    @classmethod
    def validate_key_fields(cls, value: str, info: ValidationInfo) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(f"{info.field_name} must not be empty")
        return cleaned


class PushSubscribeRequest(BaseModel):
    token: str = Field(..., description="Session token from /login")
    endpoint: str = Field(..., description="Web Push subscription endpoint URL")
    keys: PushSubscribeKeys = Field(..., description="Subscription encryption keys")
    device_info: str | None = Field(default=None, description="Optional device/browser label")

    @field_validator("token", "endpoint")
    @classmethod
    def validate_required_push_fields(cls, value: str, info: ValidationInfo) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(f"{info.field_name} must not be empty")
        return cleaned


class PushUnsubscribeRequest(BaseModel):
    token: str = Field(..., description="Session token from /login")
    endpoint: str = Field(..., description="Web Push subscription endpoint URL to remove")

    @field_validator("token", "endpoint")
    @classmethod
    def validate_required_unsub_fields(cls, value: str, info: ValidationInfo) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(f"{info.field_name} must not be empty")
        return cleaned


class PushHistoryReadRequest(BaseModel):
    token: str = Field(..., description="Session token from /login")

    @field_validator("token")
    @classmethod
    def validate_history_read_token(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("token must not be empty")
        return cleaned


class NotificationPreferencesUpdateRequest(BaseModel):
    token: str = Field(..., description="Session token from /login")
    notices_enabled: bool | None = None
    attendance_enabled: bool | None = None
    timetable_enabled: bool | None = None
    daily_digest_enabled: bool | None = None
    weekly_summary_enabled: bool | None = None
    notice_exam: bool | None = None
    notice_fee: bool | None = None
    notice_academic: bool | None = None
    notice_internship: bool | None = None
    notice_event: bool | None = None
    notice_guest_lecture: bool | None = None
    notice_general: bool | None = None
    reminder_lead_minutes: int | None = Field(default=None, description="10, 15, 30, or 60")
    daily_digest_hour: int | None = Field(default=None, ge=0, le=23)
    daily_digest_minute: int | None = Field(default=None, ge=0, le=59)

    @field_validator("token")
    @classmethod
    def validate_prefs_token(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("token must not be empty")
        return cleaned


class ScoreSubmitRequest(BaseModel):
    token: str = Field(..., description="Session token")
    score: int = Field(..., description="Game score")


class ScoreSubmitResponse(BaseModel):
    score: int
    personal_best: int
    rank: int


class LeaderboardEntry(BaseModel):
    rank: int
    username: str
    score: int


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
    user_entry: LeaderboardEntry | None = None
    metadata: dict = Field(default_factory=dict)


# ── AI Lesson Player Schemas ───────────────────────────────────────────────

class FormulaSchema(BaseModel):
    """A mathematical or accounting formula extracted from course material."""
    name: str = Field(..., description="Formula name, e.g. 'Net Working Capital'")
    text: str = Field(..., description="Plain text version, e.g. 'NWC = CA - CL'")
    latex: str | None = Field(default=None, description="LaTeX version if mathematical")
    variables: list[dict] = Field(
        default_factory=list,
        description="Variable breakdown: [{symbol, meaning}]"
    )


class WorkedExampleStep(BaseModel):
    """One step in a worked numerical example."""
    step: str = Field(..., description="Step description, e.g. 'Calculate Cost of Debt'")
    calculation: str = Field(default="", description="The actual calculation or formula used")
    note: str = Field(default="", description="Optional explanation of why this step is done")


class WorkedExampleSchema(BaseModel):
    """A full step-by-step worked numerical example."""
    question: str = Field(..., description="The numerical problem statement")
    steps: list[WorkedExampleStep] = Field(default_factory=list)
    answer: str = Field(default="", description="Final answer")
    source_page: int = Field(default=0, description="Page/slide number in source")


class SourceElementSchema(BaseModel):
    """A reference back to the original document element this concept came from."""
    slide_or_page: int = Field(default=0)
    element_type: str = Field(default="text", description="text | heading | table | image | formula")
    text: str = Field(default="", description="The actual text content of that element")


class ConceptSchema(BaseModel):
    """
    One teachable concept extracted from a chapter.
    Used by instructor library to force structured LLM output.
    """
    title: str = Field(..., description="Concept title, e.g. 'Working Capital Management'")
    explanation: str = Field(..., description="Simplified explanation, max 150 words, student-friendly language")
    definition: str | None = Field(default=None, description="Exact definition as stated in source material")
    keywords: list[str] = Field(default_factory=list, description="Key terms for this concept")
    formulas: list[FormulaSchema] = Field(default_factory=list, description="Formulas relevant to this concept")
    examples: list[str] = Field(default_factory=list, description="Theory/illustrative examples")
    misconceptions: list[str] = Field(default_factory=list, description="Common mistakes students make about this concept")
    exam_questions: list[str] = Field(default_factory=list, description="Likely exam/quiz questions on this concept")
    source_page: int = Field(default=0, description="Page number in source PDF where this concept appears")
    source_heading: str = Field(default="", description="Section heading under which this concept appears")
    prerequisites: list[str] = Field(default_factory=list, description="Titles of other concepts that must be understood first")

    # ── StudyMe 2.0 additions ──────────────────────────────────────────────
    content_type: str = Field(
        default="theory",
        description="'theory' | 'numerical' | 'mixed' — drives Canvas rendering strategy"
    )
    worked_examples: list[WorkedExampleSchema] = Field(
        default_factory=list,
        description="Step-by-step numerical examples extracted from source"
    )
    source_elements: list[SourceElementSchema] = Field(
        default_factory=list,
        description="References back to original document elements for PPT mode"
    )


class ChapterConceptList(BaseModel):
    """
    Full extraction result from one chapter.
    Returned by LLM via instructor — validated Pydantic output.
    """
    chapter_title: str = Field(..., description="Title of the chapter")
    concepts: list[ConceptSchema] = Field(..., description="All extracted concepts in document order")


class IngestionStatusOut(BaseModel):
    """Response for GET /studyme/chapters/:chapter_key/status"""
    chapter_key: str
    upload_status: str          # pending | processing | ready | ready_low_coverage | failed
    coverage_score: float | None = None
    concept_count: int | None = None
    block_count: int | None = None
    uploaded_by_label: str | None = None  # "You" or "a classmate" — never expose roll number
    script_id: str | None = None          # set when status is ready
    error_message: str | None = None


class AvailableChapterOut(BaseModel):
    """One entry in GET /studyme/chapters/:subject_id/available"""
    chapter_key: str
    chapter_title: str
    subject_id: str
    script_id: str
    upload_id: str                  # exposed so WorkspacePlayer can call /curriculum
    uploaded_by_label: str          # always "a classmate" or "You" — never raw roll number
    coverage_score: float | None = None
    concept_count: int
    block_count: int


class LessonBlockOut(BaseModel):
    """One block in the Teaching Script — returned by GET /studyme/lessons/:id/script"""
    id: str
    sequence_order: int
    block_type: str             # narration | keyword_highlight | definition | formula | example | diagram_spec | quiz | recap
    content: str
    voice_text: str | None = None
    expected_answer: str | None = None
    concept_id: str | None = None


class LessonScriptOut(BaseModel):
    """Full Teaching Script for a chapter — returned by GET /studyme/lessons/:id/script"""
    script_id: str
    subject_id: str
    chapter_key: str
    title: str
    total_blocks: int
    estimated_duration_seconds: int | None = None
    concept_count: int
    blocks: list[LessonBlockOut]


class DoubtRequest(BaseModel):
    """POST /studyme/lessons/:id/doubt"""
    token: str = Field(..., description="Session token")
    question: str = Field(..., description="Student's doubt question")
    current_block_index: int = Field(default=0, description="Which block the student was on when they asked")

    @field_validator("token", "question")
    @classmethod
    def validate_doubt_fields(cls, value: str, info: ValidationInfo) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(f"{info.field_name} must not be empty")
        return cleaned


class DoubtResponse(BaseModel):
    """Response from POST /studyme/lessons/:id/doubt"""
    answer: str
    model_used: str             # which LLM provider answered (for observability)


class ProgressUpdate(BaseModel):
    """POST /studyme/lessons/:id/progress"""
    token: str
    last_block_index: int = Field(..., ge=0)
    completed: bool = False
    concepts_seen: list[str] = Field(default_factory=list)
    quiz_results: dict[str, str] = Field(default_factory=dict)
    doubts_asked: int = Field(default=0, ge=0)

    @field_validator("token")
    @classmethod
    def validate_progress_token(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("token must not be empty")
        return cleaned


class ProgressOut(BaseModel):
    """GET /studyme/lessons/:id/progress"""
    script_id: str
    last_block_index: int
    completed: bool
    concepts_seen: list[str]
    quiz_results: dict[str, str]
    doubts_asked: int
    started_at: str | None = None
    completed_at: str | None = None


# ── StudyMe 2.0 API Schemas ────────────────────────────────────────────────

class ConceptSectionOut(BaseModel):
    """One section of a concept in the Canvas — part of GET /studyme/concepts/:id"""
    id: str
    section_type: str
    sequence_order: int
    content: dict
    source_references: list[dict]
    voice_text: str | None = None


class ConceptOut(BaseModel):
    """
    Full concept data for the Canvas.
    GET /studyme/concepts/:concept_id
    """
    id: str
    title: str
    explanation: str
    definition: str | None = None
    keywords: list[str]
    formulas: list[dict]           # [{name, text, latex, variables}]
    examples: list[str]
    misconceptions: list[str]
    exam_questions: list[str]
    source_page: int | None = None
    source_heading: str | None = None
    prerequisites: list[str]
    content_type: str              # theory | numerical | mixed
    worked_examples: list[dict]    # [{question, steps, answer, source_page}]
    source_elements: list[dict]    # [{slide_or_page, element_type, text}]
    sequence_order: int
    # Sections compiled for Canvas rendering (from concept_sections table)
    # Empty list for legacy concepts that only have lesson_blocks
    sections: list[ConceptSectionOut] = Field(default_factory=list)


class CurriculumConceptItem(BaseModel):
    """One concept in the curriculum outline — used by GET /studyme/chapters/:id/curriculum"""
    id: str
    title: str
    sequence_order: int
    content_type: str              # theory | numerical | mixed
    source_heading: str | None = None
    prerequisites: list[str]
    has_sections: bool             # True = new Canvas model; False = legacy blocks only
    # Student progress state (injected per request)
    student_status: str = "unseen"  # unseen | learning | understood | struggling | review_due | mastered


class CurriculumOut(BaseModel):
    """
    Chapter curriculum with ordered concepts.
    GET /studyme/chapters/:upload_id/curriculum
    """
    upload_id: str
    chapter_key: str
    chapter_title: str
    subject_id: str
    concepts: list[CurriculumConceptItem]
    total_concepts: int
    # Legacy script_id — still used by LessonPlayer v1 for block-based playback
    script_id: str | None = None


class ConceptProgressUpdate(BaseModel):
    """POST /studyme/concepts/:concept_id/progress"""
    token: str
    status: str = Field(..., description="unseen|learning|understood|struggling|review_due|mastered")
    attempts: int = Field(default=0, ge=0)
    correct_attempts: int = Field(default=0, ge=0)

    @field_validator("token")
    @classmethod
    def validate_token(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("token must not be empty")
        return cleaned

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        valid = {"unseen", "learning", "understood", "struggling", "review_due", "mastered"}
        if value not in valid:
            raise ValueError(f"status must be one of: {', '.join(sorted(valid))}")
        return value


class TutorRequest(BaseModel):
    """
    POST /studyme/tutor
    Persistent tutor — superset of the old /doubt endpoint.
    Includes concept context, conversation history, and optional tutor mode.
    """
    token: str
    question: str
    script_id: str | None = Field(default=None, description="Lesson script being studied")
    concept_id: str | None = Field(default=None, description="Current concept in Canvas")
    upload_id: str | None = Field(default=None, description="Chapter upload (for RAG)")
    current_block_index: int = Field(default=0)
    conversation: list[dict] = Field(
        default_factory=list,
        description="Previous messages: [{role: 'user'|'tutor', content: str}]"
    )
    mode: str = Field(
        default="answer",
        description="'answer' | 'socratic' | 'quiz' | 'hint'"
    )

    @field_validator("token", "question")
    @classmethod
    def validate_required(cls, value: str, info: ValidationInfo) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError(f"{info.field_name} must not be empty")
        return cleaned


class TutorResponse(BaseModel):
    """Response from POST /studyme/tutor"""
    answer: str
    model_used: str
    mode: str = "answer"
    # Optional tutor-initiated actions the frontend can interpret safely
    # e.g. {"action": "open_concept", "concept_id": "..."}
    # or   {"action": "focus_slide", "slide_no": 7}
    suggested_action: dict | None = None
