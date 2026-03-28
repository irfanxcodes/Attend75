from typing import Any

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
