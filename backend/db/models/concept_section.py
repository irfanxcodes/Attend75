"""concept_sections — hierarchical teaching sections for StudyMe 2.0 Canvas.

Replaces the flat lesson_blocks model for new uploads.
Each concept has ordered sections rendered as a scrollable educational document.
Existing lesson_blocks remain intact for legacy lesson playback.
"""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from db.base import Base

try:
    from sqlalchemy.dialects.postgresql import JSONB as JSON_TYPE
except ImportError:
    from sqlalchemy import JSON as JSON_TYPE


def _new_uuid() -> str:
    return str(uuid.uuid4())


# Valid section_type values
SECTION_TYPES = {
    "explanation",       # main concept explanation — plain prose
    "definition",        # exact definition from source
    "formula",           # formula with variables breakdown
    "formula_explanation",  # narrative explanation of when/how to use the formula
    "worked_example",    # step-by-step numerical example
    "theory_example",    # illustrative real-world example (non-numerical)
    "visual",            # diagram, table, or concept map
    "common_mistake",    # a common misconception and its correction
    "takeaway",          # key point / summary sentence
    "practice",          # practice question (handled by Tutor, not Canvas)
}

# Content JSON schema per section_type:
#
# explanation:        {"text": str, "summary": str}
# definition:         {"text": str}
# formula:            {"name": str, "text": str, "latex": str|null,
#                      "variables": [{"symbol": str, "meaning": str}]}
# formula_explanation:{"text": str}
# worked_example:     {"question": str,
#                      "steps": [{"step": str, "calculation": str, "note": str}],
#                      "answer": str, "source_page": int}
# theory_example:     {"text": str, "source": str}
# visual:             {"spec_type": "mermaid"|"table"|"svg",
#                      "spec": str, "caption": str}
# common_mistake:     {"mistake": str, "correction": str}
# takeaway:           {"text": str}
# practice:           {"question": str, "question_type": str, "expected_answer": str}


class ConceptSection(Base):
    __tablename__ = "concept_sections"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    concept_id = Column(
        String(36),
        ForeignKey("ai_concepts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    upload_id = Column(String(36), nullable=False, index=True)  # denormalized
    section_type = Column(String(32), nullable=False)
    sequence_order = Column(Integer, nullable=False, default=0)
    content = Column(JSON_TYPE, nullable=False, default=dict)
    source_references = Column(JSON_TYPE, nullable=False, default=list)
    voice_text = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<ConceptSection {self.section_type!r} order={self.sequence_order}>"
