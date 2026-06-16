import logging
import os

from flask import Flask, jsonify
from flask_cors import CORS

from config import Config

logger = logging.getLogger(__name__)


def _preload_embedding_model() -> None:
    """Eagerly load the HuggingFace sentence-transformer so the first request is fast."""
    try:
        from services.embedding import EmbeddingService

        service = EmbeddingService()
        logger.info("🤖 Preloading HF embedding model: %s", service.model_name)
        # Touch the property to trigger lazy load
        _ = service.model
        # Do a dummy encode to warm caches
        vec = service.encode("warmup")
        dim = getattr(vec, "shape", [len(vec)])[0] if hasattr(vec, "shape") else len(vec)
        logger.info("✅ HF model ready (embedding dim=%s). Semantic matching ACTIVE.", dim)
    except Exception as exc:  # pragma: no cover - startup diagnostic
        logger.exception("❌ Failed to preload HF embedding model: %s", exc)
        logger.warning("⚠️  Semantic matching will be DISABLED. Scores will be skill-based only.")


def _preload_skill_extractor() -> None:
    """Pre-embed the canonical skill library so first extraction is fast."""
    try:
        from services.skill_extractor import get_skill_extractor

        extractor = get_skill_extractor()
        extractor.ensure_library_loaded()
        # Verify the OpenRouter LLM is reachable (logs status, never raises)
        extractor.warmup_llm()
    except Exception as exc:  # pragma: no cover - startup diagnostic
        logger.exception("❌ Failed to preload skill extractor: %s", exc)


def create_app(config_class=Config):
    """Flask application factory."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    app = Flask(__name__)
    app.config.from_object(config_class)

    CORS(app, resources={r"/api/*": {"origins": "*"}})
    os.makedirs(app.config.get("UPLOAD_FOLDER", "/tmp/shughaily_uploads"), exist_ok=True)

    _preload_embedding_model()
    _preload_skill_extractor()

    from routes.chat import chat_bp
    from routes.generate import generate_bp
    from routes.match import match_bp
    from routes.parse import parse_bp

    app.register_blueprint(parse_bp)
    app.register_blueprint(match_bp)
    app.register_blueprint(generate_bp)
    app.register_blueprint(chat_bp)

    @app.route("/api/ai/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok", "service": "shughaily-ai"})

    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({"error": "Bad request", "detail": str(error)}), 400

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({"error": "Resource not found", "detail": str(error)}), 404

    @app.errorhandler(413)
    def too_large(error):
        return jsonify({"error": "Uploaded file is too large", "detail": str(error)}), 413

    @app.errorhandler(500)
    def server_error(error):
        return jsonify({"error": "Internal server error", "detail": str(error)}), 500

    return app
