import hmac
import logging
import os

from flask import Flask, jsonify, request

from config import Config
from utils.errors import internal_error_response

logger = logging.getLogger(__name__)

# Header the Express backend must send on every /api/* call (see
# _require_internal_auth below). Matches backend's ai.service.ts.
_INTERNAL_AUTH_HEADER = "X-Internal-Auth"


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

    # No CORS policy at all: this service is internal-only (see item 1 —
    # it isn't published on a host port) and is never called from a
    # browser, only from the Express backend server-to-server. flask-cors
    # is intentionally not installed/imported here; adding any Access-
    # Control-Allow-Origin response header would only widen who a browser
    # is allowed to let call this service for no benefit, since it isn't
    # meant to be reachable from one at all.

    @app.before_request
    def _require_internal_auth():
        """Reject any /api/* request that isn't from the Express backend.

        This is the ONLY thing enforcing "only Express calls this service" —
        network isolation (item 1) keeps it off the host, but anything else
        on the same Docker network could still reach it without this check.
        Fails closed: a missing/misconfigured token on our side rejects
        every request rather than silently running unauthenticated.
        """
        if request.path == "/api/ai/health":
            return None
        if not request.path.startswith("/api/"):
            return None

        expected = config_class.INTERNAL_AUTH_TOKEN
        provided = request.headers.get(_INTERNAL_AUTH_HEADER, "")
        # hmac.compare_digest needs matching lengths to stay constant-time;
        # comparing against an empty string when the header is absent would
        # both leak timing AND accept an empty expected token, so require a
        # non-empty provided value up front.
        if not provided or not hmac.compare_digest(provided, expected):
            logger.warning("Rejected %s %s: missing/invalid %s header", request.method, request.path, _INTERNAL_AUTH_HEADER)
            return jsonify({"error": "unauthorized"}), 401
        return None

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

    # These four handlers deliberately do NOT echo `str(error)` — Werkzeug's
    # default error descriptions, and any exception message that reaches the
    # 500 handler, can carry internal paths/hostnames/config detail. Only a
    # fixed, generic message goes to the client; anything worth debugging is
    # in the server-side log (via `internal_error_response` for the 500
    # case — see utils/errors.py).
    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({"error": "bad_request"}), 400

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({"error": "not_found"}), 404

    @app.errorhandler(413)
    def too_large(error):
        return jsonify({"error": "payload_too_large"}), 413

    @app.errorhandler(500)
    def server_error(error):
        return internal_error_response(
            error if isinstance(error, Exception) else Exception(str(error)),
            context="unhandled_flask_error",
        )

    return app
