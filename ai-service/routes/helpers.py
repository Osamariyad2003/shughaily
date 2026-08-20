"""Helpers shared across AI route modules."""

from __future__ import annotations

import ipaddress
import logging
import os
import socket
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import requests

from services.database import DatabaseService

logger = logging.getLogger(__name__)

_DOWNLOAD_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36 ShughailyBot/1.0"
    ),
    "Accept": "*/*",
}

# Caller-supplied download URLs must be plain https — no http (no transport
# security anyway), and no file://, gopher://, etc., which `requests`
# itself won't fetch but which are worth rejecting explicitly rather than
# relying on that.
_ALLOWED_SCHEMES = {"https"}

_MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024  # well under Flask's own 16 MB request cap
_MAX_REDIRECTS = 5
_CONNECT_TIMEOUT = 10
_READ_TIMEOUT = 30


class UnsafeURLError(ValueError):
    """Raised when a caller-supplied URL fails the SSRF allowlist check —
    disallowed scheme, or resolves to a private/loopback/link-local/
    reserved/metadata address. Callers should catch this SPECIFICALLY and
    return a generic 400 — never surface the resolved IP or the reason to
    the client (see routes/parse.py)."""


def _assert_public_url(url: str) -> None:
    """Raise UnsafeURLError unless `url` is https AND every IP its host
    resolves to is a public, globally-routable address.

    Checks ALL resolved addresses (a hostname can have multiple A/AAAA
    records) so a host that resolves to one public and one private IP
    still gets blocked. Deliberately re-run on every redirect hop by the
    caller (see download_remote_file) rather than only once up front — an
    allowed host can itself 302 to a metadata/internal IP.
    """
    parsed = urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise UnsafeURLError(f"scheme {parsed.scheme!r} is not allowed (https only)")

    host = parsed.hostname
    if not host:
        raise UnsafeURLError("URL has no host")

    try:
        # getaddrinfo returns every A/AAAA record for the host; families
        # 0 = let the resolver return both IPv4 and IPv6 results.
        addr_infos = socket.getaddrinfo(host, None, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeURLError(f"could not resolve host: {exc}") from exc

    if not addr_infos:
        raise UnsafeURLError("host resolved to no addresses")

    for family, _type, _proto, _canonname, sockaddr in addr_infos:
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError as exc:
            raise UnsafeURLError(f"could not parse resolved address {ip_str!r}") from exc

        # is_global is False for every private/loopback/link-local (incl.
        # 169.254.169.254, the cloud metadata address)/reserved/multicast/
        # unspecified range — covers 127.0.0.0/8, 10/8, 172.16/12,
        # 192.168/16, 169.254/16, ::1, fc00::/7, and anything else that
        # isn't publicly routable, without hand-maintaining that range list.
        if not ip.is_global:
            raise UnsafeURLError(f"host resolves to a non-public address ({ip_str})")


def get_db() -> DatabaseService:
    return DatabaseService()


def infer_file_type(data: dict[str, Any]) -> str:
    file_type = str(data.get("file_type") or "").strip().lower()
    mime_type = str(data.get("mime_type") or "").strip().lower()
    file_url = str(data.get("file_url") or "").strip().lower()

    if file_type in {"pdf", "docx", "txt"}:
        return file_type

    if "pdf" in mime_type:
        return "pdf"
    if "word" in mime_type or "docx" in mime_type:
        return "docx"
    if "text/plain" in mime_type:
        return "txt"

    suffix = Path(urlparse(file_url).path).suffix.lower()
    if suffix in {".pdf", ".docx", ".txt"}:
        return suffix.lstrip(".")

    return "pdf"


def download_remote_file(file_url: str, suffix: str, *, retries: int = 3) -> str:
    """Download a remote file with retries + a real User-Agent.

    Many CDNs (Cloudflare, Supabase Storage) reject the default Python urllib UA
    or rate-limit anonymous clients. Using `requests` with a browser UA and a
    simple retry loop fixes the WinError 10054 / connection reset failures.

    SSRF-hardened: https only, resolved IP must be public (re-checked on
    every redirect hop — a DNS-rebinding attempt would still have a window
    between this check and the actual connect, since `requests` does its
    own separate resolution; re-validating immediately before every hop's
    request narrows that window but doesn't eliminate it — see the audit's
    residual-risk note for what full IP-pinning would take), redirects are
    followed manually (never trust `requests`' own `allow_redirects=True`,
    which wouldn't re-validate each hop), and the response body is capped
    at _MAX_DOWNLOAD_BYTES.
    """
    last_exc: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            return _download_once(file_url, suffix)
        except UnsafeURLError:
            # Not a transient failure — retrying won't change whether the
            # URL is safe. Propagate immediately.
            raise
        except (requests.RequestException, OSError) as exc:
            last_exc = exc
            logger.warning(
                "download_remote_file attempt %d/%d failed for %s: %s",
                attempt, retries, file_url, exc,
            )
            if attempt < retries:
                time.sleep(0.5 * attempt)

    raise RuntimeError(f"Failed to download {file_url}: {last_exc}")


def _download_once(file_url: str, suffix: str) -> str:
    url = file_url
    for _hop in range(_MAX_REDIRECTS + 1):
        _assert_public_url(url)

        with requests.get(
            url,
            headers=_DOWNLOAD_HEADERS,
            stream=True,
            timeout=(_CONNECT_TIMEOUT, _READ_TIMEOUT),
            allow_redirects=False,
        ) as response:
            if response.is_redirect or response.status_code in (301, 302, 303, 307, 308):
                location = response.headers.get("Location")
                if not location:
                    raise UnsafeURLError("redirect response had no Location header")
                url = urljoin(url, location)
                continue

            response.raise_for_status()

            total = 0
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                temp_path = temp_file.name
                for chunk in response.iter_content(chunk_size=64 * 1024):
                    if not chunk:
                        continue
                    total += len(chunk)
                    if total > _MAX_DOWNLOAD_BYTES:
                        temp_file.close()
                        os.remove(temp_path)
                        raise ValueError(
                            f"remote file exceeds max allowed size ({_MAX_DOWNLOAD_BYTES} bytes)"
                        )
                    temp_file.write(chunk)
            return temp_path

    raise UnsafeURLError(f"too many redirects (> {_MAX_REDIRECTS})")


def cleanup_temp_file(file_path: str | None) -> None:
    if file_path and os.path.exists(file_path):
        os.remove(file_path)


def fetch_user(user_id: str) -> dict[str, Any] | None:
    db = get_db()
    return db.fetch_one(
        """
        SELECT id, name, email, country, city, preferred_language
        FROM users
        WHERE id = %s
        """,
        (user_id,),
    )


def fetch_resume(resume_id: str, user_id: str) -> dict[str, Any] | None:
    """Fetch a resume scoped to its owner.

    Returns None both when the resume doesn't exist AND when it exists but
    belongs to a different user — deliberately indistinguishable to the
    caller (a route returning "not found" vs. "forbidden" would itself
    leak whether a given resume_id is valid, i.e. confirm/deny another
    user's data exists). Every caller MUST have already established that
    `user_id` is the actual authenticated caller (forwarded from Express's
    own session, never a client-supplied field taken at face value) —
    this function only enforces that resume_id and user_id are consistent
    with each other, not that user_id itself is trustworthy.
    """
    db = get_db()
    return db.fetch_one(
        """
        SELECT id, user_id, file_name, file_url, raw_text, parsed_data, created_at
        FROM resumes
        WHERE id = %s AND user_id = %s
        """,
        (resume_id, user_id),
    )


def fetch_owned_resume(resume_id: str | None, user_id: str | None) -> dict[str, Any] | None:
    """Convenience wrapper for routes where resume_id is OPTIONAL context
    (an enrichment input, not the thing the response is about). Returns
    None — silently, as if no resume_id had been given — whenever
    ownership can't be established (no resume_id, no user_id, or a
    mismatch), rather than erroring the whole request over what was only
    ever a "nice to have" input. Routes where resume_id is a REQUIRED
    input should call fetch_resume() directly and 404 on None themselves,
    since there a missing/mismatched resume is a real request failure."""
    if not resume_id or not user_id:
        return None
    return fetch_resume(str(resume_id), str(user_id))


def fetch_job(job_id: str) -> dict[str, Any] | None:
    db = get_db()
    return db.fetch_one(
        """
        SELECT id, source, external_id, title, normalized_title, company, location,
               description, salary_text, employment_type, created_at
        FROM jobs
        WHERE id = %s
        """,
        (job_id,),
    )
