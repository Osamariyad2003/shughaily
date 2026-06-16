"""Skill extractor combining LLM (OpenRouter) and semantic embeddings.

Order of preference:
    1. LLM extraction via OpenRouter (if OPENROUTER_API_KEY is set)
    2. Zero-shot semantic matching against a curated skill library
    3. (Caller can still fall back to static regex if needed.)

The extractor is a module-level singleton so the skill library embeddings
are computed exactly once per process.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Iterable

import numpy as np

from services.embedding import EmbeddingService
from services.llm_client import get_llm_client
from services.skill_library import SKILL_LIBRARY

logger = logging.getLogger(__name__)


# ── Text chunking helpers ────────────────────────────────────────────────

_SENT_SPLIT = re.compile(r"[.!?\n•\-–—\r]+|(?:\s{2,})")


def _chunk_text(text: str, max_words: int = 40) -> list[str]:
    """Split text into sentence-ish chunks of at most ~max_words words."""
    if not text:
        return []
    raw = [c.strip() for c in _SENT_SPLIT.split(text) if c and c.strip()]
    chunks: list[str] = []
    for piece in raw:
        words = piece.split()
        if len(words) <= max_words:
            chunks.append(piece)
        else:
            # Break long bullets into smaller windows
            for i in range(0, len(words), max_words):
                chunks.append(" ".join(words[i : i + max_words]))
    return chunks[:60]  # cap to keep matrix small


# ── LLM extractor (HF Inference API) ─────────────────────────────────────


_LLM_SYSTEM = (
    "You are an expert technical recruiter. You read job descriptions and "
    "extract the skills the role actually requires. You never invent skills."
)

_LLM_PROMPT = """Read the job description below and extract the most important skills required by the role. Include programming languages, frameworks, cloud/DevOps tools, databases, methodologies, and domain skills. Use canonical names (e.g. "Kubernetes" not "k8s", "PostgreSQL" not "postgres"). Do NOT invent skills that are not clearly implied by the text.

Return ONLY a JSON array of strings, at most 15 entries, no commentary, no code fences.

Job description:
---
{text}
---

JSON array:"""


class SkillExtractor:
    """Combines LLM + semantic extraction with a curated skill library."""

    def __init__(self) -> None:
        self.embedding_service = EmbeddingService()
        self._skill_embeddings: np.ndarray | None = None
        self._llm_failed: bool = False

    # ------------------------------------------------------------------
    # Skill library (pre-embedded)
    # ------------------------------------------------------------------

    def ensure_library_loaded(self) -> None:
        """Pre-compute embeddings for every entry in the skill library."""
        if self._skill_embeddings is not None:
            return
        logger.info("🧠 Embedding skill library (%d skills)…", len(SKILL_LIBRARY))
        vectors = self.embedding_service.encode(SKILL_LIBRARY)
        if not isinstance(vectors, np.ndarray):
            vectors = np.array(vectors)
        # Normalise for cosine similarity
        norms = np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-9
        self._skill_embeddings = vectors / norms
        logger.info("✅ Skill library ready (shape=%s)", self._skill_embeddings.shape)

    # ------------------------------------------------------------------
    # LLM extraction
    # ------------------------------------------------------------------

    def warmup_llm(self) -> None:
        """Verify the LLM client is reachable. Logs status, never raises."""
        if self._llm_failed:
            return
        client = get_llm_client()
        if not client.is_available:
            logger.warning("OPENROUTER_API_KEY missing; LLM skill extraction disabled.")
            self._llm_failed = True
            return
        reply = client.chat(
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=4,
            temperature=0.0,
        )
        if reply is None:
            logger.warning("OpenRouter smoke test failed; LLM skill extraction disabled.")
            self._llm_failed = True
        else:
            logger.info("🤖 LLM skill extractor using OpenRouter model: %s", client.model)

    def extract_llm(self, text: str, top_k: int = 15) -> list[str] | None:
        """Ask the LLM to list required skills. Returns None on any failure."""
        if not text or not text.strip():
            return []
        if self._llm_failed:
            return None
        client = get_llm_client()
        if not client.is_available:
            self._llm_failed = True
            return None

        snippet = text[:4000]
        content = client.chat(
            messages=[
                {"role": "system", "content": _LLM_SYSTEM},
                {"role": "user", "content": _LLM_PROMPT.format(text=snippet)},
            ],
            max_tokens=400,
            temperature=0.1,
        )
        if content is None:
            self._llm_failed = True
            return None

        # Parse JSON array from model output
        match = re.search(r"\[.*\]", content, flags=re.S)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
        if not isinstance(data, list):
            return None

        cleaned: list[str] = []
        seen: set[str] = set()
        for item in data:
            if not isinstance(item, str):
                continue
            value = item.strip().strip("`\"'")
            key = value.lower()
            if value and key not in seen:
                seen.add(key)
                cleaned.append(value)
            if len(cleaned) >= top_k:
                break
        return cleaned

    # ------------------------------------------------------------------
    # Semantic extraction (zero-shot against skill library)
    # ------------------------------------------------------------------

    def extract_semantic(
        self,
        text: str,
        top_k: int = 12,
        threshold: float = 0.45,
    ) -> list[str]:
        """Return skills from the library most similar to the job text."""
        if not text or not text.strip():
            return []
        self.ensure_library_loaded()
        assert self._skill_embeddings is not None

        chunks = _chunk_text(text)
        if not chunks:
            return []

        chunk_vecs = self.embedding_service.encode(chunks)
        if not isinstance(chunk_vecs, np.ndarray):
            chunk_vecs = np.array(chunk_vecs)
        if chunk_vecs.ndim == 1:
            chunk_vecs = chunk_vecs.reshape(1, -1)

        norms = np.linalg.norm(chunk_vecs, axis=1, keepdims=True) + 1e-9
        chunk_vecs = chunk_vecs / norms

        # (n_chunks, n_skills)
        sims = chunk_vecs @ self._skill_embeddings.T
        # Best similarity each skill achieved across any chunk
        max_sims = sims.max(axis=0)

        # Rank skills above threshold
        above_idx = np.where(max_sims >= threshold)[0]
        if above_idx.size == 0:
            # Still return the top matches so we don't show an empty list
            above_idx = np.argsort(-max_sims)[:top_k]

        sorted_idx = above_idx[np.argsort(-max_sims[above_idx])][:top_k]
        return [SKILL_LIBRARY[i] for i in sorted_idx]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def extract(self, text: str, top_k: int = 12) -> list[str]:
        """Best-effort extraction: LLM first, semantic fallback."""
        if not text or not text.strip():
            return []

        llm_skills = self.extract_llm(text, top_k=top_k)
        if llm_skills is not None and len(llm_skills) >= 3:
            # Still enrich with semantic matches for recall
            semantic = self.extract_semantic(text, top_k=top_k, threshold=0.5)
            return _merge_unique(llm_skills, semantic, limit=top_k)

        return self.extract_semantic(text, top_k=top_k)


# ── Helpers ──────────────────────────────────────────────────────────────


def _merge_unique(primary: Iterable[str], secondary: Iterable[str], limit: int) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for src in (primary, secondary):
        for skill in src:
            key = skill.lower().strip()
            if key and key not in seen:
                seen.add(key)
                merged.append(skill)
            if len(merged) >= limit:
                return merged
    return merged


# ── Module-level singleton ───────────────────────────────────────────────

_extractor: SkillExtractor | None = None


def get_skill_extractor() -> SkillExtractor:
    global _extractor
    if _extractor is None:
        _extractor = SkillExtractor()
    return _extractor
