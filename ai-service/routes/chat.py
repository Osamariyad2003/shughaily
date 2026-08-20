"""Conversational copilot endpoint — calls OpenRouter via the LLM client."""

from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from prompts.templates import SHUGHAILY_CHAT_SYSTEM
from routes.helpers import fetch_user, get_db
from services.llm_client import get_llm_client
from utils.arabic import normalize_arabic

logger = logging.getLogger(__name__)

chat_bp = Blueprint("chat", __name__)


# ── Helpers ──────────────────────────────────────────────────────────────


def _latest_user_message(payload: dict) -> str:
    if isinstance(payload.get("message"), str) and payload["message"].strip():
        return payload["message"].strip()

    messages = payload.get("messages") or []
    if isinstance(messages, list):
        for item in reversed(messages):
            if isinstance(item, dict) and item.get("role") == "user" and item.get("content"):
                return str(item["content"]).strip()

    return ""


def _detect_intent(message: str) -> str:
    """Lightweight hint for the LLM — NOT a router."""
    lowered = message.lower()
    normalized = normalize_arabic(message).lower()

    if any(k in lowered for k in ("cv", "resume")) or any(
        k in normalized for k in ("سيره", "سيرة", "الذاتيه", "الذاتية")
    ):
        return "resume"
    if "cover" in lowered or any(k in normalized for k in ("خطاب", "رساله", "رسالة")):
        return "cover_letter"
    if "interview" in lowered or "مقاب" in normalized:
        return "interview"
    if "job" in lowered or any(k in normalized for k in ("وظيف", "فرصه", "فرصة")):
        return "jobs"
    return "general"


def _build_user_context(user_id: str | None) -> str:
    """Hydrate a compact user-context block for the system prompt.

    Unlike the resume_id-bearing routes in match.py/generate.py, there is
    no second id here to cross-check `user_id` against — this endpoint has
    no way to independently verify "the caller is actually this user"
    beyond the request having passed app.py's before_request internal-auth
    check at all. The trust chain is: only the Express backend can reach
    this endpoint (internal-auth header, network isolation), and Express
    is required to forward only its OWN authenticated session's user_id
    here, never a client-supplied one — see backend's chat controller.
    That's the "gate" for this hydration; there's no additional check to
    add on this side without introducing a real session/JWT verification
    into this service, which is out of scope for this pass.
    """
    if not user_id:
        return "(مستخدم غير مسجّل دخوله)"

    user = fetch_user(str(user_id)) or {}
    db = get_db()

    name = user.get("name") or "(غير محدد)"

    resume_row = db.fetch_one(
        "SELECT COUNT(*) AS count FROM resumes WHERE user_id = %s",
        (str(user_id),),
    )
    resume_count = int(resume_row["count"]) if resume_row and resume_row.get("count") is not None else 0

    prefs = db.fetch_one(
        """
        SELECT target_titles, preferred_locations, min_salary, work_type, industries
        FROM user_preferences
        WHERE user_id = %s
        """,
        (str(user_id),),
    ) or {}

    target_titles = prefs.get("target_titles") or []
    preferred_locations = prefs.get("preferred_locations") or []
    min_salary = prefs.get("min_salary")
    work_type = prefs.get("work_type")

    recent_jobs = db.fetch_all(
        """
        SELECT title, company, location
        FROM jobs
        ORDER BY created_at DESC
        LIMIT 5
        """,
    ) or []
    recent_jobs_str = (
        "; ".join(f"{j.get('title')} @ {j.get('company')}" for j in recent_jobs)
        or "(لا يوجد)"
    )

    parts = [
        f"- الاسم: {name}",
        f"- عدد السير الذاتية المرفوعة: {resume_count}",
        f"- المسميات المستهدفة: {', '.join(target_titles) if target_titles else '(غير محددة)'}",
        f"- المواقع المفضلة: {', '.join(preferred_locations) if preferred_locations else '(غير محددة)'}",
        f"- الراتب الأدنى: {min_salary if min_salary else '(غير محدد)'}",
        f"- نوع العمل: {work_type if work_type else '(غير محدد)'}",
        f"- آخر وظائف على المنصة: {recent_jobs_str}",
    ]
    return "\n".join(parts)


def _normalize_history(payload: dict, fallback_user_message: str) -> list[dict]:
    """Build the message list to send to the LLM, capped at the last ~12 turns."""
    raw = payload.get("messages") or []
    history: list[dict] = []
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = item.get("content")
            if role in ("user", "assistant", "system") and isinstance(content, str) and content.strip():
                history.append({"role": role, "content": content.strip()})

    if not history and fallback_user_message:
        history.append({"role": "user", "content": fallback_user_message})

    # Drop any leading system messages — we control the system prompt server-side
    history = [m for m in history if m["role"] != "system"]

    # Cap to last 12 messages to keep prompt size manageable
    return history[-12:]


# ── Route ────────────────────────────────────────────────────────────────


@chat_bp.post("/api/chat")
def chat():
    data = request.get_json(silent=True) or {}
    message = _latest_user_message(data)
    user_id = data.get("user_id")
    language = str(data.get("language") or "ar").lower()

    if not message:
        return jsonify({"error": "message or messages is required"}), 400

    intent = _detect_intent(message)
    context_block = _build_user_context(user_id)

    system_prompt = SHUGHAILY_CHAT_SYSTEM.format(
        context=context_block,
        intent_hint=intent,
    )
    if language == "en":
        system_prompt += "\n\nIMPORTANT: The user is writing in English. Reply in English."

    history = _normalize_history(data, message)

    is_en = language == "en"
    unavailable_msg = (
        "Chat is temporarily unavailable. Please try again in a moment."
        if is_en else "خدمة المحادثة غير متاحة حالياً. الرجاء المحاولة لاحقاً."
    )
    no_reply_msg = (
        "I couldn't generate a reply right now — please try again in a few seconds."
        if is_en else "ما قدرت أرد الحين، حاول مرة ثانية بعد لحظات."
    )

    client = get_llm_client()
    if not client.is_available:
        return jsonify({"reply": unavailable_msg, "intent": intent, "llm": False}), 503

    reply = client.chat(
        messages=[{"role": "system", "content": system_prompt}, *history],
        max_tokens=600,
        temperature=0.6,
    )

    if not reply:
        logger.warning("Chat LLM returned no content for user %s", user_id)
        return jsonify({"reply": no_reply_msg, "intent": intent, "llm": False}), 502

    return jsonify({
        "reply": reply.strip(),
        "intent": intent,
        "llm": True,
        "model": client.model,
    })
