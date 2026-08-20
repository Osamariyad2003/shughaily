"""Entry point for the Al-Shughaily AI service."""

import logging

from app import create_app
from config import Config

app = create_app()

if __name__ == "__main__":
    if Config.DEBUG:
        # debug=True enables the Werkzeug interactive debugger — anyone who
        # can reach this port can execute arbitrary code through it. Only
        # ever run this way on a machine nothing else can connect to.
        logging.getLogger(__name__).warning(
            "⚠️  FLASK_DEBUG=true — the Werkzeug interactive debugger is ACTIVE. "
            "Never run this way anywhere reachable from outside your own machine."
        )
    app.run(host="0.0.0.0", port=Config.FLASK_PORT, debug=Config.DEBUG)
