"""Auto-Apply Decision pipeline — the 9th الشغيلي agent.

Decides whether we should auto-apply to a job on behalf of the user, given a
structured profile, a job description, a match score, and the user's rules.

The pipeline applies deterministic hard gates first (excluded company / keyword,
match-score threshold, must-have keyword), then asks the LLM to refine reasons,
risk flags, and confidence. If the LLM is unavailable the deterministic layer
still produces a valid decision.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from services.llm_client import get_llm_client
from utils.arabic import normalize_arabic

logger = logging.getLogger(__name__)


_VALID_DECISIONS = {"APPLY", "SKIP", "REVIEW"}


_SYSTEM_PROMPT = (
    "You are an AI job application decision engine for الشغيلي. Given a user "
    "profile, a job posting, a match score, and the user's rules, you decide "
    "whether to auto-apply, skip, or route the job for human review. You "
    "return STRICT JSON and never fabricate skills, companies, or job facts."
)


_USER_PROMPT = """Evaluate whether to auto-apply to this job.

Rules (already partially evaluated — respect the hard_gate if set):
{rules_json}

Hard gate (from deterministic pre-check; do NOT override):
{hard_gate_json}

User Profile:
{profile_json}

Job:
{job_json}

Match Score: {match_score}

Language for reasons: {language}

Return ONLY this JSON shape, no preamble, no markdown, no code fences:
{{
  "decision": "APPLY" | "SKIP" | "REVIEW",
  "confidence": 0-100,
  "reasons": ["short bullet reason", "..."],
  "missing_requirements": ["missing skill or gap", "..."],
  "risk_flags": ["concern", "..."]
}}

Rules for the decision:
- If hard_gate.decision is set, you MUST use that decision; only refine the text fields.
- APPLY only when: score ≥ min_match_score AND no must-have keyword is missing AND no excluded keyword / company hit AND no dealbreaker.
- SKIP when: excluded company / keyword / dealbreaker hits, OR score is far below threshold.
- REVIEW when: close to threshold, missing a must-have keyword, ambiguous seniority, or salary gap.
- Keep each reason under 140 characters.
"""


class AutoApplyDecisionPipeline:
    """Decide APPLY / SKIP / REVIEW for a (user, job, score, rules) tuple."""

    # ── Normalization helpers ────────────────────────────────────────────

    @staticmethod
    def _norm(text: str) -> str:
        return normalize_arabic(str(text or "")).lower().strip()

    @classmethod
    def _as_list(cls, value: Any) -> list[str]:
        if not value:
            return []
        if isinstance(value, str):
            return [value]
        if isinstance(value, list):
            return [str(v) for v in value if v is not None]
        return []

    @classmethod
    def _contains_any(cls, haystack: str, needles: list[str]) -> list[str]:
        """Return the subset of needles found in haystack (case/arabic-normalized)."""
        if not haystack or not needles:
            return []
        hay = cls._norm(haystack)
        hits: list[str] = []
        for n in needles:
            nn = cls._norm(n)
            if nn and nn in hay:
                hits.append(n)
        return hits

    # ── Deterministic hard gates ─────────────────────────────────────────

    def _evaluate_rules(
        self, *, profile: dict, job: dict, match_score: float, rules: dict
    ) -> dict:
        """Run all deterministic checks. Returns a structured pre-decision.

        Shape:
            {
              "decision": "APPLY"|"SKIP"|"REVIEW"|None,   # None = let LLM decide
              "reasons": [...],
              "missing_requirements": [...],
              "risk_flags": [...],
            }
        """
        reasons: list[str] = []
        missing: list[str] = []
        risks: list[str] = []
        forced: str | None = None

        min_score = rules.get("min_match_score")
        try:
            min_score = float(min_score) if min_score is not None else None
        except (TypeError, ValueError):
            min_score = None

        must_have = self._as_list(rules.get("must_have_keywords"))
        excluded_kw = self._as_list(rules.get("excluded_keywords"))
        preferred_co = self._as_list(rules.get("preferred_companies"))
        excluded_co = self._as_list(rules.get("excluded_companies"))
        dealbreakers = self._as_list(profile.get("dealbreakers"))

        job_blob = " ".join(
            [
                str(job.get("title") or ""),
                str(job.get("company") or ""),
                str(job.get("location") or ""),
                str(job.get("salary") or ""),
                str(job.get("description") or ""),
                " ".join(self._as_list(job.get("requirements"))),
                " ".join(self._as_list(job.get("responsibilities"))),
            ]
        )

        # ── Hard SKIP: excluded company ──
        company = str(job.get("company") or "")
        for banned in excluded_co:
            if self._norm(banned) and self._norm(banned) in self._norm(company):
                forced = "SKIP"
                reasons.append(f"Company '{company}' is on the user's excluded list.")
                break

        # ── Hard SKIP: excluded keyword in job text ──
        if forced != "SKIP":
            bad_kw = self._contains_any(job_blob, excluded_kw)
            if bad_kw:
                forced = "SKIP"
                reasons.append(
                    f"Job contains excluded keyword(s): {', '.join(bad_kw)}."
                )

        # ── Hard SKIP: dealbreaker ──
        if forced != "SKIP":
            triggered = self._contains_any(job_blob, dealbreakers)
            if triggered:
                forced = "SKIP"
                reasons.append(
                    f"Dealbreaker(s) triggered: {', '.join(triggered)}."
                )

        # ── Must-have keyword check ──
        if must_have:
            missing_kw = [k for k in must_have if not self._contains_any(job_blob, [k])]
            if missing_kw:
                missing.extend(missing_kw)
                if forced != "SKIP":
                    forced = "REVIEW"
                    reasons.append(
                        f"Job missing must-have keyword(s): {', '.join(missing_kw)}."
                    )

        # ── Match-score threshold ──
        if min_score is not None:
            if match_score < min_score - 10:
                if forced is None:
                    forced = "SKIP"
                reasons.append(
                    f"Match score {match_score:.0f} is well below the minimum "
                    f"({min_score:.0f})."
                )
            elif match_score < min_score:
                if forced is None:
                    forced = "REVIEW"
                reasons.append(
                    f"Match score {match_score:.0f} is just under the minimum "
                    f"({min_score:.0f})."
                )
            else:
                reasons.append(
                    f"Match score {match_score:.0f} meets the minimum "
                    f"({min_score:.0f})."
                )

        # ── Skill-gap diagnostics (non-gating) ──
        user_skills = [self._norm(s) for s in self._as_list(profile.get("skills"))]
        job_req_skills = self._as_list(job.get("required_skills")) or self._as_list(
            job.get("requirements")
        )
        for req in job_req_skills:
            req_norm = self._norm(req)
            if req_norm and not any(req_norm in us or us in req_norm for us in user_skills):
                if req not in missing:
                    missing.append(req)

        # ── Preferred company signal (soft) ──
        if preferred_co:
            for pref in preferred_co:
                if self._norm(pref) and self._norm(pref) in self._norm(company):
                    reasons.append(f"Company '{company}' is on the preferred list.")
                    break

        # ── Seniority mismatch risk ──
        title = self._norm(job.get("title"))
        years = profile.get("experience_years")
        try:
            years_val = float(years) if years is not None else None
        except (TypeError, ValueError):
            years_val = None
        if years_val is not None:
            if "senior" in title and years_val < 4:
                risks.append("Job is senior-level but user has <4 years of experience.")
            if ("junior" in title or "entry" in title) and years_val > 6:
                risks.append("Job is junior/entry-level but user has >6 years of experience.")
            if ("lead" in title or "principal" in title) and years_val < 6:
                risks.append("Job is lead-level but user has <6 years of experience.")

        # ── Salary risk ──
        min_salary = profile.get("min_salary") or profile.get("salary_expectation")
        job_salary = job.get("salary") or job.get("salary_text")
        if min_salary and job_salary:
            salary_nums = re.findall(r"\d[\d,]*", str(job_salary))
            if salary_nums:
                try:
                    low = int(salary_nums[0].replace(",", ""))
                    if low and low < float(min_salary) * 0.9:
                        risks.append(
                            f"Listed salary ({job_salary}) is below the user's "
                            f"expectation ({min_salary})."
                        )
                except ValueError:
                    pass

        # ── Default: if we passed all hard gates and score meets threshold, APPLY ──
        if forced is None and min_score is not None and match_score >= min_score:
            forced = "APPLY"

        return {
            "decision": forced,
            "reasons": reasons,
            "missing_requirements": missing,
            "risk_flags": risks,
        }

    # ── LLM refinement ───────────────────────────────────────────────────

    @staticmethod
    def _strip_fences(text: str) -> str:
        cleaned = text.strip().strip("`")
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
            cleaned = re.sub(r"\n?```$", "", cleaned)
        return cleaned.strip()

    def _call_llm(
        self,
        *,
        profile: dict,
        job: dict,
        match_score: float,
        rules: dict,
        hard_gate: dict,
        language: str,
    ) -> dict | None:
        client = get_llm_client()
        if not client.is_available:
            return None

        prompt = _USER_PROMPT.format(
            rules_json=json.dumps(rules, ensure_ascii=False),
            hard_gate_json=json.dumps(
                {"decision": hard_gate.get("decision")}, ensure_ascii=False
            ),
            profile_json=json.dumps(profile, ensure_ascii=False)[:2500],
            job_json=json.dumps(job, ensure_ascii=False)[:3000],
            match_score=match_score,
            language="Arabic" if language == "ar" else "English",
        )

        try:
            content = client.chat(
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=700,
                temperature=0.2,
                response_format={"type": "json_object"},
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("auto_apply_decision LLM call failed: %s", exc)
            return None

        if not content:
            return None

        try:
            parsed = json.loads(self._strip_fences(content))
        except json.JSONDecodeError as exc:
            logger.warning(
                "auto_apply_decision: non-JSON LLM output: %s | %s",
                exc,
                content[:200],
            )
            return None

        if not isinstance(parsed, dict):
            return None
        return parsed

    # ── Public entry point ───────────────────────────────────────────────

    def decide(
        self,
        *,
        user_profile: dict,
        job: dict,
        match_score: float,
        rules: dict,
        language: str = "en",
    ) -> dict:
        """Produce the final APPLY / SKIP / REVIEW decision as strict JSON."""
        profile = user_profile or {}
        job_data = job or {}
        rule_data = rules or {}

        try:
            score_val = float(match_score)
        except (TypeError, ValueError):
            score_val = 0.0
        score_val = max(0.0, min(100.0, score_val))

        hard = self._evaluate_rules(
            profile=profile, job=job_data, match_score=score_val, rules=rule_data
        )

        llm_result = self._call_llm(
            profile=profile,
            job=job_data,
            match_score=score_val,
            rules=rule_data,
            hard_gate=hard,
            language=language,
        )

        # Merge: hard-gate decision is authoritative; LLM refines text fields.
        decision = hard["decision"]
        reasons = list(hard["reasons"])
        missing = list(hard["missing_requirements"])
        risks = list(hard["risk_flags"])
        confidence: float | None = None
        used_llm = False

        if llm_result:
            used_llm = True
            llm_decision = str(llm_result.get("decision") or "").upper()
            if decision is None and llm_decision in _VALID_DECISIONS:
                decision = llm_decision
            try:
                confidence = float(llm_result.get("confidence"))
            except (TypeError, ValueError):
                confidence = None

            for r in llm_result.get("reasons") or []:
                r_str = str(r).strip()
                if r_str and r_str not in reasons:
                    reasons.append(r_str)
            for m in llm_result.get("missing_requirements") or []:
                m_str = str(m).strip()
                if m_str and m_str not in missing:
                    missing.append(m_str)
            for r in llm_result.get("risk_flags") or []:
                r_str = str(r).strip()
                if r_str and r_str not in risks:
                    risks.append(r_str)

        if decision not in _VALID_DECISIONS:
            decision = "REVIEW"

        if confidence is None:
            confidence = self._heuristic_confidence(
                decision=decision, match_score=score_val, hard=hard
            )
        confidence = max(0.0, min(100.0, confidence))

        return {
            "decision": decision,
            "confidence": round(confidence),
            "reasons": reasons[:8],
            "missing_requirements": missing[:10],
            "risk_flags": risks[:8],
            "match_score": round(score_val, 2),
            "llm": used_llm,
        }

    # ── Deterministic confidence fallback ────────────────────────────────

    @staticmethod
    def _heuristic_confidence(*, decision: str, match_score: float, hard: dict) -> float:
        base = match_score
        if decision == "SKIP":
            # High confidence when a hard gate fired; otherwise mirror the gap.
            return 85.0 if hard["reasons"] else max(55.0, 100.0 - match_score)
        if decision == "REVIEW":
            return 55.0
        # APPLY
        penalty = 5.0 * len(hard["risk_flags"]) + 4.0 * len(hard["missing_requirements"])
        return max(50.0, base - penalty)
