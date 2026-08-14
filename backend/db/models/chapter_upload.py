"""chapter_uploads — tracks PDF uploads and their ingestion state."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text

from db.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class ChapterUpload(Base):
    __tablename__ = "chapter_uploads"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    subject_id = Column(String(64), nullable=False, index=True)
    chapter_key = Column(String(128), nullable=False, index=True)
    chapter_title = Column(String(256), nullable=True)
    uploaded_by = Column(String(64), nullable=False, index=True)
    upload_status = Column(String(32), nullable=False, default="pending", index=True)
    # 'chapter' = AI lesson upload; 'notes' = Notes Solver upload
    upload_type = Column(String(16), nullable=False, default="chapter")
    coverage_score = Column(Float, nullable=True)
    concept_count = Column(Integer, nullable=True)
    block_count = Column(Integer, nullable=True)
    retry_count = Column(Integer, nullable=False, default=0)
    file_path = Column(String(512), nullable=True)
    original_filename = Column(String(256), nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    file_hash = Column(String(64), nullable=True, index=True)
    # is_public: True = admin-approved, shared with all students in the subject.
    # Only public uploads participate in chapter_key deduplication so that
    # two students uploading different versions of the same chapter never
    # accidentally share slides.
    is_public = Column(Boolean, nullable=False, default=False)
    file_deleted_at = Column(DateTime, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<ChapterUpload {self.subject_id}/{self.chapter_key} status={self.upload_status}>"
