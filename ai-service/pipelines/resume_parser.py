"""Resume parsing pipeline - extract and structure CV content."""

from __future__ import annotations

import json
import logging
import re
from zipfile import ZipFile
import xml.etree.ElementTree as ET

from prompts.templates import RESUME_NORMALIZER_SYSTEM, RESUME_NORMALIZER_USER
from services.llm_client import get_llm_client
from utils.arabic import normalize_arabic, remove_tashkeel

logger = logging.getLogger(__name__)

# Section header patterns (Arabic + English)
_SECTION_PATTERNS = {
    "summary": re.compile(
        r"(الملخص|نبذة\s*شخصية|عني|الهدف\s*الوظيفي|summary|objective|about\s*me|profile)",
        re.IGNORECASE,
    ),
    "skills": re.compile(
        r"(المهارات|مهارات|skills|competencies|technologies)",
        re.IGNORECASE,
    ),
    "experience": re.compile(
        r"(الخبرات|خبرات?\s*عملية|خبرات?\s*مهنية|experience|work\s*history|employment)",
        re.IGNORECASE,
    ),
    "education": re.compile(
        r"(التعليم|المؤهلات|education|academic|qualifications)",
        re.IGNORECASE,
    ),
    "languages": re.compile(
        r"(اللغات|languages)",
        re.IGNORECASE,
    ),
}


class ResumeParserPipeline:
    """Extract structured data from resume files or raw text."""

    # ------------------------------------------------------------------
    # Text extraction
    # ------------------------------------------------------------------

    @staticmethod
    def extract_text(file_path: str, file_type: str) -> str:
        """Extract plain text from a PDF or DOCX file."""
        file_type = file_type.lower().strip()

        if file_type == "pdf":
            text_parts: list[str] = []

            try:
                import pdfplumber

                with pdfplumber.open(file_path) as pdf:
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text:
                            text_parts.append(page_text)
            except ModuleNotFoundError:
                from pypdf import PdfReader

                reader = PdfReader(file_path)
                for page in reader.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)

            return "\n".join(text_parts)

        if file_type == "docx":
            try:
                from docx import Document

                doc = Document(file_path)
                return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            except ModuleNotFoundError:
                namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                with ZipFile(file_path) as archive:
                    xml = archive.read("word/document.xml")
                root = ET.fromstring(xml)
                paragraphs: list[str] = []
                for paragraph in root.findall(".//w:p", namespace):
                    texts = [node.text or "" for node in paragraph.findall(".//w:t", namespace)]
                    line = "".join(texts).strip()
                    if line:
                        paragraphs.append(line)
                return "\n".join(paragraphs)

        if file_type == "txt":
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()

        raise ValueError(f"Unsupported file type: {file_type}")

    # ------------------------------------------------------------------
    # Section identification
    # ------------------------------------------------------------------

    @staticmethod
    def parse_sections(raw_text: str) -> dict:
        """Split raw resume text into labelled sections."""
        lines = raw_text.split("\n")
        sections: dict[str, list[str]] = {
            "summary": [],
            "skills": [],
            "experience": [],
            "education": [],
            "languages": [],
            "other": [],
        }
        current_section = "summary"  # default before first heading

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            # Check if the line is a section header
            matched = False
            for section_name, pattern in _SECTION_PATTERNS.items():
                if pattern.search(stripped) and len(stripped) < 60:
                    current_section = section_name
                    matched = True
                    break

            if not matched:
                sections[current_section].append(stripped)

        # Post-process: join text, parse skills as list
        result: dict = {}
        for key, content_lines in sections.items():
            if key == "skills":
                # Try to split by common delimiters
                joined = " ".join(content_lines)
                skills = re.split(r"[,،\-•|/\n]", joined)
                result[key] = [s.strip() for s in skills if s.strip()]
            elif key == "experience":
                result[key] = content_lines
            elif key == "education":
                result[key] = content_lines
            elif key == "languages":
                joined = " ".join(content_lines)
                langs = re.split(r"[,،\-•|/\n]", joined)
                result[key] = [l.strip() for l in langs if l.strip()]
            else:
                result[key] = " ".join(content_lines)

        return result

    # ------------------------------------------------------------------
    # Normalisation
    # ------------------------------------------------------------------

    @staticmethod
    def normalize_text(text: str) -> str:
        """Apply Arabic normalisation to text."""
        return normalize_arabic(text)

    # ------------------------------------------------------------------
    # Full pipeline
    # ------------------------------------------------------------------

    # ------------------------------------------------------------------
    # LLM normalization (OpenRouter)
    # ------------------------------------------------------------------

    @staticmethod
    def normalize_with_llm(raw_text: str) -> dict | None:
        """Send raw resume text through OpenRouter and return the structured profile.

        Returns None if the LLM is unavailable or the response can't be parsed.
        """
        if not raw_text or not raw_text.strip():
            return None
        client = get_llm_client()
        if not client.is_available:
            return None

        snippet = raw_text[:12000]
        content = client.chat(
            messages=[
                {"role": "system", "content": RESUME_NORMALIZER_SYSTEM},
                {"role": "user", "content": RESUME_NORMALIZER_USER.format(raw_text=snippet)},
            ],
            max_tokens=2000,
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        if not content:
            return None

        cleaned = content.strip().strip("`")
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
            cleaned = re.sub(r"\n?```$", "", cleaned)

        # Some models prepend stray text; grab the first JSON object
        match = re.search(r"\{.*\}", cleaned, flags=re.S)
        if not match:
            logger.warning("Resume normalizer: no JSON object in LLM output")
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            logger.warning("Resume normalizer: invalid JSON: %s", exc)
            return None

    # ------------------------------------------------------------------
    # Full pipeline
    # ------------------------------------------------------------------

    def run(self, file_path: str | None = None, file_type: str | None = None,
            raw_text: str | None = None, normalize: bool = True) -> dict:
        """Run the full resume parsing pipeline.

        Provide either (file_path + file_type) or raw_text.
        Returns a dict with summary, skills, experience, education, languages, raw_text.
        When ``normalize`` is True and OpenRouter is available, the result also
        includes a ``normalized`` key with the structured candidate profile.
        """
        if raw_text is None:
            if file_path is None or file_type is None:
                raise ValueError("Provide file_path+file_type or raw_text")
            raw_text = self.extract_text(file_path, file_type)

        sections = self.parse_sections(raw_text)

        # Normalise all text fields
        if isinstance(sections.get("summary"), str):
            sections["summary"] = self.normalize_text(sections["summary"])
        if isinstance(sections.get("skills"), list):
            normalized_skills = [self.normalize_text(s) for s in sections["skills"]]
            # Deduplicate case-insensitively while preserving original casing + order
            seen: set[str] = set()
            unique_skills: list[str] = []
            for s in normalized_skills:
                key = s.lower().strip()
                if key and key not in seen:
                    seen.add(key)
                    unique_skills.append(s)
            sections["skills"] = unique_skills

        sections["raw_text"] = raw_text

        if normalize:
            try:
                normalized = self.normalize_with_llm(raw_text)
                if normalized:
                    sections["normalized"] = normalized
            except Exception as exc:  # never let LLM failure break parsing
                logger.warning("Resume LLM normalization failed: %s", exc)

        return sections
