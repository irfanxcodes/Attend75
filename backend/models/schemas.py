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
