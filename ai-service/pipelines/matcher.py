"""Matching pipeline - compute compatibility scores between users and jobs."""

from __future__ import annotations

import numpy as np

from prompts.templates import MATCH_EXPLANATION_PROMPT
from utils.arabic import normalize_arabic


class MatcherPipeline:
    """Score how well a user profile matches a job posting."""

    # ------------------------------------------------------------------
    # Component scores
    # ------------------------------------------------------------------

    @staticmethod
    def _norm_skill(s: str) -> str:
        return normalize_arabic(str(s)).lower().strip()

    @staticmethod
    def _fuzzy_skill_match(user_skill: str, job_skill: str) -> bool:
        """Return True if user_skill covers job_skill via substring or token overlap."""
        if not user_skill or not job_skill:
            return False
        if user_skill == job_skill:
            return True
        # Substring either direction (e.g. "react" vs "react.js", "node" vs "node.js")
        if user_skill in job_skill or job_skill in user_skill:
            return True
        # Token overlap (for multi-word skills)
        u_tokens = set(user_skill.replace("-", " ").replace(".", " ").split())
        j_tokens = set(job_skill.replace("-", " ").replace(".", " ").split())
        if u_tokens and j_tokens and u_tokens & j_tokens:
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
