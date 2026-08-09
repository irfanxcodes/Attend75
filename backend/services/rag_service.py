"""
RAG Service — AI Lesson Player

Stores text chunk embeddings in pgvector for retrieval-augmented doubt answering.
Embeds chunks during ingestion (once per chapter).
Embeds student questions at doubt time for similarity search.

Falls back gracefully on SQLite (no embeddings stored/retrieved).
"""

import logging
import os
from typing import TYPE_CHECKING

from services.llm_router import embed_with_fallback

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


def _is_postgres() -> bool:
    db_url = os.getenv("DATABASE_URL", "")
    return "postgresql" in db_url or "postgres" in db_url


def index_chapter(upload_id: str, chunks: list[dict], subject_id: str, chapter_key: str) -> int:
    """
    Embed each text chunk and store in chapter_chunks table.

    Args:
        upload_id: UUID of the chapter_uploads row
        chunks: list of {text, source_page, source_heading, chunk_index}
        subject_id: e.g. "fm"
        chapter_key: e.g. "fm-ch1-working-capital"

    Returns:
        Number of chunks successfully indexed.
    """
    from datetime import datetime
    from db.session import SessionLocal

    indexed = 0
    failed = 0

    with SessionLocal() as session:
        for chunk in chunks:
            chunk_text = chunk.get("text", "").strip()
            if not chunk_text or len(chunk_text) < 20:
                continue

            try:
                # Get embedding
                vector, model_used = embed_with_fallback(chunk_text)

                # Build the row — use raw SQL insert for pgvector compatibility
                if _is_postgres():
                    from sqlalchemy import text
                    import json
                    session.execute(
                        text("""
                            INSERT INTO chapter_chunks
                            (id, upload_id, subject_id, chapter_key, chunk_index,
                             chunk_text, source_page, source_heading,
                             embedding, embedding_model, created_at)
                            VALUES
                            (gen_random_uuid(), :upload_id, :subject_id, :chapter_key,
                             :chunk_index, :chunk_text, :source_page, :source_heading,
                             :embedding::vector, :embedding_model, :created_at)
                        """),
                        {
                            "upload_id": upload_id,
                            "subject_id": subject_id,
                            "chapter_key": chapter_key,
                            "chunk_index": chunk["chunk_index"],
                            "chunk_text": chunk_text,
                            "source_page": chunk.get("source_page", 0),
                            "source_heading": chunk.get("source_heading", ""),
                            "embedding": f"[{','.join(str(v) for v in vector)}]",
                            "embedding_model": model_used,
                            "created_at": datetime.utcnow(),
                        }
                    )
                else:
                    # SQLite fallback — store without embedding (RAG disabled)
                    from db.models.chapter_chunk import ChapterChunk
                    import uuid
                    row = ChapterChunk(
                        id=str(uuid.uuid4()),
                        upload_id=str(upload_id),
                        subject_id=subject_id,
                        chapter_key=chapter_key,
                        chunk_index=chunk["chunk_index"],
                        chunk_text=chunk_text,
                        source_page=chunk.get("source_page", 0),
                        source_heading=chunk.get("source_heading", ""),
                        embedding_model=model_used,
                        created_at=datetime.utcnow(),
                    )
                    session.add(row)

                indexed += 1

            except Exception as exc:
                logger.warning(
                    "[RAGService] Failed to embed chunk %d: %s",
                    chunk.get("chunk_index", -1), str(exc)[:150]
                )
                failed += 1

        session.commit()

    logger.info(
        "[RAGService] Indexed %d chunks (%d failed) for upload_id=%s",
        indexed, failed, upload_id
    )
    return indexed


def retrieve(question: str, upload_id: str, top_k: int = 3) -> list[str]:
    """
    Retrieve the most relevant text chunks for a student's question.

    Args:
        question: The student's doubt question
        upload_id: Which chapter to search within
        top_k: Number of chunks to return

    Returns:
        List of chunk texts, most relevant first.
        Returns empty list if RAG is unavailable (SQLite or embedding failure).
    """
    if not _is_postgres():
        logger.debug("[RAGService] SQLite mode — RAG retrieval skipped")
        return []

    try:
        # Embed the question
        question_vector, _ = embed_with_fallback(question)

        from db.session import SessionLocal
        from sqlalchemy import text

        vector_str = f"[{','.join(str(v) for v in question_vector)}]"

        with SessionLocal() as session:
            rows = session.execute(
                text("""
                    SELECT chunk_text
                    FROM chapter_chunks
                    WHERE upload_id = :upload_id
                      AND embedding IS NOT NULL
                    ORDER BY embedding <=> :query_vector::vector
                    LIMIT :top_k
                """),
                {
                    "upload_id": upload_id,
                    "query_vector": vector_str,
                    "top_k": top_k,
                }
            ).fetchall()

        chunks = [row[0] for row in rows if row[0]]
        logger.info("[RAGService] Retrieved %d chunks for question (upload_id=%s)", len(chunks), upload_id)
        return chunks

    except Exception as exc:
        logger.warning("[RAGService] Retrieval failed: %s", str(exc)[:200])
        return []
