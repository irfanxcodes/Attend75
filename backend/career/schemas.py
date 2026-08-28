"""
Career Compass — Pydantic schemas

All request/response models for the /career/* endpoints.
Kept separate from the main models/schemas.py to isolate the feature.
"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator


# ── Requests ──────────────────────────────────────────────────────────────────

class CareerRoadmapRequest(BaseModel):
    """POST /career/roadmap — generate personalised skill roadmap."""
    token: str = Field(..., description="Session token")
    # Optional overrides — if not provided the service resolves them from StudentRegistry
    program: str | None = Field(default=None, description="Degree programme, e.g. 'BBA'")
    semester: str | None = Field(default=None, description="Current semester label, e.g. 'Semester III'")
    subjects: list[str] = Field(default_factory=list, description="Subject short-names from portal")

    @field_validator("token")
    @classmethod
    def _require_token(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("token must not be empty")
        return v


class CareerExploreRequest(BaseModel):
    """POST /career/explore — list career tracks for a degree."""
    token: str = Field(..., description="Session token")
    program: str | None = Field(default=None)
    semester: str | None = Field(default=None)


class CareerCompaniesRequest(BaseModel):
    """POST /career/companies — company directory filtered by profile."""
    token: str = Field(..., description="Session token")
    track: str | None = Field(default=None, description="Career track slug, e.g. 'finance'")
    program: str | None = Field(default=None)


class SaveCareerTrackRequest(BaseModel):
    """POST /career/profile/track — save a student's chosen track."""
    token: str
    track_slug: str = Field(..., description="Chosen career track identifier")
    track_label: str = Field(..., description="Human-readable track name")

    @field_validator("token", "track_slug", "track_label")
    @classmethod
    def _require_fields(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("field must not be empty")
        return v


# ── Response pieces ───────────────────────────────────────────────────────────

class SkillItem(BaseModel):
    name: str
    level: Literal["start_now", "before_graduation", "optional"]
    why: str  # one-line rationale


class CertificationItem(BaseModel):
    name: str
    provider: str        # e.g. "Google", "NPTEL", "Coursera"
    free: bool
    url: str | None = None
    timeline_weeks: int  # estimated completion time


class CareerTrack(BaseModel):
    slug: str            # e.g. "finance", "digital_marketing"
    label: str           # e.g. "Financial Analyst"
    description: str
    relevant_subjects: list[str]   # subjects from student's own list that align
    entry_role: str
    salary_range_inr: str          # e.g. "₹4–6 LPA"
    demand_trend: Literal["rising", "stable", "saturated"]
    skills: list[SkillItem]
    certifications: list[CertificationItem]
    timeline_months: int           # months to become placement-ready
    fit_score: int                 # 0–100, how well the student's profile matches


class RoadmapResponse(BaseModel):
    program: str
    semester: str
    top_tracks: list[CareerTrack]   # top 3 personalised tracks
    quick_wins: list[str]           # 3-5 actions to do THIS week
    model_used: str
    cached: bool = False


class CompanyCard(BaseModel):
    name: str
    sector: str
    roles: list[str]           # entry-level roles they hire for
    selection_process: str     # short description
    package_range_inr: str     # e.g. "₹3.5–5 LPA"
    tier: Literal["tier1", "tier2", "tier3"]
    website: str | None = None


class CompaniesResponse(BaseModel):
    track: str | None
    companies: list[CompanyCard]
    total: int


class CareerProfileOut(BaseModel):
    roll_number: str
    chosen_track_slug: str | None
    chosen_track_label: str | None
    roadmap_generated_at: str | None
