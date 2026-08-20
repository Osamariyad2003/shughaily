"""Shared helper for turning an exception into a safe HTTP response.

Never echo `str(exc)` (or Werkzeug's default error description) back to the
caller — either can carry internal paths, hostnames, connection strings, or
other implementation detail. The full exception (with traceback) is logged
server-side via `logger.exception`; the client only ever sees a generic
error code plus a request id it can quote when asking for help, which lets
you correlate a support report back to the matching server-side log line
without exposing that log's contents.
"""

from __future__ import annotations

import logging
import uuid

from flask import jsonify

logger = logging.getLogger(__name__)


def internal_error_response(exc: Exception, *, context: str = ""):
    """Log `exc` with a full traceback and return a generic 500 body.

    `context` is a short, static label (e.g. "parse_resume") — never
    include request data in it, since that would defeat the purpose.
    """
    request_id = uuid.uuid4().hex[:12]
    logger.exception(
        "Unhandled error [request_id=%s]%s", request_id, f" in {context}" if context else ""
    )
    return jsonify({"error": "internal_error", "request_id": request_id}), 500
