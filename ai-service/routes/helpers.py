"""Helpers shared across AI route modules."""

from __future__ import annotations

import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

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
    """
    last_exc: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            with requests.get(
                file_url,
                headers=_DOWNLOAD_HEADERS,
                stream=True,
                timeout=30,
                allow_redirects=True,
            ) as response:
                response.raise_for_status()
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                    for chunk in response.iter_content(chunk_size=64 * 1024):
                        if chunk:
                            temp_file.write(chunk)
                    return temp_file.name
        except (requests.RequestException, OSError) as exc:
            last_exc = exc
            logger.warning(
                "download_remote_file attempt %d/%d failed for %s: %s",
                attempt, retries, file_url, exc,
            )
            if attempt < retries:
                time.sleep(0.5 * attempt)

    raise RuntimeError(f"Failed to download {file_url}: {last_exc}")


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


def fetch_resume(resume_id: str) -> dict[str, Any] | None:
    db = get_db()
    return db.fetch_one(
        """
        SELECT id, user_id, file_name, file_url, raw_text, parsed_data, created_at
        FROM resumes
        WHERE id = %s
        """,
        (resume_id,),
    )


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
