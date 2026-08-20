"""Redis-backed cache for JOB embeddings only (never the per-run
user/resume embedding — that's already one call per run, nothing to cache).

Keyed by (job identity, text hash) so:
  - the SAME posting seen again in a later run reuses its cached vector
    instead of paying another forward pass, using the exact identity
    concept from job_identity.py (itself a port of jobIdentityKey() —
    see that module's docstring for why in-run dedup / seen-tracking /
    embedding-cache all need the SAME key).
  - a re-posted-but-EDITED job (same identity, different description text)
    still re-embeds, because the text hash changed even though the
    identity didn't.

Fails open by design: any Redis error (unreachable, timeout, corrupt
payload) is caught, logged at most once, and treated as a cache miss.
A cache outage must only make matching slower (back to the pre-cache
behavior of re-embedding everything), never block or crash it. Uses the
`redis` package already in requirements.txt and the REDIS_URL already in
Config — no new dependency.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Optional

import numpy as np
import redis

from config import Config

logger = logging.getLogger(__name__)

# Bump this to invalidate every cached vector at once — e.g. after changing
# the embedding model, since old vectors would no longer be comparable.
_CACHE_VERSION = "v1"

# Requested range was 7-14 days; splitting the difference.
_DEFAULT_TTL_SECONDS = 10 * 24 * 60 * 60

_EMBEDDING_DTYPE = np.float32

_client: "redis.Redis | None" = None
_client_init_attempted = False
_warned = False


def _get_client() -> "redis.Redis | None":
    """Lazily creates (and pings) a Redis client. Returns None — never
    raises — if Redis is unreachable, so every caller can treat "no client"
    as "just skip the cache" without its own try/except."""
    global _client, _client_init_attempted, _warned
    if _client_init_attempted:
        return _client
    _client_init_attempted = True
    try:
        client = redis.Redis.from_url(
            Config.REDIS_URL,
            decode_responses=False,  # need raw bytes back for the vector payload
            socket_connect_timeout=1.5,
            socket_timeout=1.5,
        )
        client.ping()
        _client = client
    except Exception as exc:  # noqa: BLE001 - any failure here means "no cache", not a crash
        if not _warned:
            logger.warning("Embedding cache: Redis unavailable (%s) — running without a cache.", exc)
            _warned = True
        _client = None
    return _client


def text_hash(text: str) -> str:
    """Short hash of a job's embedding-input text (see _job_text() in
    routes/match.py). Part of the cache key so a re-posted-but-edited job —
    same identity, different content — re-embeds instead of silently
    reusing a stale vector."""
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()[:16]


def _cache_key(identity_key: str, text_hash_value: str) -> str:
    return f"embcache:{_CACHE_VERSION}:{identity_key}:{text_hash_value}"


def get(identity_key: str, text_hash_value: str) -> Optional[np.ndarray]:
    client = _get_client()
    if client is None:
        return None
    try:
        raw = client.get(_cache_key(identity_key, text_hash_value))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Embedding cache GET failed (%s); treating as a miss.", exc)
        return None
    if raw is None:
        return None
    try:
        vector = np.frombuffer(raw, dtype=_EMBEDDING_DTYPE)
        if vector.size == 0:
            return None
        return vector.copy()  # frombuffer's array is read-only/view-backed; callers may want to mutate
    except ValueError:
        # Corrupt or dimension-mismatched payload (e.g. after an embedding
        # model change without bumping _CACHE_VERSION) — treat as a miss
        # rather than propagate a decode error into a matching request.
        return None


def set(identity_key: str, text_hash_value: str, embedding: np.ndarray, ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> None:
    client = _get_client()
    if client is None:
        return
    try:
        payload = np.asarray(embedding, dtype=_EMBEDDING_DTYPE).tobytes()
        client.set(_cache_key(identity_key, text_hash_value), payload, ex=ttl_seconds)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Embedding cache SET failed (%s); continuing without caching this entry.", exc)
