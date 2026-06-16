"""Embedding service using sentence-transformers."""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from services.database import DatabaseService

logger = logging.getLogger(__name__)

# Module-level cache so the model is loaded once per process
_model_cache: dict[str, object] = {}


def _get_model(model_name: str, token: str | None = None):
    """Load (or return cached) SentenceTransformer model."""
    cache_key = f"{model_name}::{token or 'no-token'}"
    if cache_key not in _model_cache:
        from sentence_transformers import SentenceTransformer

        logger.info("Loading embedding model: %s", model_name)
        _model_cache[cache_key] = SentenceTransformer(model_name, token=token)
    return _model_cache[cache_key]


class EmbeddingService:
    """Encode texts and manage embeddings in the database."""

    def __init__(self, model_name: str | None = None):
        from config import Config

        self.model_name = model_name or Config.HF_MODEL_NAME
        self.token = Config.HF_TOKEN
        self._model = None  # lazy load

    @property
    def model(self):
        if self._model is None:
            self._model = _get_model(self.model_name, self.token)
        return self._model

    # ------------------------------------------------------------------
    # Encoding
    # ------------------------------------------------------------------

    def encode(self, texts: list[str] | str) -> np.ndarray:
        """Encode one or more texts into embedding vectors.

        Returns shape (n, dim) for a list, or (dim,) for a single string.
        """
        single = isinstance(texts, str)
        if single:
            texts = [texts]
        embeddings = self.model.encode(texts, show_progress_bar=False)
        return embeddings[0] if single else embeddings

    # ------------------------------------------------------------------
    # Database persistence
    # ------------------------------------------------------------------

    def store_embedding(
        self,
        db: "DatabaseService",
        table: str,
        record_id: str,
        embedding: np.ndarray,
    ) -> None:
        """Store an embedding vector as JSON in the given table.

        Expects the table to have columns: id (or record_id) and embedding (jsonb).
        """
        vec_json = json.dumps(embedding.tolist())
        query = f"""
            INSERT INTO {table} (id, embedding)
            VALUES (%s, %s::jsonb)
            ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding
        """
        db.execute_query(query, (record_id, vec_json))

    def search_similar(
        self,
        db: "DatabaseService",
        table: str,
        query_embedding: np.ndarray,
        limit: int = 10,
    ) -> list[dict]:
        """Find the most similar records using cosine similarity.

        This performs an in-Python ranking over all stored embeddings.
        For production scale, switch to pgvector.
        """
        rows = db.fetch_all(f"SELECT id, embedding FROM {table}")
        if not rows:
            return []

        query_vec = query_embedding / (np.linalg.norm(query_embedding) + 1e-9)
        scored: list[tuple[str, float]] = []

        for row in rows:
            stored_vec = np.array(row["embedding"], dtype=np.float32)
            stored_vec = stored_vec / (np.linalg.norm(stored_vec) + 1e-9)
            similarity = float(np.dot(query_vec, stored_vec))
            scored.append((row["id"], similarity))

        scored.sort(key=lambda x: x[1], reverse=True)
        return [{"id": sid, "similarity": sim} for sid, sim in scored[:limit]]
