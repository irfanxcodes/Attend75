from typing import Any

from pydantic import BaseModel, Field, ValidationInfo, field_validator


class LoginRequest(BaseModel):
    roll_number: str = Field(..., description="College roll number")
    password: str = Field(..., description="Portal password")

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
