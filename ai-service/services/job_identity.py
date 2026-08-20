"""Python port of jobIdentityKey() from
backend/src/services/jobSearch.service.ts.

The Node backend and this Python service are separate runtimes that can't
share one function body, so this mirrors that TS implementation's tier
order and normalization rules by hand. Tier 1 (source:external_id) is what
fires for ~100% of real jobs — every job the Node backend ingests always
sets both fields — so that's the case that matters most for parity between
the two; tiers 2/3 are best-effort fallbacks mirrored for completeness.

Keep this in sync with jobSearch.service.ts's jobIdentityKey() if either
changes — the whole point (dedup key == seen-tracking key == embedding-
cache key) breaks silently if the two implementations drift apart.
"""

from __future__ import annotations

import re
import unicodedata
from urllib.parse import urlparse

_COMPANY_SUFFIX_RE = re.compile(
    r"\b(llc|inc|incorporated|ltd|limited|corp|corporation|co|company|gmbh|plc|llp|sa|srl|bv|nv|pty|pte)\b\.?",
    re.IGNORECASE,
)

_TITLE_WORD_ALIASES = {
    "sr": "senior",
    "jr": "junior",
    "mgr": "manager",
    "dir": "director",
    "eng": "engineer",
}


def _normalize_company(company: str | None) -> str:
    text = unicodedata.normalize("NFKC", company or "")
    text = text.lower().replace(".", " ").replace(",", " ")
    text = _COMPANY_SUFFIX_RE.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def _normalize_title(title: str | None) -> str:
    text = unicodedata.normalize("NFKC", title or "")
    text = text.lower().replace(".", " ").replace(",", " ")
    text = re.sub(r"\s+", " ", text).strip()
    words = [_TITLE_WORD_ALIASES.get(w, w) for w in text.split(" ")]
    return " ".join(words)


def _normalize_apply_url(url: str | None) -> str | None:
    if not url:
        return None
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    if not parsed.netloc:
        return None
    host = parsed.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    path = parsed.path.rstrip("/")
    result = f"{host}{path}".lower()
    return result or None


def job_identity_key(
    source: str | None,
    external_id: str | None,
    apply_url: str | None,
    company: str | None,
    title: str | None,
) -> str:
    """Same-job identity, same preference order as the TS version:
    1. `${source}:${external_id}` when both are present.
    2. `url:` + normalized apply_url.
    3. `text:` + normalized company|title, as a last resort.
    """
    if source and external_id:
        return f"{source}:{external_id}"

    normalized_url = _normalize_apply_url(apply_url)
    if normalized_url:
        return f"url:{normalized_url}"

    return f"text:{_normalize_company(company)}|{_normalize_title(title)}"
