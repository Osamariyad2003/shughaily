"""Matching pipeline - compute compatibility scores between users and jobs."""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from pathlib import Path

import numpy as np

from prompts.templates import MATCH_EXPLANATION_PROMPT
from utils.arabic import normalize_arabic

logger = logging.getLogger(__name__)

# Curated variant-spelling -> canonical-form vocabulary, kept in an editable
# JSON file (not inline) so extending it — new abbreviations, new Arabic
# transliterations — never needs a code change/deploy. Deliberately modest
# rather than exhaustive; extend as real false-negatives ("this obviously
# matches but didn't") show up.
_SKILL_ALIASES_PATH = Path(__file__).resolve().parent.parent / "data" / "skill_aliases.json"


def _collapse_separators(text: str) -> str:
    collapsed = re.sub(r"[.\-_/]", " ", text)
    return re.sub(r"\s+", " ", collapsed).strip()


def _load_skill_aliases(path: Path) -> dict[str, str]:
    """Loads skill_aliases.json and re-keys every alias through the exact
    same normalization pipeline _canonical_skill's input has already been
    through (NFKC -> Arabic normalization -> lowercase -> separator
    collapse) by the time it does the lookup. This lets the JSON file be
    authored in natural spelling (real Arabic diacritics, "node.js" with a
    dot, etc.) instead of requiring whoever edits it to hand-compute the
    internal normalized key — the loader reconciles that, not the editor.
    """
    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
    except FileNotFoundError:
        logger.warning("skill_aliases.json not found at %s — skill aliasing disabled.", path)
        return {}
    except json.JSONDecodeError as exc:
        logger.warning("skill_aliases.json is malformed (%s) — skill aliasing disabled.", exc)
        return {}

    aliases: dict[str, str] = {}
    for key, value in raw.items():
        normalized_key = _collapse_separators(
            normalize_arabic(unicodedata.normalize("NFKC", str(key))).lower()
        )
        aliases[normalized_key] = value
    return aliases


SKILL_ALIASES: dict[str, str] = _load_skill_aliases(_SKILL_ALIASES_PATH)


class MatcherPipeline:
    """Score how well a user profile matches a job posting."""

    # ------------------------------------------------------------------
    # Component scores
    # ------------------------------------------------------------------

    @staticmethod
    def _norm_skill(s: str) -> str:
        # NFKC first: canonicalizes Unicode representation (fullwidth forms,
        # compatibility characters, some Arabic presentation forms) so two
        # byte-different-but-visually-identical strings normalize the same
        # way before the Arabic-specific tashkeel/alef-variant handling and
        # the alias lookup ever see them.
        return normalize_arabic(unicodedata.normalize("NFKC", str(s))).lower().strip()

    @staticmethod
    def _canonical_skill(skill: str) -> str:
        """Collapse separators and resolve known variant spellings via
        SKILL_ALIASES, so "JS"/"React.js"/"Postgres"/"بايثون" all line up
        with their canonical forms before comparison. Input is expected to
        already be _norm_skill()-normalized (NFKC + Arabic-normalized +
        lowercased) — this only handles the separator-collapse + alias step
        on top of that."""
        collapsed = _collapse_separators(skill)
        return SKILL_ALIASES.get(collapsed, collapsed)

    @classmethod
    def _fuzzy_skill_match(cls, user_skill: str, job_skill: str) -> bool:
        """Return True if user_skill covers job_skill, via exact match, a
        known alias, or word-boundary containment — never a raw substring
        check. Substring matching (the old behavior) produces real false
        positives: "java" is a substring of "javascript", "go" of "google",
        and single-letter skills like "r" match almost anything.
        """
        if not user_skill or not job_skill:
            return False
        if user_skill == job_skill:
            return True

        u = cls._canonical_skill(user_skill)
        j = cls._canonical_skill(job_skill)
        if u == j:
            return True

        # Word-boundary containment: u (or j) must appear as whole word(s)
        # inside the other, not merely as a substring — "java" no longer
        # matches inside "javascript" since there's no word boundary
        # between "java" and the following "script".
        if re.search(rf"\b{re.escape(u)}\b", j) or re.search(rf"\b{re.escape(j)}\b", u):
            return True

        # Token-overlap fallback for genuinely multi-word skills (e.g.
        # "machine learning engineer" vs "machine learning") — only when at
        # least one side is actually multi-word, so this can't degrade back
        # into single-token substring-style false positives.
        u_tokens = set(u.split())
        j_tokens = set(j.split())
        if (len(u_tokens) > 1 or len(j_tokens) > 1) and u_tokens and j_tokens:
            shared = len(u_tokens & j_tokens)
            return shared / max(len(j_tokens), 1) >= 0.5

        return False

    @classmethod
    def compute_skill_overlap(cls, user_skills: list[str], job_skills: list[str]) -> float:
        """Return 0-1 ratio of job skills covered by user skills (fuzzy match)."""
        if not job_skills:
            return 1.0
        user_norm = [cls._norm_skill(s) for s in user_skills if s]
        job_norm = [cls._norm_skill(s) for s in job_skills if s]
        if not job_norm:
            return 1.0
        if not user_norm:
            return 0.0
        matched = 0
        for js in job_norm:
            if any(cls._fuzzy_skill_match(us, js) for us in user_norm):
                matched += 1
        return matched / len(job_norm)

    @staticmethod
    def compute_semantic_similarity(
        user_embedding: np.ndarray, job_embedding: np.ndarray
    ) -> float:
        """Cosine similarity between two embedding vectors (0-1)."""
        if user_embedding is None or job_embedding is None:
            return 0.0
        u = user_embedding.flatten()
        j = job_embedding.flatten()
        norm_u = np.linalg.norm(u)
        norm_j = np.linalg.norm(j)
        if norm_u == 0 or norm_j == 0:
            return 0.0
        sim = float(np.dot(u, j) / (norm_u * norm_j))
        # Clamp to [0, 1]
        return max(0.0, min(1.0, sim))

    @staticmethod
    def compute_score(
        skill_score: float,
        semantic_score: float,
        weights: dict | None = None,
    ) -> float:
        """Weighted combination of sub-scores. Returns 0-100.

        Semantic similarity is rescaled: cosine sims of ~0.3 on multilingual MiniLM
        already represent a topical match, so we stretch [0.2, 0.7] to [0, 1].
        """
        w = weights or {"skill": 0.4, "semantic": 0.6}
        # Stretch semantic range so moderate similarities read more fairly
        stretched = max(0.0, min(1.0, (semantic_score - 0.2) / 0.5))
        raw = w["skill"] * skill_score + w["semantic"] * stretched
        return round(raw * 100, 1)

    # ------------------------------------------------------------------
    # Explanation
    # ------------------------------------------------------------------

    @staticmethod
    def generate_explanation(
        matched_skills: list[str],
        missing_skills: list[str],
        score: float,
    ) -> str:
        """Generate a human-readable Arabic explanation of the match."""
        if score >= 80:
            intro = "تطابق ممتاز! عندك أغلب المهارات المطلوبة."
        elif score >= 60:
            intro = "تطابق جيد. عندك كثير من المهارات لكن في مجال للتحسين."
        elif score >= 40:
            intro = "تطابق متوسط. ممكن تكون مناسبة لكن تحتاج تطوّر بعض المهارات."
        else:
            intro = "التطابق ضعيف حالياً، لكن لا تحبط - كل مهارة ممكن تتعلمها."

        parts = [intro]

        if matched_skills:
            parts.append(f"المهارات المتطابقة: {', '.join(matched_skills)}")
        if missing_skills:
            parts.append(f"المهارات اللي تحتاج تطورها: {', '.join(missing_skills)}")

        if score < 50 and missing_skills:
            parts.append(
                "نصيحة: ركّز على تعلّم المهارات الناقصة من خلال دورات أونلاين "
                "أو مشاريع شخصية. كل مهارة جديدة ترفع فرصك."
            )

        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Full pipeline
    # ------------------------------------------------------------------

    def run(
        self,
        user_data: dict,
        job_data: dict,
        user_embedding: np.ndarray | None = None,
        job_embedding: np.ndarray | None = None,
    ) -> dict:
        """Run full matching pipeline.

        user_data expects: skills (list[str])
        job_data expects: extracted_skills (list[str])
        """
        user_skills = user_data.get("skills", [])
        job_skills = job_data.get("extracted_skills", job_data.get("skills", []))

        # Skill overlap
        skill_score = self.compute_skill_overlap(user_skills, job_skills)

        # Semantic similarity
        semantic_score = self.compute_semantic_similarity(
            user_embedding, job_embedding
        )

        # Combined score
        score = self.compute_score(skill_score, semantic_score)

        # Identify matched / missing (fuzzy)
        user_norm_list = [self._norm_skill(s) for s in user_skills if s]
        matched: list[str] = []
        missing: list[str] = []
        for js in job_skills:
            jn = self._norm_skill(js)
            if any(self._fuzzy_skill_match(un, jn) for un in user_norm_list):
                matched.append(js)
            else:
                missing.append(js)

        explanation = self.generate_explanation(matched, missing, score)

        return {
            "score": score,
            "skill_score": round(skill_score * 100, 1),
            "semantic_score": round(semantic_score * 100, 1),
            "matched_skills": matched,
            "missing_skills": missing,
            "explanation_ar": explanation,
        }
