"""Recommendation pipeline - rank jobs for a user."""

from __future__ import annotations


class RecommendationPipeline:
    """Rank a list of jobs by match quality for a given user."""

    @staticmethod
    def rank_jobs(
        user_data: dict,
        jobs: list[dict],
        matches: list[dict],
    ) -> list[dict]:
        """Sort jobs by match score (descending) and attach explanations.

        Parameters
        ----------
        user_data : dict
            Parsed user profile.
        jobs : list[dict]
            List of job dicts (must include an 'id' or 'job_id' key).
        matches : list[dict]
            Corresponding match results from MatcherPipeline.run(), one per job.

        Returns
        -------
        list[dict]
            Jobs enriched with match metadata, sorted best-first.
        """
        job_map = {}
        for job in jobs:
            jid = job.get("id") or job.get("job_id")
            job_map[str(jid)] = job

        ranked: list[dict] = []
        for match in matches:
            jid = str(match.get("job_id", ""))
            job = job_map.get(jid, {})
            ranked.append({
                **job,
                "match_score": match.get("score", 0),
                "matched_skills": match.get("matched_skills", []),
                "missing_skills": match.get("missing_skills", []),
                "explanation_ar": match.get("explanation_ar", ""),
            })

        ranked.sort(key=lambda x: x["match_score"], reverse=True)

        # Add rank labels
        for i, item in enumerate(ranked):
            score = item["match_score"]
            if score >= 80:
                item["fit_label_ar"] = "مناسبة جداً"
            elif score >= 60:
                item["fit_label_ar"] = "مناسبة"
            elif score >= 40:
                item["fit_label_ar"] = "ممكن تناسبك"
            else:
                item["fit_label_ar"] = "بعيدة عن تخصصك"
            item["rank"] = i + 1

        return ranked
