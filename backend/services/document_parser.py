"""
Document Parser — AI Lesson Player

Extracts structured text from uploaded chapter files using Docling backends.
Supports PDF (pypdfium2), DOCX (msword), and PPTX (mspowerpoint).

Docling gives us:
  - Proper reading-order text extraction (vs raw positional order from pdfplumber)
  - Native DOCX/PPTX parsing with heading detection
  - Structured DoclingDocument → clean Markdown export for DOCX/PPTX

Output: RawDocumentModel — faithful representation of the document content,
used by concept_extractor and rag_service downstream.
"""

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class RawPage:
    page_number: int                        # 1-indexed
    headings: list[str]                     # detected headings on this page
    paragraphs: list[str]                   # regular text blocks
    tables: list[list[list[str]]]           # list of tables (rows × cells)
    raw_text: str                           # full text of this page/slide/section


@dataclass
class RawDocumentModel:
    file_path: str
    total_pages: int
    title: str                              # inferred from first heading or filename
    all_headings: list[str]                 # every heading found (for coverage validation)
    pages: list[RawPage]
    full_text: str                          # concatenated text of all pages (fed to LLM)
    chunks: list[dict] = field(default_factory=list)
    # Each chunk: {text, source_page, source_heading, chunk_index}


# ── Heading detection (used for PDF path) ────────────────────────────────────

_HEADING_PATTERNS = [
    re.compile(r'^[A-Z][A-Z\s\-:]{4,}$'),          # ALL CAPS
    re.compile(r'^\d+[\.\)]\s+[A-Z]'),              # "1. Introduction"
    re.compile(r'^[IVXLCDM]+[\.\)]\s+[A-Z]'),       # "I. Overview"
    re.compile(r'^Chapter\s+\d+', re.IGNORECASE),
    re.compile(r'^Section\s+\d+', re.IGNORECASE),
    re.compile(r'^Unit\s+\d+', re.IGNORECASE),
]


def _looks_like_heading(line: str) -> bool:
    line = line.strip()
    if not line or len(line) < 3 or len(line) > 120:
        return False
    for pattern in _HEADING_PATTERNS:
        if pattern.match(line):
            return True
    return False


def _clean_text(text: str) -> str:
    """Normalize whitespace, remove non-printable chars."""
    if not text:
        return ""
    cleaned = re.sub(r'[^\x20-\x7E\n\t]', ' ', text)
    cleaned = re.sub(r'[ \t]+', ' ', cleaned)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    return cleaned.strip()


# ── PDF Parser (Docling pypdfium2 backend) ────────────────────────────────────

def parse_pdf(file_path: str) -> RawDocumentModel:
    """
    Parse a PDF using Docling's pypdfium2 backend.
    Iterates pages, extracts text cells in reading order, detects headings.
    No OCR, no ML models — fast and reliable for text-based PDFs.
    """
    from docling.backend.pypdfium2_backend import PyPdfiumDocumentBackend
    from docling.datamodel.document import InputDocument
    from docling.datamodel.base_models import InputFormat

    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    logger.info("[DocumentParser] Parsing PDF: %s", path.name)

    doc_in = InputDocument(
        path_or_stream=path,
        format=InputFormat.PDF,
        backend=PyPdfiumDocumentBackend,
    )
    backend = doc_in._backend

    if not backend.is_valid():
        raise ValueError(f"Could not open PDF: {path.name}")

    title = path.stem.replace("_", " ").replace("-", " ").title()
    all_headings: list[str] = []
    pages: list[RawPage] = []
    full_text_parts: list[str] = []

    for page_backend in backend.iter_pages():
        page_no = page_backend.page_no + 1  # 0-indexed → 1-indexed

        try:
            cells = list(page_backend.get_text_cells())
            lines = [c.text.strip() for c in cells if c.text.strip()]
        except Exception as exc:
            logger.warning("[DocumentParser] PDF page %d text extraction failed: %s", page_no, exc)
            lines = []

        headings: list[str] = []
        paragraphs: list[str] = []
        current_para: list[str] = []

        for line in lines:
            if _looks_like_heading(line):
                if current_para:
                    paragraphs.append(' '.join(current_para))
                    current_para = []
                headings.append(line)
                all_headings.append(line)
            else:
                current_para.append(line)

        if current_para:
            paragraphs.append(' '.join(current_para))

        if page_no == 1 and headings:
            title = headings[0].title()

        raw_text = _clean_text('\n'.join(lines))
        pages.append(RawPage(
            page_number=page_no,
            headings=headings,
            paragraphs=paragraphs,
            tables=[],          # table structure extraction requires ML models
            raw_text=raw_text,
        ))
        if raw_text:
            full_text_parts.append(f"--- Page {page_no} ---\n{raw_text}")

    backend.unload()

    if not pages:
        raise ValueError("PDF appears to be empty or image-based (no extractable text)")

    full_text = "\n\n".join(full_text_parts)
    logger.info(
        "[DocumentParser] PDF done: %d pages, %d headings, %d chars",
        len(pages), len(all_headings), len(full_text),
    )

    doc = RawDocumentModel(
        file_path=file_path,
        total_pages=len(pages),
        title=title,
        all_headings=all_headings,
        pages=pages,
        full_text=full_text,
    )
    doc.chunks = chunk_document(doc)
    return doc


# ── DOCX / PPTX Parser (Docling msword / mspowerpoint backends) ──────────────

def _parse_via_docling_convert(file_path: str, input_format, backend_cls) -> RawDocumentModel:
    """
    Generic parser for DOCX and PPTX using Docling's convert() pipeline.
    Both backends return a DoclingDocument which we export to Markdown, then
    split into logical sections (by heading lines) to build RawPage entries.
    """
    from docling.datamodel.document import InputDocument

    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    logger.info("[DocumentParser] Parsing %s: %s", input_format.value.upper(), path.name)

    doc_in = InputDocument(
        path_or_stream=path,
        format=input_format,
        backend=backend_cls,
    )
    backend = doc_in._backend

    if not backend.is_valid():
        raise ValueError(f"Could not open {input_format.value.upper()} file: {path.name}")

    # convert() → DoclingDocument with structure preserved
    docling_doc = backend.convert()
    markdown = docling_doc.export_to_markdown()

    if not markdown.strip():
        raise ValueError(f"Document appears to be empty or has no readable text: {path.name}")

    title = path.stem.replace("_", " ").replace("-", " ").title()
    all_headings: list[str] = []
    pages: list[RawPage] = []
    full_text_parts: list[str] = []

    # Split markdown into logical "pages" at heading boundaries (# lines)
    current_headings: list[str] = []
    current_body: list[str] = []
    section_number = 0

    def _flush(h: list[str], body: list[str], sec_num: int):
        if not h and not body:
            return
        raw = '\n'.join(h + body)
        raw_clean = _clean_text(raw)
        pages.append(RawPage(
            page_number=sec_num,
            headings=list(h),
            paragraphs=[l for l in body if l.strip()],
            tables=[],
            raw_text=raw_clean,
        ))
        if raw_clean:
            full_text_parts.append(f"--- Section {sec_num} ---\n{raw_clean}")

    for line in markdown.splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        # Markdown headings (# / ## / ###)
        if stripped.startswith('#'):
            heading_text = stripped.lstrip('#').strip()
            if not heading_text:
                continue

            # Flush on top-level headings to create new sections
            if stripped.startswith('# ') and (current_headings or current_body):
                section_number += 1
                _flush(current_headings, current_body, section_number)
                current_headings = []
                current_body = []

            current_headings.append(heading_text)
            all_headings.append(heading_text)
            # Use first heading as document title
            if not pages and not current_body and len(all_headings) == 1:
                title = heading_text
        else:
            current_body.append(stripped)

    # Flush last section
    section_number += 1
    _flush(current_headings, current_body, section_number)

    if not pages:
        # Fallback: whole document as one page
        raw_clean = _clean_text(markdown)
        pages.append(RawPage(
            page_number=1,
            headings=[],
            paragraphs=[l.strip() for l in markdown.splitlines() if l.strip()],
            tables=[],
            raw_text=raw_clean,
        ))
        full_text_parts.append(f"--- Section 1 ---\n{raw_clean}")

    full_text = "\n\n".join(full_text_parts)
    logger.info(
        "[DocumentParser] %s done: %d sections, %d headings, %d chars",
        input_format.value.upper(), len(pages), len(all_headings), len(full_text),
    )

    doc = RawDocumentModel(
        file_path=file_path,
        total_pages=len(pages),
        title=title,
        all_headings=all_headings,
        pages=pages,
        full_text=full_text,
    )
    doc.chunks = chunk_document(doc)
    return doc


def parse_docx(file_path: str) -> RawDocumentModel:
    """Parse a .docx/.doc file using Docling's MsWord backend."""
    from docling.backend.msword_backend import MsWordDocumentBackend
    from docling.datamodel.base_models import InputFormat
    return _parse_via_docling_convert(file_path, InputFormat.DOCX, MsWordDocumentBackend)


def parse_pptx(file_path: str) -> RawDocumentModel:
    """Parse a .pptx/.ppt file using Docling's MsPowerpoint backend."""
    from docling.backend.mspowerpoint_backend import MsPowerpointDocumentBackend
    from docling.datamodel.base_models import InputFormat
    return _parse_via_docling_convert(file_path, InputFormat.PPTX, MsPowerpointDocumentBackend)


# ── Unified Entry Point ───────────────────────────────────────────────────────

SUPPORTED_EXTENSIONS = {'.pdf', '.docx', '.doc', '.pptx', '.ppt'}


def parse_document(file_path: str) -> RawDocumentModel:
    """
    Parse any supported document type into a RawDocumentModel.
    Dispatches to the correct Docling backend by file extension.
    Supported: .pdf, .docx, .doc, .pptx, .ppt
    """
    ext = Path(file_path).suffix.lower()
    if ext == '.pdf':
        return parse_pdf(file_path)
    elif ext in ('.docx', '.doc'):
        return parse_docx(file_path)
    elif ext in ('.pptx', '.ppt'):
        return parse_pptx(file_path)
    else:
        raise ValueError(
            f"Unsupported file type: '{ext}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )


# ── RAG Chunker (unchanged) ───────────────────────────────────────────────────

def chunk_document(doc: RawDocumentModel, chunk_size: int = 1600, overlap: int = 200) -> list[dict]:
    """
    Split document text into overlapping chunks for RAG embedding.
    Each chunk includes source page and heading metadata.
    Returns list of {text, source_page, source_heading, chunk_index}.
    """
    chunks = []
    chunk_index = 0

    for page in doc.pages:
        if not page.raw_text:
            continue

        text = page.raw_text
        current_heading = page.headings[0] if page.headings else ""
        start = 0

        while start < len(text):
            end = min(start + chunk_size, len(text))

            if end < len(text):
                last_period = text.rfind('. ', start, end)
                last_newline = text.rfind('\n', start, end)
                break_point = max(last_period, last_newline)
                if break_point > start + (chunk_size // 2):
                    end = break_point + 1

            chunk_text = text[start:end].strip()
            if chunk_text and len(chunk_text) > 50:
                for heading in page.headings:
                    if heading in chunk_text[:200]:
                        current_heading = heading
                        break
                chunks.append({
                    "text": chunk_text,
                    "source_page": page.page_number,
                    "source_heading": current_heading,
                    "chunk_index": chunk_index,
                })
                chunk_index += 1

            start = end - overlap if end < len(text) else len(text)

    logger.info("[DocumentParser] Created %d chunks", len(chunks))
    return chunks
