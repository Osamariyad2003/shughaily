import os
from dotenv import load_dotenv

load_dotenv()


def _get_hf_token() -> str | None:
    return os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")


def _require_env(name: str) -> str:
    """Read a required env var with no embedded fallback. Fails fast at
    import time (i.e. at process startup, before any request can be
    served) rather than silently running with a default that would be
    unsafe if it ever matched a real deployment's actual credentials/
    secret — see config.py's prior DATABASE_URL default, which was a
    literal `postgres:postgres`."""
    value = os.getenv(name)
    if not value:
        raise RuntimeError(
            f"{name} is required and has no default — set it in the environment "
            "before starting the AI service."
        )
    return value


HF_TOKEN = _get_hf_token()
if HF_TOKEN:
    # Keep both names in sync because downstream HF libraries may read either one.
    os.environ.setdefault("HF_TOKEN", HF_TOKEN)
    os.environ.setdefault("HUGGING_FACE_HUB_TOKEN", HF_TOKEN)


class Config:
    """Application configuration loaded from environment variables."""

    FLASK_PORT = int(os.getenv("FLASK_PORT", 5050))
    # No fallback default — a hardcoded credential in source is a real
    # credential the moment anyone forgets to override it. Missing
    # DATABASE_URL now fails the process at startup instead of silently
    # connecting with a default that might be a real password somewhere.
    DATABASE_URL = _require_env("DATABASE_URL")
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    HF_MODEL_NAME = os.getenv(
        "HF_MODEL_NAME",
        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    )
    HF_TOKEN = HF_TOKEN
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
    OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
    OPENROUTER_MODEL = os.getenv(
        "OPENROUTER_MODEL",
        "meta-llama/llama-3.3-70b-instruct:free",
    )
    OPENROUTER_BASE_URL = os.getenv(
        "OPENROUTER_BASE_URL",
        "https://openrouter.ai/api/v1",
    )
    EXPRESS_URL = os.getenv("EXPRESS_URL", "http://localhost:4000")
    # Shared secret the Express backend must present on every /api/* call
    # (see app.py's before_request handler). Also no default: an unset
    # token would either disable the check or accept an empty header,
    # neither of which is safe — fail fast instead.
    INTERNAL_AUTH_TOKEN = _require_env("INTERNAL_AUTH_TOKEN")
    # Default false. Debug mode + the 0.0.0.0 bind run.py uses would expose
    # the Werkzeug interactive debugger (arbitrary code execution) to
    # anything that can reach the port — only ever set FLASK_DEBUG=true for
    # a genuinely local, non-networked run.
    DEBUG = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB upload limit
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "/tmp/shughaily_uploads")
