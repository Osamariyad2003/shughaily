"""Apply Pack pipeline — orchestrator that bundles a ready-to-submit apply kit.

Reuses the CV-improver and cover-letter pipelines verbatim, then makes one
small LLM call to produce `match_points` and two form answers. Returns the
strict JSON shape the product expects.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from pipelines.cover_letter import CoverLetterPipeline
from pipelines.cv_improver import CVImproverPipeline
from services.llm_client import get_llm_client
from utils.arabic import normalize_arabic

logger = logging.getLogger(__name__)


_SYSTEM_PROMPT = (
    "You are a senior career coach writing job-application material. You "
    "ground every claim in the candidate facts provided — you never fabricate "
    "jobs, skills, or achievements. You mirror the JD's vocabulary naturally "
    "and avoid generic phrases like 'perfect fit' or 'passionate about'."
)


_USER_PROMPT = """Generate match points and two form answers tailored to this job.

Language: {language}

Job:
- Title: {job_title}
- Company: {company}
- Description (truncated): {job_description}

Candidate facts (only use these):
- Name: {name}
- Skills: {skills}
- Recent role: {recent_role}
- Summary: {summary}

Shared skills with the JD: {matched_skills}

Rules:
- match_points: 3-5 bullets, each under 140 chars, each tied to a specific JD
  requirement or responsibility and a specific candidate fact.
- why_this_job: 3-4 sentences. Mention something concrete about the company /
  product / mission drawn from the JD. No generic praise.
- why_hire_you: 3-4 sentences. Cite 2-3 concrete skills or achievements that
  map directly to the JD. No cliches.
- Mirror 3-5 keywords from the JD naturally.

Return ONLY this JSON shape, no preamble, no markdown, no code fences:
{{
  "match_points": ["...", "..."],
  "answers": {{
    "why_this_job": "...",
    "why_hire_you": "..."
  }}
}}
"""


class ApplyPackPipeline:
    """Assemble a full 'apply pack' by reusing existing CV + cover-letter pipelines."""

    def __init__(self) -> None:
        self._cv_improver = CVImproverPipeline()
        self._cover_letter = CoverLetterPipeline()

    # ── Helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _experience_one_liner(experience: list) -> str:
        Consider using a library like `django-batch-select` to batch fetch related objects, or use `select_related()` and `prefetch_related()` to eager load related objects.
            if isinstance(item, dict):
                t = (item.get("title") or "").strip()
                c = (item.get("company") or "").strip()
                if t and c:
                    return f"{t} at {c}"
                if t:
                    return t
            elif isinstance(item, str) and item.strip():
                return item.strip().split("\n")[0][:120]
        return ""

    @staticmethod
    def _matched_skills(user_skills: list[str], job_skills: list[str]) -> list[str]:
        if not user_skills or not job_skills:
            return []
        user_norm = {normalize_arabic(s).lower(): s for s in user_skills if s}
        matched: list[str] = []
        for js in job_skills:
            jn = normalize_arabic(js).lower()
            for un in user_norm:
                if jn == un or jn in un or un in jn:
                    matched.append(js)
                    break
        return matched

    @staticmethod
    def _cv_highlights_from_feedback(feedback: dict, matched: list[str]) -> list[str]:
        """Flatten the CV improver's structured feedback into actionable bullets."""
        out: list[str] = []
        for skill in matched[:5]:
            out.append(
                f"Highlight direct experience with {skill} in the summary and "
                "lead with a metric-backed bullet."
            )
        for item in feedback.get("experience_feedback", []):
            if item not in out:
                out.append(item)
        for item in feedback.get("summary_feedback", []):
            if item not in out:
                out.append(item)
        for item in feedback.get("skills_feedback", []):
            if item not in out:
                out.append(item)
        missing = feedback.get("missing_keywords") or []
        if missing:
            out.append(
                f"Add these JD keywords where you genuinely have experience: "
                f"{', '.join(missing[:8])}."
            )
        return out[:8]

    @staticmethod
    def _strip_fences(text: str) -> str:
        cleaned = text.strip().strip("`")
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
            cleaned = re.sub(r"\n?```$", "", cleaned)
        return cleaned.strip()

    # ── LLM: match points + two answers ─────────────────────────────────

    def _llm_match_and_answers(
        self,
        *,
        user: dict,
        parsed_resume: dict,
        job: dict,
        matched: list[str],
        language: str,
    ) -> dict | None:
        client = get_llm_client()
        if not client.is_available:
            return None

        prompt = _USER_PROMPT.format(
            language="Arabic" if language == "ar" else "English",
            job_title=job.get("title") or "(unspecified)",
            company=job.get("company") or "(unspecified)",
            job_description=(job.get("description") or "")[:2000] or "(not provided)",
            name=user.get("name") or "(not provided)",
            skills=", ".join((parsed_resume.get("skills") or [])[:15]) or "(none listed)",
            recent_role=self._experience_one_liner(parsed_resume.get("experience") or [])
            or "(none listed)",
            summary=(parsed_resume.get("summary") or "").strip() or "(none)",
            matched_skills=", ".join(matched[:10]) or "(none)",
        )
        try:
            content = client.chat(
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=700,
                temperature=0.4,
                response_format={"type": "json_object"},
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("apply_pack LLM call failed: %s", exc)
            return None

        if not content:
            return None
        try:
            parsed = json.loads(self._strip_fences(content))
        except json.JSONDecodeError as exc:
            logger.warning("apply_pack: non-JSON LLM output: %s | %s", exc, content[:200])
            return None
        if not isinstance(parsed, dict):
            return None
        return parsed

    # ── Deterministic fallback for match + answers ──────────────────────

    @staticmethod
    def _fallback_match_and_answers(
        *,
        user: dict,
        parsed_resume: dict,
        job: dict,
        matched: list[str],
        analysis: dict,
        language: str,
    ) -> dict:
        name = user.get("name") or "Applicant"
        role = job.get("title") or "this role"
        company = job.get("company") or "your team"
        first_resp = (analysis.get("responsibilities") or [""])[0]
        summary_bits = (parsed_resume.get("summary") or "").strip()

        if language == "ar":
            match_points = [
                f"مطابقة مباشرة مع {skill} من متطلبات {role}." for skill in matched[:4]
            ] or [f"خلفيتي تغطي المحاور الرئيسية لدور {role}."]
            if first_resp:
                match_points.append(
                    f"أستطيع المساهمة فعلياً في {first_resp.strip().rstrip('.')}."
                )
            why_this_job = (
                f"ما يجذبني إلى {company} هو طبيعة المشكلات التي تعملون عليها "
                f"وارتباطها المباشر بدور {role}. خبرتي تتقاطع مع "
                f"{', '.join(matched[:3]) or 'المتطلبات الأساسية'}، "
                "وهو ما يسمح لي بالمساهمة من اليوم الأول بدل الانتظار طويلاً."
            )
            why_hire_you = (
                f"أركّز على تسليم نتائج قابلة للقياس. عملت بشكل مباشر مع "
                f"{', '.join(matched[:3]) or (parsed_resume.get('skills') or ['الأدوات المطلوبة'])[0]}, "
                "وهي نفس الأدوات التي يتطلبها هذا الدور. أجيد الانتقال من المتطلبات الغامضة "
                "إلى حلول منشورة، وهو ما سيحتاجه الفريق."
            )
        else:
            match_points = [
                f"Direct match with {skill} from the {role} requirements."
                for skill in matched[:4]
            ] or [f"Background covers the core pillars of the {role} role."]
            if first_resp:
                match_points.append(
                    f"Can contribute to {first_resp.strip().rstrip('.')}"
                    " from day one."
                )
            why_this_job = (
                f"What draws me to {company} is the shape of the problems you're "
                f"solving, which lines up directly with the {role} role. My "
                f"background centers on {', '.join(matched[:3]) or 'the core stack listed in the JD'}, "
                "which means I can contribute from week one rather than ramp for a quarter."
            )
            why_hire_you = (
                f"I focus on shipped, measurable outcomes. "
                f"I've worked directly with {', '.join(matched[:3]) or (parsed_resume.get('skills') or ['the stack this role needs'])[0]}, "
                "the same tools this role calls for. "
                f"{(summary_bits.split('.')[0] + '.') if summary_bits else ''} "
                "I move from ambiguous requirements to released work quickly, which is what the team needs."
            ).strip()

        return {
            "match_points": match_points[:5],
            "answers": {"why_this_job": why_this_job, "why_hire_you": why_hire_you},
        }

    # ── Cover letter in the spec's 120–180 word range ───────────────────

    def _cover_letter_in_range(
        self,
        *,
        user: dict,
        parsed_resume: dict,
        job: dict,
        analysis: dict,
        language: str,
    ) -> str:
        """Prefer an LLM-polished letter at 120–180 words; else trim the long draft."""
        draft = self._cover_letter.build_full_letter(
            user=user, parsed_resume=parsed_resume, job=job,
            analysis=analysis, language=language,
        )
        polished = self._cover_letter._polish_with_llm(  # noqa: SLF001 — intentional reuse
            draft=draft, user=user, parsed_resume=parsed_resume,
            job=job, analysis=analysis, language=language,
            lo=120, hi=180,
        )
        if polished:
            return polished
        # Deterministic fallback: trim the full letter to 180 words.
        return self._cover_letter._enforce_word_range(draft, lo=120, hi=180)  # noqa: SLF001

    # ── Public entry point ──────────────────────────────────────────────

    def run(
        self,
        *,
        user: dict,
        parsed_resume: dict,
        job: dict,
        language: str = "en",
    ) -> dict[str, Any]:
        user = user or {}
        parsed_resume = parsed_resume or {}
        job = job or {}

        analysis = self._cover_letter.analyze_jd(
            description=job.get("description") or "",
            title=job.get("title") or "",
            company=job.get("company") or "",
        )
        matched = self._matched_skills(
            parsed_resume.get("skills") or [],
            analysis.get("required_skills") or [],
        )

        cv_feedback = self._cv_improver.suggest_improvements(
            parsed_resume,
            target_titles=[job.get("title")] if job.get("title") else None,
            target_jobs=[{"extracted_skills": analysis.get("required_skills") or []}],
        )
        cv_highlights = self._cv_highlights_from_feedback(cv_feedback, matched)

        llm_result = self._llm_match_and_answers(
            user=user, parsed_resume=parsed_resume, job=job,
            matched=matched, language=language,
        )
        used_llm = bool(llm_result)

        if llm_result and isinstance(llm_result.get("match_points"), list):
            match_points = [
                str(p).strip() for p in llm_result["match_points"] if str(p).strip()
            ][:5]
        else:
            match_points = []

        answers_llm = (llm_result or {}).get("answers") if isinstance(llm_result, dict) else None
        why_this_job = (
            str(answers_llm.get("why_this_job") or "").strip()
            if isinstance(answers_llm, dict) else ""
        )
        why_hire_you = (
            str(answers_llm.get("why_hire_you") or "").strip()
            if isinstance(answers_llm, dict) else ""
        )

        if not match_points or not why_this_job or not why_hire_you:
            fb = self._fallback_match_and_answers(
                user=user, parsed_resume=parsed_resume, job=job,
                matched=matched, analysis=analysis, language=language,
            )
            if not match_points:
                match_points = fb["match_points"]
            if not why_this_job:
                why_this_job = fb["answers"]["why_this_job"]
            if not why_hire_you:
                why_hire_you = fb["answers"]["why_hire_you"]

        cover_letter = self._cover_letter_in_range(
            user=user, parsed_resume=parsed_resume, job=job,
            analysis=analysis, language=language,
        )

        return {
            "cv_highlights": cv_highlights,
            "match_points": match_points,
            "answers": {
                "why_this_job": why_this_job,
                "why_hire_you": why_hire_you,
            },
            "cover_letter": cover_letter,
            "language": language,
            "llm": used_llm,
            "matched_skills": matched,
            "jd_analysis": analysis,
        }
