"""Validation schemas for request/response data (dict-based)."""


def _require_keys(data: dict, keys: list[str], context: str = "") -> list[str]:
    """Return list of missing key names."""
    return [k for k in keys if k not in data or data[k] is None]


# ------------------------------------------------------------------
# Request schemas
# ------------------------------------------------------------------

def validate_parse_resume_request(data: dict) -> list[str]:
    """Validate resume parse request. Returns list of error messages."""
    errors = []
    if not data:
        return ["Request body is required"]
    # Either file_path+file_type or raw_text must be present
    has_file = "file_path" in data and "file_type" in data
    has_text = "raw_text" in data and data["raw_text"]
    if not has_file and not has_text:
        errors.append("Either (file_path + file_type) or raw_text is required")
    if has_file and data.get("file_type") not in ("pdf", "docx", "txt"):
        errors.append("file_type must be one of: pdf, docx, txt")
    return errors


def validate_match_request(data: dict) -> list[str]:
    errors = []
    if not data:
        return ["Request body is required"]
    missing = _require_keys(data, ["user_id"])
    if missing:
        errors.append(f"Missing required fields: {', '.join(missing)}")
    if "job_ids" in data and not isinstance(data["job_ids"], list):
        errors.append("job_ids must be a list")
    return errors


def validate_cover_letter_request(data: dict) -> list[str]:
    errors = []
    if not data:
        return ["Request body is required"]
    missing = _require_keys(data, ["user_id", "job_id"])
    if missing:
        errors.append(f"Missing required fields: {', '.join(missing)}")
    return errors


def validate_cv_feedback_request(data: dict) -> list[str]:
    errors = []
    if not data:
        return ["Request body is required"]
    missing = _require_keys(data, ["user_id"])
    if missing:
        errors.append(f"Missing required fields: {', '.join(missing)}")
    return errors


def validate_interview_prep_request(data: dict) -> list[str]:
    errors = []
    if not data:
        return ["Request body is required"]
    missing = _require_keys(data, ["user_id", "job_id"])
    if missing:
        errors.append(f"Missing required fields: {', '.join(missing)}")
    return errors


def validate_chat_request(data: dict) -> list[str]:
    errors = []
    if not data:
        return ["Request body is required"]
    missing = _require_keys(data, ["message"])
    if missing:
        errors.append(f"Missing required fields: {', '.join(missing)}")
    return errors


# ------------------------------------------------------------------
# Response shapes (documentation / helpers)
# ------------------------------------------------------------------

def match_result_shape() -> dict:
    """Template for a single match result."""
    return {
        "job_id": None,
        "score": 0.0,
        "matched_skills": [],
        "missing_skills": [],
        "explanation_ar": "",
    }


def parsed_resume_shape() -> dict:
    return {
        "summary": "",
        "skills": [],
        "experience": [],
        "education": [],
        "languages": [],
        "raw_text": "",
    }
