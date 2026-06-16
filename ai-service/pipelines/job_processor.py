"""Job processing pipeline - normalise and extract structured data from job postings."""

from __future__ import annotations

import logging
import re

from utils.arabic import normalize_arabic

logger = logging.getLogger(__name__)

# Common skill keywords to look for in job descriptions
_SKILL_PATTERNS = [
    # Technical
    r"Python", r"JavaScript", r"TypeScript", r"React", r"Node\.?js", r"SQL",
    r"Java\b", r"C\+\+", r"C#", r"\.NET", r"PHP", r"Laravel", r"Django",
    r"Flask", r"AWS", r"Azure", r"Docker", r"Kubernetes", r"Git",
    r"HTML", r"CSS", r"Flutter", r"Swift", r"Kotlin", r"MongoDB",
    r"PostgreSQL", r"MySQL", r"Redis", r"GraphQL", r"REST\s*API",
    r"Machine\s*Learning", r"Deep\s*Learning", r"NLP", r"AI",
    r"Figma", r"Adobe", r"Photoshop", r"Excel", r"Power\s*BI", r"Tableau",
    r"SAP", r"Oracle", r"Salesforce", r"Jira", r"Scrum", r"Agile",
    # Arabic skill terms
    r"تحليل\s*البيانات", r"إدارة\s*المشاريع", r"التسويق\s*الرقمي",
    r"المبيعات", r"خدمة\s*العملاء", r"المحاسبة", r"التصميم",
    r"البرمجة", r"الشبكات", r"أمن\s*المعلومات", r"الذكاء\s*الاصطناعي",
    r"التواصل", r"القيادة", r"العمل\s*الجماعي", r"حل\s*المشكلات",
]

_COMPILED_SKILLS = [re.compile(p, re.IGNORECASE) for p in _SKILL_PATTERNS]


class JobProcessorPipeline:
    """Normalise and extract structured info from job postings."""

    @staticmethod
    def normalize_title(title: str) -> str:
        """Normalise a job title for consistent matching."""
        if not title:
            return ""
        title = normalize_arabic(title)
        # Remove common filler words
        title = re.sub(r"\b(senior|junior|lead|staff|principal|مطلوب|فرصة|وظيفة)\b",
                       "", title, flags=re.IGNORECASE)
        return re.sub(r"\s+", " ", title).strip()

    @staticmethod
    def extract_skills_regex(description: str) -> list[str]:
        """Legacy regex-based skill extraction (fast fallback)."""
        if not description:
            return []
        found: set[str] = set()
        for pattern in _COMPILED_SKILLS:
            matches = pattern.findall(description)
            for m in matches:
                found.add(m.strip())
        return sorted(found)

    @classmethod
    def extract_skills(cls, description: str) -> list[str]:
        """Extract skills using LLM + semantic extraction, falling back to regex."""
        if not description:
            return []
        try:
            from services.skill_extractor import get_skill_extractor

            skills = get_skill_extractor().extract(description)
            if skills:
                return skills
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Semantic skill extraction failed, using regex: %s", exc)
        return cls.extract_skills_regex(description)

    def process(self, job_data: dict) -> dict:
        """Process a raw job dict into a normalised form.

        Expected input keys: title, description, company, location, ...
        Returns the same dict enriched with normalised_title and extracted_skills.
        """
        result = dict(job_data)  # shallow copy
        result["normalised_title"] = self.normalize_title(
            job_data.get("title", "")
        )
        # Feed the extractor the full text (title + description) so short descriptions
        # still benefit from job-title signals.
        combined_parts = [
            str(job_data.get("title", "")),
            str(job_data.get("description", "")),
        ]
        combined = "\n".join(p for p in combined_parts if p)
        result["extracted_skills"] = self.extract_skills(combined)
        if "description" in result:
            result["normalised_description"] = normalize_arabic(
                result["description"]
            )
        return result
