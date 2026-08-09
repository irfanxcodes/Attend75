"""chapter_chunks — text chunks with embeddings for RAG doubt answering."""

import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from db.base import Base


def _new_uuid() -> str:
    return str(uuid.uuid4())


class ChapterChunk(Base):
    __tablename__ = "chapter_chunks"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    upload_id = Column(String(36), ForeignKey("chapter_uploads.id", ondelete="CASCADE"), nullable=False, index=True)
    subject_id = Column(String(64), nullable=False, index=True)
    chapter_key = Column(String(128), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    chunk_text = Column(Text, nullable=False)
    source_page = Column(Integer, nullable=True)
    source_heading = Column(String(256), nullable=True)
    embedding_model = Column(String(128), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    # NOTE: the `embedding vector(1024)` column is added by raw SQL in the migration
    # and is only present on PostgreSQL. On SQLite, RAG is disabled.

    def __repr__(self) -> str:
        return f"<ChapterChunk upload={self.upload_id} idx={self.chunk_index}>"
