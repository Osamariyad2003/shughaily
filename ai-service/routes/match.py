"""Matching and recommendation endpoints."""

from __future__ import annotations

import logging
from uuid import uuid4

import numpy as np
from flask import Blueprint, jsonify, request

from pipelines.job_processor import JobProcessorPipeline
from pipelines.matcher import MatcherPipeline
from pipelines.recommendation import RecommendationPipeline
from pipelines.resume_parser import ResumeParserPipeline
from routes.helpers import fetch_resume, get_db
from services import embedding_cache
from services.embedding import EmbeddingService
from services.job_identity import job_identity_key

match_bp = Blueprint("match", __name__)
logger = logging.getLogger(__name__)


def _safe_embedding(service: EmbeddingService | None, text: str):
    if service is None or not text or not text.strip():
        return None
    try:
        return service.encode(text)
    except Exception as exc:
        logger.warning("Embedding failed: %s", exc)
        return None


def _safe_batch_embeddings(service: EmbeddingService | None, texts: list[str]):
    """Batch encode a list of texts. Returns list of np arrays (or None on failure)."""
    if service is None or not texts:
        return [None] * len(texts)
    cleaned = [t if (t and t.strip()) else " " for t in texts]
    try:
        vectors = service.encode(cleaned)
        if isinstance(vectors, np.ndarray) and vectors.ndim == 2:
            return [vectors[i] for i in range(vectors.shape[0])]
        return [vectors]
    except Exception as exc:
        logger.warning("Batch embedding failed: %s", exc)
        return [None] * len(texts)


def _resume_text(parsed: dict, fallback_raw: str = "") -> str:
    """Build a rich text representation of a resume for embedding."""
    parts: list[str] = []
    summary = parsed.get("summary")
    if summary:
        parts.append(str(summary))
    skills = parsed.get("skills") or []
    if skills:
        parts.append("Skills: " + ", ".join(str(s) for s in skills))
    exp = parsed.get("experience") or []
    for item in exp[:5]:
        if isinstance(item, dict):
            bits = [
                str(item.get("title") or ""),
                str(item.get("company") or ""),
                str(item.get("description") or ""),
            ]
            parts.append(" ".join(b for b in bits if b))
        else:
            parts.append(str(item))
    edu = parsed.get("education") or []
    for item in edu[:3]:
        if isinstance(item, dict):
            parts.append(" ".join(str(v) for v in item.values() if v))
        else:
            parts.append(str(item))
    text = "\n".join(p for p in parts if p).strip()
    return text or fallback_raw


def _job_text(job: dict) -> str:
    """Build rich job text for embedding."""
    parts = [
        str(job.get("title") or ""),
        str(job.get("company") or ""),
        str(job.get("location") or ""),
        str(job.get("description") or ""),
    ]
    return "\n".join(p for p in parts if p).strip()


def _cached_job_embeddings(
    service: EmbeddingService | None, jobs: list[dict], texts: list[str]
) -> list[np.ndarray | None]:
    """Batch-encode job texts, but skip any job whose (identity, text hash)
    is already cached. Uses the exact same job_identity_key() as in-run
    dedup and agent_job_results seen-tracking, so a job that's been seen
    (and embedded) in a previous run reuses that vector here instead of
    paying another forward pass — the whole point of keying all three the
    same way. A re-posted-but-edited job (same identity, different text)
    naturally misses, since the text hash changed.

    Fails open: any cache error already degrades to None inside
    embedding_cache itself, so this always falls back to encoding that job
    fresh rather than raising.
    """
    keys: list[tuple[str, str]] = []
    for job, text in zip(jobs, texts):
        identity = job_identity_key(
            job.get("source"),
            job.get("external_id"),
            job.get("apply_url"),
            job.get("company"),
            job.get("title"),
        )
        keys.append((identity, embedding_cache.text_hash(text)))

    results: list[np.ndarray | None] = [None] * len(texts)
    miss_indices: list[int] = []
    for i, (identity, thash) in enumerate(keys):
        cached = embedding_cache.get(identity, thash)
        if cached is not None:
            results[i] = cached
        else:
            miss_indices.append(i)

    if miss_indices:
        miss_texts = [texts[i] for i in miss_indices]
        miss_embeddings = _safe_batch_embeddings(service, miss_texts)
        for i, embedding in zip(miss_indices, miss_embeddings):
            results[i] = embedding
            if embedding is not None:
                identity, thash = keys[i]
                embedding_cache.set(identity, thash, embedding)

    if keys:
        hits = len(texts) - len(miss_indices)
        logger.info("Job embedding cache: %d/%d hit", hits, len(texts))

    return results


@match_bp.post("/api/match-jobs")
def match_jobs():
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    resume_id = data.get("resume_id")
    filters = data.get("filters") or {}

    if not user_id or not resume_id:
        return jsonify({"error": "user_id and resume_id are required"}), 400

    resume = fetch_resume(str(resume_id), str(user_id))
    if not resume:
        return jsonify({"error": "Resume not found"}), 404

    parsed_resume = resume.get("parsed_data")
    if not isinstance(parsed_resume, dict):
        raw_text = (resume.get("raw_text") or "").strip()
        if not raw_text:
            return jsonify({"error": "Resume must be parsed before matching"}), 400
        parsed_resume = ResumeParserPipeline().run(raw_text=raw_text)

    db = get_db()
    params: list[object] = []
    where_clauses: list[str] = []

    if filters.get("job_id"):
        where_clauses.append("id = %s")
        params.append(filters["job_id"])

    if filters.get("location"):
        where_clauses.append("location ILIKE %s")
        params.append(f"%{filters['location']}%")

    if filters.get("work_type"):
        where_clauses.append("employment_type = %s")
        params.append(filters["work_type"])

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    jobs = db.fetch_all(
        f"""
        SELECT id, source, external_id, title, normalized_title, company, location,
               description, salary_text, employment_type, apply_url, created_at
        FROM jobs
        {where_sql}
        ORDER BY created_at DESC
        LIMIT 50
        """,
        tuple(params) if params else None,
    )

    if not jobs:
        return jsonify({"matches": [], "recommended_jobs": []})

    processor = JobProcessorPipeline()
    matcher = MatcherPipeline()
    recommender = RecommendationPipeline()
    embedding_service: EmbeddingService | None = None

    try:
        embedding_service = EmbeddingService()
        # Touch model to verify it's ready
        _ = embedding_service.model
        logger.info("Matching %d jobs with semantic model: %s", len(jobs), embedding_service.model_name)
    except Exception as exc:
        logger.warning("EmbeddingService unavailable, falling back to skill-only matching: %s", exc)
        embedding_service = None

    # Build rich resume text
    fallback_raw = str(parsed_resume.get("raw_text") or resume.get("raw_text") or "")
    resume_text = _resume_text(parsed_resume, fallback_raw=fallback_raw)
    user_embedding = _safe_embedding(embedding_service, resume_text)

    # Pre-process jobs
    processed_jobs = [processor.process(job) for job in jobs]

    # Batch encode all job texts at once (huge speedup), reusing cached
    # vectors for jobs already embedded in a previous run.
    job_texts = [_job_text(pj) for pj in processed_jobs]
    job_embeddings = _cached_job_embeddings(embedding_service, jobs, job_texts)

    matches: list[dict] = []
    for job, processed_job, job_embedding in zip(jobs, processed_jobs, job_embeddings):
        match_result = matcher.run(
            parsed_resume,
            processed_job,
            user_embedding=user_embedding,
            job_embedding=job_embedding,
        )
        match_result["job_id"] = job["id"]
        match_result["job"] = job
        matches.append(match_result)

    matches.sort(key=lambda item: item.get("score", 0), reverse=True)
    ranked_jobs = recommender.rank_jobs(parsed_resume, processed_jobs, matches)

    if filters.get("job_id"):
        db.execute_query(
            "DELETE FROM matches WHERE user_id = %s AND job_id = %s",
            (user_id, filters["job_id"]),
        )
    else:
        db.execute_query("DELETE FROM matches WHERE user_id = %s", (user_id,))

    for match in matches:
        db.execute_query(
            """
            INSERT INTO matches (id, user_id, job_id, score, explanation_ar, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            """,
            (
                str(uuid4()),
                str(user_id),
                str(match["job_id"]),
                float(match.get("score", 0)),
                str(match.get("explanation_ar", "")),
            ),
        )

    return jsonify({"matches": matches, "recommended_jobs": ranked_jobs})


@match_bp.post("/api/match-jobs-batch")
def match_jobs_batch():
    """Score an explicit, caller-supplied list of jobs against one resume.

    Unlike /api/match-jobs (which matches against whatever's most recent in
    the `jobs` table, or a single job_id filter, and unconditionally wipes
    the user's ENTIRE `matches` table before writing), this exists for
    callers that already know exactly which job rows they want scored —
    e.g. the search-agent runner, which just found N jobs via external
    search and wants those N scored in one round trip rather than one
    /api/match-jobs call per job. It only ever touches `matches` rows for
    the job_ids it was actually asked to score, so it can't clobber
    unrelated dashboard recommendations from other sources.
    """
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    resume_id = data.get("resume_id")
    job_ids = data.get("job_ids") or []

    if not user_id or not resume_id:
        return jsonify({"error": "user_id and resume_id are required"}), 400
    if not isinstance(job_ids, list) or not job_ids:
        return jsonify({"matches": []})

    resume = fetch_resume(str(resume_id), str(user_id))
    if not resume:
        return jsonify({"error": "Resume not found"}), 404

    parsed_resume = resume.get("parsed_data")
    if not isinstance(parsed_resume, dict):
        raw_text = (resume.get("raw_text") or "").strip()
        if not raw_text:
            return jsonify({"error": "Resume must be parsed before matching"}), 400
        parsed_resume = ResumeParserPipeline().run(raw_text=raw_text)

    db = get_db()
    # Defensive cap — the TS caller already batches to ~20, but don't trust
    # a runaway request to try to score hundreds of jobs in one round trip.
    ids = [str(j) for j in job_ids][:50]
    jobs = db.fetch_all(
        """
        SELECT id, source, external_id, title, normalized_title, company, location,
               description, salary_text, employment_type, apply_url, created_at
        FROM jobs
        WHERE id = ANY(%s::uuid[])
        """,
        (ids,),
    )
    if not jobs:
        return jsonify({"matches": []})

    processor = JobProcessorPipeline()
    matcher = MatcherPipeline()
    embedding_service: EmbeddingService | None = None

    try:
        embedding_service = EmbeddingService()
        _ = embedding_service.model
        logger.info("Batch-matching %d jobs with semantic model: %s", len(jobs), embedding_service.model_name)
    except Exception as exc:
        logger.warning("EmbeddingService unavailable, falling back to skill-only matching: %s", exc)
        embedding_service = None

    fallback_raw = str(parsed_resume.get("raw_text") or resume.get("raw_text") or "")
    resume_text = _resume_text(parsed_resume, fallback_raw=fallback_raw)
    user_embedding = _safe_embedding(embedding_service, resume_text)

    processed_jobs = [processor.process(job) for job in jobs]
    job_texts = [_job_text(pj) for pj in processed_jobs]
    job_embeddings = _cached_job_embeddings(embedding_service, jobs, job_texts)

    matches: list[dict] = []
    for job, processed_job, job_embedding in zip(jobs, processed_jobs, job_embeddings):
        match_result = matcher.run(
            parsed_resume,
            processed_job,
            user_embedding=user_embedding,
            job_embedding=job_embedding,
        )
        match_result["job_id"] = job["id"]
        match_result["job"] = job
        matches.append(match_result)

    matches.sort(key=lambda item: item.get("score", 0), reverse=True)

    scored_ids = [m["job_id"] for m in matches]
    db.execute_query(
        "DELETE FROM matches WHERE user_id = %s AND job_id = ANY(%s::uuid[])",
        (user_id, scored_ids),
    )
    for match in matches:
        db.execute_query(
            """
            INSERT INTO matches (id, user_id, job_id, score, explanation_ar, created_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            """,
            (
                str(uuid4()),
                str(user_id),
                str(match["job_id"]),
                float(match.get("score", 0)),
                str(match.get("explanation_ar", "")),
            ),
        )

    return jsonify({"matches": matches})
