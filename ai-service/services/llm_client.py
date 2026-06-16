"""Multi-provider chat client.

Both Groq and OpenRouter expose OpenAI-compatible /chat/completions endpoints,
so the surface stays tiny. The router tries Groq first (free, fast, separate
quota) and falls back to OpenRouter (broader model selection but stricter
free-tier limits).
"""

from __future__ import annotations

import json
import logging
from typing import Any

import requests

from config import Config

logger = logging.getLogger(__name__)


# ── Fallback chains ──────────────────────────────────────────────────────

# Groq free tier — extremely fast inference, separate daily quota.
_GROQ_FALLBACK = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "qwen/qwen3-32b",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "moonshotai/kimi-k2-instruct-0905",
]

# OpenRouter free tier — broader catalog but tighter combined daily cap.
_OPENROUTER_FALLBACK = [
    "openai/gpt-oss-120b:free",
    "openai/gpt-oss-20b:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "google/gemma-3-27b-it:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "z-ai/glm-4.5-air:free",
    "qwen/qwen3-coder:free",
    "google/gemma-3-12b-it:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "nvidia/nemotron-nano-9b-v2:free",
]


# ── Base provider ────────────────────────────────────────────────────────


class _BaseProvider:
    """Shared OpenAI-compatible chat client. Subclasses set name + headers."""

    name: str = "base"
    extra_headers: dict[str, str] = {}

    def __init__(
        self,
        api_key: str | None,
        model: str,
        base_url: str,
        fallback_models: list[str],
        timeout: int = 45,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.fallback_models = fallback_models
        self.timeout = timeout

    @property
    def is_available(self) -> bool:
        return bool(self.api_key)

    def _build_chain(self, primary: str | None) -> list[str]:
        chain: list[str] = []
        seen: set[str] = set()
        for candidate in [primary or self.model, *self.fallback_models]:
            if candidate and candidate not in seen:
                chain.append(candidate)
                seen.add(candidate)
        return chain

    def _post_once(self, payload: dict[str, Any]) -> tuple[int, str | None]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            **self.extra_headers,
        }
        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                data=json.dumps(payload),
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            logger.warning("%s request failed: %s", self.name, exc)
            return 0, None

        if response.status_code != 200:
            logger.warning(
                "%s %s returned %s: %s",
                self.name, payload["model"], response.status_code, response.text[:200],
            )
            return response.status_code, None

        try:
            data = response.json()
            return 200, data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as exc:
            logger.warning("Malformed %s response: %s", self.name, exc)
            return 200, None

    def chat(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int = 600,
        temperature: float = 0.2,
        response_format: dict[str, Any] | None = None,
        model: str | None = None,
    ) -> tuple[str | None, int]:
        """Returns (content, last_status). Tries every model in the chain."""
        if not self.is_available:
            return None, 0

        last_status = 0
        for candidate in self._build_chain(model):
            payload: dict[str, Any] = {
                "model": candidate,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
            if response_format:
                payload["response_format"] = response_format

            status, content = self._post_once(payload)
            last_status = status
            if content:
                if candidate != self.model:
                    logger.info("%s promoting model: %s", self.name, candidate)
                    self.model = candidate
                return content, status
            if status in (401, 403):
                # Auth failed — no point trying more models on this provider.
                return None, status
        return None, last_status


# ── Concrete providers ───────────────────────────────────────────────────


class GroqClient(_BaseProvider):
    name = "Groq"

    def __init__(self) -> None:
        super().__init__(
            api_key=Config.GROQ_API_KEY,
            model=Config.GROQ_MODEL,
            base_url=Config.GROQ_BASE_URL,
            fallback_models=_GROQ_FALLBACK,
        )


class OpenRouterClient(_BaseProvider):
    name = "OpenRouter"
    extra_headers = {
        "HTTP-Referer": "https://shughaily.app",
        "X-Title": "Shughaily Job Copilot",
    }

    def __init__(self) -> None:
        super().__init__(
            api_key=Config.OPENROUTER_API_KEY,
            model=Config.OPENROUTER_MODEL,
            base_url=Config.OPENROUTER_BASE_URL,
            fallback_models=_OPENROUTER_FALLBACK,
        )


# ── Router (Groq → OpenRouter) ───────────────────────────────────────────


class LLMRouter:
    """Tries OpenRouter first; falls back to Groq if OpenRouter is rate-limited or down."""

    def __init__(self) -> None:
        self.providers: list[_BaseProvider] = []
        openrouter = OpenRouterClient()
        if openrouter.is_available:
            self.providers.append(openrouter)
        groq = GroqClient()
        if groq.is_available:
            self.providers.append(groq)

    @property
    def is_available(self) -> bool:
        return any(p.is_available for p in self.providers)

    @property
    def model(self) -> str:
        """Best-effort: report the active provider's current preferred model."""
        return self.providers[0].model if self.providers else "(none)"

    def chat(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int = 600,
        temperature: float = 0.2,
        response_format: dict[str, Any] | None = None,
        model: str | None = None,
    ) -> str | None:
        """Try each provider in order. Returns content from the first that succeeds."""
        for provider in self.providers:
            content, status = provider.chat(
                messages,
                max_tokens=max_tokens,
                temperature=temperature,
                response_format=response_format,
                model=model if provider is self.providers[0] else None,
            )
            if content:
                return content
            # 401/403 = bad key → skip to next provider, don't burn time
            if status in (401, 403):
                logger.warning("%s auth failed (%s); falling through", provider.name, status)
                continue
            # All models on this provider returned non-200 → fall through to next
            logger.warning("%s exhausted; falling through to next provider", provider.name)
        return None


# ── Module-level singleton ───────────────────────────────────────────────

_client: LLMRouter | None = None


def get_llm_client() -> LLMRouter:
    global _client
    if _client is None:
        _client = LLMRouter()
        names = [p.name for p in _client.providers] or ["(none)"]
        logger.info("LLM router initialized with providers: %s", " → ".join(names))
    return _client
