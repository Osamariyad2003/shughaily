import os
from dotenv import load_dotenv

load_dotenv()


def _get_hf_token() -> str | None:
    return os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")


HF_TOKEN = _get_hf_token()
if HF_TOKEN:
    # Keep both names in sync because downstream HF libraries may read either one.
    os.environ.setdefault("HF_TOKEN", HF_TOKEN)
    os.environ.setdefault("HUGGING_FACE_HUB_TOKEN", HF_TOKEN)


class Config:
    """Application configuration loaded from environment variables."""

    FLASK_PORT = int(os.getenv("FLASK_PORT", 5050))
    DATABASE_URL = os.getenv(
        "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/shughaily"
    )
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
    DEBUG = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB upload limit
    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "/tmp/shughaily_uploads")
