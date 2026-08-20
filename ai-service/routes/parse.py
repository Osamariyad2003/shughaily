"""Resume parsing endpoints."""

from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from pipelines.resume_parser import ResumeParserPipeline
from routes.helpers import cleanup_temp_file, download_remote_file, infer_file_type, UnsafeURLError
from utils.errors import internal_error_response

logger = logging.getLogger(__name__)
parse_bp = Blueprint("parse", __name__)


@parse_bp.post("/api/parse-resume")
def parse_resume():
    data = request.get_json(silent=True) or {}
    raw_text = data.get("raw_text")

    pipeline = ResumeParserPipeline()
    temp_file_path: str | None = None

    try:
        if raw_text:
            parsed = pipeline.run(raw_text=str(raw_text))
            return jsonify(parsed)

        file_url = data.get("file_url")
        if not file_url:
            return jsonify({"error": "file_url or raw_text is required"}), 400

        file_type = infer_file_type(data)
        temp_file_path = download_remote_file(str(file_url), f".{file_type}")
        parsed = pipeline.run(file_path=temp_file_path, file_type=file_type)
        return jsonify(parsed)
    except UnsafeURLError as exc:
        # Client-facing message stays generic (no hostname/IP echoed back —
        # that alone can help an attacker fingerprint the block rule), but
        # the reason IS logged server-side for debugging legitimate uploads.
        logger.warning("Blocked file_url for /api/parse-resume: %s", exc)
        return jsonify({"error": "file_url is not allowed"}), 400
    except Exception as exc:
        return internal_error_response(exc, context="parse_resume")
    finally:
        cleanup_temp_file(temp_file_path)
