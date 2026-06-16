"""Cover letter pipeline.

Three-stage pipeline:
    1. analyze_jd(description) → responsibilities, skills, mission/values
    2. build_full_letter(...) → 180–250 word tailored letter
    3. build_short_letter(...) → <120 word email/DM-ready version

The pipeline grounds every claim in real data extracted from the resume and
JD — it never invents experience. When an LLM is available it can polish the
output, but the deterministic templates work fully offline.
"""

from __future__ import annotations

import logging
import re
from typing import Iterable

from pipelines.job_processor import JobProcessorPipeline
from services.llm_client import get_llm_client
from utils.arabic import normalize_arabic

logger = logging.getLogger(__name__)


_POLISH_SYSTEM = (
    "You are a senior career writer. You rewrite cover letters to feel "
    "specific, human, and grounded in the candidate's real experience. "
    "You never invent jobs, skills, or achievements that are not provided. "
    "You match the language requested (English or Arabic)."
)

_POLISH_USER_TEMPLATE = """Rewrite the cover letter draft below so it is sharper, more specific, and avoids cliches. Stay strictly within the candidate facts provided. Mirror the JD's vocabulary naturally. Keep it between {lo} and {hi} words.

Language: {language}

Company: {company}
Role: {role}

JD analysis:
- Required skills: {required_skills}
- Top responsibilities: {responsibilities}
- Mission/values: {mission}

Candidate facts (only use these, never invent more):
- Name: {name}
- Skills: {user_skills}
- Recent role: {recent_role}
- Summary: {summary}

Draft to rewrite:
---
{draft}
---

Return ONLY the rewritten letter, no preamble, no markdown, no code fences."""


# ── JD analysis helpers ──────────────────────────────────────────────────

_RESPONSIBILITY_HINTS = (
    "you will", "you'll", "responsibilities", "what you'll do",
    "key duties", "in this role", "the role", "your day", "expected to",
    "ستقوم", "المسؤوليات", "المهام", "ستعمل",
)

_MISSION_HINTS = (
    "our mission", "we believe", "we are passionate", "we value",
    "our vision", "we're building", "our purpose", "founded to",
    "we exist", "company values", "what we stand for",
    "مهمتنا", "رؤيتنا", "نؤمن", "قيمنا",
)

_BULLET_PATTERN = re.compile(r"^\s*(?:[-*•·●▪▶►]|\d+[.)])\s*(.+)$", re.MULTILINE)


def _split_sentences(text: str) -> list[str]:
    if not text:
        return []
    cleaned = re.sub(r"\s+", " ", text).strip()
    parts = re.split(r"(?<=[.!?؟])\s+", cleaned)
    return [p.strip(" .•-") for p in parts if p and p.strip()]


def _extract_bullets(text: str) -> list[str]:
    if not text:
        return []
    return [m.group(1).strip(" .") for m in _BULLET_PATTERN.finditer(text)]


def _find_lines_with_hints(text: str, hints: Iterable[str]) -> list[str]:
    if not text:
        return []
    lower = text.lower()
    matches: list[str] = []
    seen: set[str] = set()
    for sent in _split_sentences(text):
        s_low = sent.lower()
        if any(hint in s_low for hint in hints):
            key = s_low[:80]
            if key not in seen and 20 <= len(sent) <= 240:
                seen.add(key)
                matches.append(sent)
    return matches


# ── Pipeline ─────────────────────────────────────────────────────────────


class CoverLetterPipeline:
    """Generate JD analysis + full/short cover letters grounded in resume data."""

    def analyze_jd(self, description: str, title: str = "", company: str = "") -> dict:
        """Extract responsibilities, required skills, and mission/values from a JD."""
        text = description or ""

        # Skills via the semantic skill extractor (handles paraphrases)
        skills = JobProcessorPipeline.extract_skills(f"{title}\n{text}")[:10]

        # Responsibilities: prefer bullet points, then sentences with hint phrases
        bullets = _extract_bullets(text)
        responsibilities: list[str] = []
        seen: set[str] = set()
        for b in bullets:
            key = b.lower()[:80]
            if key in seen:
                continue
            if 15 <= len(b) <= 220:
                responsibilities.append(b)
                seen.add(key)
            if len(responsibilities) >= 6:
                break

        if len(responsibilities) < 4:
            for line in _find_lines_with_hints(text, _RESPONSIBILITY_HINTS):
                key = line.lower()[:80]
                if key not in seen:
                    responsibilities.append(line)
                    seen.add(key)
                if len(responsibilities) >= 6:
                    break

        # Mission / values: hint-based sentence detection
        mission_lines = _find_lines_with_hints(text, _MISSION_HINTS)[:3]

        return {
            "title": title,
            "company": company,
            "responsibilities": responsibilities,
            "required_skills": skills,
            "mission_values": mission_lines,
        }

    # ------------------------------------------------------------------
    # Letter generation
    # ------------------------------------------------------------------

    @staticmethod
    def _matched_skills(user_skills: list[str], job_skills: list[str]) -> list[str]:
        if not user_skills or not job_skills:
            return []
        user_norm = {normalize_arabic(s).lower(): s for s in user_skills if s}
        matched: list[str] = []
        for js in job_skills:
            jn = normalize_arabic(js).lower()
            for un, original in user_norm.items():
                if jn == un or jn in un or un in jn:
                    matched.append(js)
                    break
        return matched

    @staticmethod
    def _experience_one_liner(experience: list) -> str:
        for item in experience or []:
            if isinstance(item, dict):
                title = (item.get("title") or "").strip()
                company = (item.get("company") or "").strip()
                if title and company:
                    return f"{title} at {company}"
                if title:
                    return title
            elif isinstance(item, str) and item.strip():
                return item.strip().split("\n")[0][:120]
        return ""

    def build_full_letter(
        self,
        *,
        user: dict,
        parsed_resume: dict,
        job: dict,
        analysis: dict,
        language: str = "en",
    ) -> str:
        name = user.get("name") or "Applicant"
        company = job.get("company") or "your team"
        role = job.get("title") or "this role"

        user_skills = parsed_resume.get("skills") or []
        matched = self._matched_skills(user_skills, analysis.get("required_skills") or [])
        skills_phrase = ", ".join(matched[:5]) if matched else ", ".join(user_skills[:5])

        experience_line = self._experience_one_liner(parsed_resume.get("experience") or [])
        summary = (parsed_resume.get("summary") or "").strip()
        first_responsibility = (analysis.get("responsibilities") or [""])[0]
        mission = (analysis.get("mission_values") or [""])[0]

        if language == "ar":
            opener = (
                f"ما يجذبني إلى {company} هو {mission.strip().rstrip('.') }."
                if mission else
                f"يستوقفني الأثر الذي تصنعه {company} في مجالها."
            )
            body_one = (
                f"خلال خبرتي {('كـ' + experience_line) if experience_line else ''} "
                f"عملت بشكل مباشر على {skills_phrase}، "
                f"وهي بالضبط ما يتطلبه دور {role}."
            ).strip()
            body_two = (
                f"أرى نفسي قادراً على المساهمة في {first_responsibility.strip().rstrip('.')}, "
                "من خلال الجمع بين الخبرة العملية والتركيز على النتائج القابلة للقياس."
            ) if first_responsibility else (
                "أركّز على تسليم نتائج قابلة للقياس بدلاً من المخرجات الشكلية."
            )
            closer = (
                f"يسعدني مناقشة كيف يمكنني دعم فريق {company} عن قرب.\n\n"
                f"مع خالص التقدير،\n{name}"
            )
            paragraphs = [opener, body_one, body_two, closer]
        else:
            opener = (
                f"What drew me to {company} was {mission.strip().rstrip('.')}."
                if mission else
                f"{company}'s work in this space is exactly the kind of problem I want to spend my time on."
            )
            body_one = (
                f"In my recent work{(' as ' + experience_line) if experience_line else ''}, "
                f"I have built directly with {skills_phrase} — the same stack the {role} role calls for."
            )
            if summary:
                body_one += f" {summary.split('.')[0].strip()}."
            body_two = (
                f"I'm particularly drawn to {first_responsibility.strip().rstrip('.')}, "
                "because that is where I do my best work: turning ambiguous requirements into shipped, measurable outcomes."
            ) if first_responsibility else (
                "I focus on shipping measurable outcomes rather than checking off tasks."
            )
            closer = (
                f"I would welcome the chance to talk about how I can contribute to {company}'s next chapter.\n\n"
                f"Sincerely,\n{name}"
            )
            paragraphs = [opener, body_one, body_two, closer]

        letter = "\n\n".join(p for p in paragraphs if p)
        return self._enforce_word_range(letter, lo=180, hi=250)

    def build_short_letter(
        self,
        *,
        user: dict,
        parsed_resume: dict,
        job: dict,
        analysis: dict,
        language: str = "en",
    ) -> str:
        name = user.get("name") or "Applicant"
        company = job.get("company") or "your team"
        role = job.get("title") or "this role"
        user_skills = parsed_resume.get("skills") or []
        matched = self._matched_skills(user_skills, analysis.get("required_skills") or [])
        skills_phrase = ", ".join(matched[:4]) if matched else ", ".join(user_skills[:4])
        first_responsibility = (analysis.get("responsibilities") or [""])[0]

        if language == "ar":
            text = (
                f"مرحباً، أتواصل بخصوص دور {role} في {company}. "
                f"أعمل حالياً مع {skills_phrase}، وهي المهارات التي يتمحور حولها الإعلان. "
                + (f"يهمني تحديداً الجزء المتعلق بـ{first_responsibility.strip().rstrip('.')}. " if first_responsibility else "")
                + "يسعدني تنسيق مكالمة قصيرة لمناقشة التفاصيل.\n\n"
                f"شكراً لوقتكم،\n{name}"
            )
        else:
            text = (
                f"Hi — I'd like to be considered for the {role} role at {company}. "
                f"My day-to-day already centers on {skills_phrase}, which lines up with what you're hiring for. "
                + (f"The piece I'm most excited about is {first_responsibility.strip().rstrip('.')}. " if first_responsibility else "")
                + "Happy to share more on a short call.\n\n"
                f"Best,\n{name}"
            )
        return self._enforce_word_range(text, lo=60, hi=120)

    # ------------------------------------------------------------------
    # Length control
    # ------------------------------------------------------------------

    @staticmethod
    def _enforce_word_range(text: str, *, lo: int, hi: int) -> str:
        words = text.split()
        if len(words) <= hi:
            return text
        # Trim from the body, keep opener + closer intact
        paragraphs = text.split("\n\n")
        if len(paragraphs) <= 2:
            return " ".join(words[:hi])
        head, *middle, tail = paragraphs
        budget = hi - len(head.split()) - len(tail.split())
        if budget <= 0:
            return "\n\n".join([head, tail])
        trimmed_middle: list[str] = []
        used = 0
        for para in middle:
            w = para.split()
            if used + len(w) <= budget:
                trimmed_middle.append(para)
                used += len(w)
            else:
                remaining = budget - used
                if remaining > 10:
                    trimmed_middle.append(" ".join(w[:remaining]))
                break
        return "\n\n".join([head, *trimmed_middle, tail])

    # ------------------------------------------------------------------
    # LLM polish (optional)
    # ------------------------------------------------------------------

    def _polish_with_llm(
        self,
        *,
        draft: str,
        user: dict,
        parsed_resume: dict,
        job: dict,
        analysis: dict,
        language: str,
        lo: int,
        hi: int,
    ) -> str | None:
        """Use OpenRouter to polish a draft. Returns None if LLM unavailable or fails."""
        client = get_llm_client()
        if not client.is_available:
            return None

        prompt = _POLISH_USER_TEMPLATE.format(
            lo=lo, hi=hi,
            language="Arabic" if language == "ar" else "English",
            company=job.get("company") or "the company",
            role=job.get("title") or "the role",
            required_skills=", ".join(analysis.get("required_skills") or []) or "(not extracted)",
            responsibilities=" | ".join(analysis.get("responsibilities") or []) or "(not extracted)",
            mission=" | ".join(analysis.get("mission_values") or []) or "(not stated)",
            name=user.get("name") or "the candidate",
            user_skills=", ".join(parsed_resume.get("skills") or []) or "(none listed)",
            recent_role=self._experience_one_liner(parsed_resume.get("experience") or []) or "(none listed)",
            summary=(parsed_resume.get("summary") or "").strip() or "(none)",
            draft=draft,
        )
        polished = client.chat(
            messages=[
                {"role": "system", "content": _POLISH_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            max_tokens=600,
            temperature=0.4,
        )
        if not polished:
            return None
        cleaned = polished.strip().strip("`")
        # Strip stray markdown code fences if any
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
            cleaned = re.sub(r"\n?```$", "", cleaned)
        return self._enforce_word_range(cleaned.strip(), lo=lo, hi=hi)

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def run(
        self,
        *,
        user: dict,
        parsed_resume: dict,
        job: dict,
        language: str = "en",
        polish: bool = True,
    ) -> dict:
        analysis = self.analyze_jd(
            description=job.get("description") or "",
            title=job.get("title") or "",
            company=job.get("company") or "",
        )
        full_letter = self.build_full_letter(
            user=user, parsed_resume=parsed_resume, job=job,
            analysis=analysis, language=language,
        )
        short_letter = self.build_short_letter(
            user=user, parsed_resume=parsed_resume, job=job,
            analysis=analysis, language=language,
        )

        polished_full = polished_short = None
        if polish:
            polished_full = self._polish_with_llm(
                draft=full_letter, user=user, parsed_resume=parsed_resume,
                job=job, analysis=analysis, language=language, lo=180, hi=250,
            )
            if polished_full:
                full_letter = polished_full
            polished_short = self._polish_with_llm(
                draft=short_letter, user=user, parsed_resume=parsed_resume,
                job=job, analysis=analysis, language=language, lo=60, hi=120,
            )
            if polished_short:
                short_letter = polished_short

        return {
            "jd_analysis": analysis,
            "full_cover_letter": full_letter,
            "short_cover_letter": short_letter,
            "word_count_full": len(full_letter.split()),
            "word_count_short": len(short_letter.split()),
            "language": language,
            "llm_polished": bool(polished_full or polished_short),
        }
