"""Job targeting compiler pipeline.

Turns free-form candidate preferences into a structured search configuration
that downstream scraping/matching agents can execute directly. Uses OpenRouter
for the heavy lifting and falls back to a minimal deterministic stub if the
LLM is unavailable.
"""

from __future__ import annotations

import json
import logging
import re

from prompts.templates import JOB_TARGETING_SYSTEM, JOB_TARGETING_USER
from services.llm_client import get_llm_client

logger = logging.getLogger(__name__)


_EMPTY_CONFIG: dict = {
    "agents": [],
    "global": {
        "candidate_summary": None,
        "deal_breakers": [],
        "willing_to_relocate": None,
        "visa_sponsorship_needed": None,
    },
    "warnings": [],
    "confidence": 0.0,
}


class JobTargetingPipeline:
    """Compile candidate preferences into a structured targeting config."""

    def run(
        self,
        *,
        user_preferences: str,
        resume_summary: str | None = None,
        skills: list[str] | None = None,
    ) -> dict:
        if not user_preferences or not user_preferences.strip():
            return {**_EMPTY_CONFIG, "warnings": ["empty preferences input"]}

        client = get_llm_client()
        if not client.is_available:
            return {**_EMPTY_CONFIG, "warnings": ["LLM unavailable"]}

        prompt = JOB_TARGETING_USER.format(
            user_preferences=user_preferences.strip()[:6000],
            resume_summary=(resume_summary or "(none)").strip()[:500],
            skills=", ".join(skills or []) or "(none)",
        )

        content = client.chat(
            messages=[
                {"role": "system", "content": JOB_TARGETING_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            max_tokens=1500,
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        if not content:
            return {**_EMPTY_CONFIG, "warnings": ["LLM returned no content"]}

        parsed = self._parse_json(content)
        if parsed is None:
            return {**_EMPTY_CONFIG, "warnings": ["failed to parse LLM JSON"]}

        return self._fill_defaults(parsed)

    # ------------------------------------------------------------------

    @staticmethod
    def _parse_json(content: str) -> dict | None:
        cleaned = content.strip().strip("`")
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
            cleaned = re.sub(r"\n?```$", "", cleaned)
        match = re.search(r"\{.*\}", cleaned, flags=re.S)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            logger.warning("JobTargeting: invalid JSON: %s", exc)
            return None
        return data if isinstance(data, dict) else None

    @staticmethod
    def _fill_defaults(data: dict) -> dict:
        """Guarantee every key in the schema is present so callers can trust the shape."""
        data.setdefault("agents", [])
        data.setdefault("warnings", [])
        data.setdefault("confidence", 0.5)
        gl = data.setdefault("global", {})
        gl.setdefault("candidate_summary", None)
        gl.setdefault("deal_breakers", [])
        gl.setdefault("willing_to_relocate", None)
        gl.setdefault("visa_sponsorship_needed", None)

        for agent in data["agents"]:
            agent.setdefault("id", "")
            agent.setdefault("label", "")
            agent.setdefault("titles", [])
            agent.setdefault("seniority", [])
            agent.setdefault("employment_type", [])
            agent.setdefault("locations", [])
            agent.setdefault("remote_preference", "any")
            agent.setdefault("industries", [])
            agent.setdefault("keywords_include", [])
            agent.setdefault("keywords_exclude", [])
            agent.setdefault("company_size", [])
            agent.setdefault("blacklist_companies", [])
            agent.setdefault("languages_required", [])
            agent.setdefault("notes", None)
            salary = agent.setdefault("min_salary", {})
            salary.setdefault("amount", None)
            salary.setdefault("currency", None)
            salary.setdefault("period", "monthly")
            salary.setdefault("period_source", None)
        return data
