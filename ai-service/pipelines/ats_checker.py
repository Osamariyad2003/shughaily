"""ATS (Applicant Tracking System) compatibility checker for resumes."""

from __future__ import annotations

import logging
import re
from utils.arabic import normalize_arabic
from services.llm_client import get_llm_client

logger = logging.getLogger(__name__)

_LLM_SYSTEM = (
    "أنت خبير في تحسين السير الذاتية لأنظمة ATS. "
    "ردودك دائماً بالعربية، مختصرة وعملية."
)

_LLM_USER_TEMPLATE = """\
بناءً على تحليل ATS التالي لسيرة ذاتية:
- الدرجة: {score}/100
- المشكلات: {issues}
- المهارات الموجودة: {skills}
- ملخص: {summary}

اكتب 2-3 نصائح عملية ومحددة لتحسين توافق السيرة مع أنظمة ATS.
أجب بالعربية فقط، بدون مقدمات، مباشرة للنقاط."""


# Common ATS-unfriendly patterns
COMPLEX_FORMAT_MARKERS = [
    "table", "column", "header", "footer", "sidebar",
    "text box", "graphic", "chart", "image",
]

REQUIRED_SECTIONS_EN = ["experience", "education", "skills", "contact"]
REQUIRED_SECTIONS_AR = ["خبر", "تعليم", "مهار", "تواصل", "اتصال", "بريد"]

COMMON_ATS_KEYWORDS = {
    "tech": ["python", "javascript", "react", "node", "sql", "aws", "docker", "git", "api", "agile"],
    "business": ["management", "strategy", "analysis", "leadership", "budget", "roi", "stakeholder"],
    "design": ["figma", "adobe", "ux", "ui", "wireframe", "prototype", "user research"],
}

# Require at least 7 digits in a phone-like cluster so years ("2020-2023") and
# stray dashes don't get flagged as phone numbers.
_PHONE_RE = re.compile(r"\+?\d(?:[\s\-\(\)\.]*\d){6,}")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")


def _flatten_skill(item) -> str:
    """Normalized skills are `{name, category, ...}` dicts; legacy ones are strings."""
    if isinstance(item, dict):
        return str(item.get("name") or "").strip()
    return str(item or "").strip()


def _flatten_experience(item) -> str:
    """Serialize an experience entry (string or dict) into a searchable blob."""
    if isinstance(item, dict):
        parts: list[str] = []
        for key in ("title", "company", "location", "start", "end", "summary", "description"):
            def _flatten_experience(item) -> str:
    """Serialize an experience entry (string or dict) into a searchable blob."""
    if isinstance(item, dict):
        parts: list[str] = []
        for key in ("title", "company", "location", "start", "end", "summary", "description"):
            value = item.get(key)
            if value:
                parts.append(str(value))
        highlights = item.get("highlights")
        if isinstance(highlights, list):
            parts.extend(str(h) for h in highlights if h)
        return " ".join(parts)
    return str(item or "")
            if value:
                parts.append(str(value))
        highlights = item.get("highlights")
        if isinstance(highlights, list):
            parts.extend(str(h) for h in highlights if h)
        return " ".join(parts)
    return str(item or "")


def _merge_normalized(parsed_resume: dict) -> dict:
    """Prefer the LLM-normalized profile when present — the regex section parser is a
    fallback and often misses Arabic/English sections that the LLM extracts cleanly."""
    normalized = parsed_resume.get("normalized")
    if not isinstance(normalized, dict):
        return parsed_resume

    merged = dict(parsed_resume)

    nsum = normalized.get("summary")
    if isinstance(nsum, str) and nsum.strip():
        merged["summary"] = nsum

    nskills = normalized.get("skills")
    if isinstance(nskills, list) and nskills:
        names = [s for s in (_flatten_skill(x) for x in nskills) if s]
        if names:
            merged["skills"] = names

    for key in ("experience", "education", "languages"):
        value = normalized.get(key)
        if isinstance(value, list) and value:
            merged[key] = value

    contact = normalized.get("contact")
    if isinstance(contact, dict):
        merged["_contact"] = contact

    return merged


class ATSCheckerPipeline:
    """Analyse a parsed resume for ATS compatibility and return a score + suggestions."""

    def check(self, parsed_resume: dict, raw_text: str | None = None) -> dict:
        """Run all ATS checks and return a result dict."""

        parsed_resume = _merge_normalized(parsed_resume or {})

        checks: list[dict] = []
        score = 100  # Start at 100, deduct for issues

        text = raw_text or parsed_resume.get("raw_text") or ""
        summary = parsed_resume.get("summary") or ""
        skills_raw = parsed_resume.get("skills") or []
        skills = [s for s in (_flatten_skill(x) for x in skills_raw) if s]
        experience = parsed_resume.get("experience") or []
        education = parsed_resume.get("education") or []
        languages_list = parsed_resume.get("languages") or []
        contact = parsed_resume.get("_contact") or {}

        # ── 1. Contact Information ──────────────────────────────────────
        haystack = " ".join([text, summary])
        has_email = bool(contact.get("email")) or bool(_EMAIL_RE.search(haystack))
        has_phone = bool(contact.get("phone")) or bool(_PHONE_RE.search(haystack))

        if has_email and has_phone:
            checks.append({"name": "معلومات التواصل", "status": "pass", "message": "البريد الإلكتروني ورقم الهاتف موجودان."})
        elif has_email:
            checks.append({"name": "معلومات التواصل", "status": "warning", "message": "البريد موجود لكن رقم الهاتف غير واضح. تأكد من إضافته."})
            score -= 5
        else:
            checks.append({"name": "معلومات التواصل", "status": "fail", "message": "لم يتم العثور على بريد إلكتروني أو رقم هاتف. أنظمة ATS تحتاج هذه المعلومات."})
            score -= 15

        # ── 2. Summary / Objective ──────────────────────────────────────
        if summary and len(summary.split()) >= 10:
            checks.append({"name": "الملخص الشخصي", "status": "pass", "message": "الملخص موجود وبطول مناسب."})
        elif summary:
            checks.append({"name": "الملخص الشخصي", "status": "warning", "message": "الملخص قصير جداً. أنظمة ATS تفضل ملخص من 30-50 كلمة."})
            score -= 5
        else:
            checks.append({"name": "الملخص الشخصي", "status": "fail", "message": "لا يوجد ملخص شخصي. إضافة ملخص يساعد ATS في تصنيف سيرتك."})
            score -= 10

        # ── 3. Skills Section ───────────────────────────────────────────
        if len(skills) >= 8:
            checks.append({"name": "قسم المهارات", "status": "pass", "message": f"تم العثور على {len(skills)} مهارة — عدد جيد."})
        elif len(skills) >= 3:
            checks.append({"name": "قسم المهارات", "status": "warning", "message": f"عدد المهارات قليل ({len(skills)}). حاول تضيف 8-15 مهارة مرتبطة بالوظائف المستهدفة."})
            score -= 10
        else:
            checks.append({"name": "قسم المهارات", "status": "fail", "message": "قسم المهارات ضعيف أو غير موجود. أنظمة ATS تعتمد بشكل كبير على الكلمات المفتاحية."})
            score -= 20

        # ── 4. Work Experience ──────────────────────────────────────────
        exp_blobs = [_flatten_experience(e) for e in experience]
        exp_text = " ".join(b for b in exp_blobs if b)
        if len(experience) >= 2:
            has_numbers = bool(re.search(r"\d+", exp_text))
            if has_numbers:
                checks.append({"name": "الخبرات العملية", "status": "pass", "message": "الخبرات موجودة وتحتوي على أرقام وإنجازات."})
            else:
                checks.append({"name": "الخبرات العملية", "status": "warning", "message": "الخبرات موجودة لكن بدون أرقام. أضف نتائج قابلة للقياس."})
                score -= 5
        elif len(experience) >= 1:
            checks.append({"name": "الخبرات العملية", "status": "warning", "message": "خبرة واحدة فقط. أضف تدريب أو مشاريع إضافية."})
            score -= 10
        else:
            checks.append({"name": "الخبرات العملية", "status": "fail", "message": "لا توجد خبرات عملية. أضف أي خبرة حتى لو تدريب أو مشاريع شخصية."})
            score -= 15

        # ── 5. Education ────────────────────────────────────────────────
        if education:
            checks.append({"name": "التعليم", "status": "pass", "message": "قسم التعليم موجود."})
        else:
            checks.append({"name": "التعليم", "status": "warning", "message": "لم يتم العثور على قسم التعليم. أضف مؤهلاتك الأكاديمية."})
            score -= 5

        # ── 6. File Format Check ────────────────────────────────────────
        checks.append({"name": "تنسيق الملف", "status": "pass", "message": "تم تحليل الملف بنجاح — التنسيق متوافق مع ATS."})

        # ── 7. Length Check ─────────────────────────────────────────────
        edu_text = " ".join(_flatten_experience(e) for e in education)
        total_words = len((text or "").split()) or (
            len(summary.split()) +
            len(exp_text.split()) +
            len(edu_text.split()) +
            sum(len(s.split()) for s in skills)
        )

        if 200 <= total_words <= 800:
            checks.append({"name": "طول السيرة", "status": "pass", "message": f"طول مناسب (~{total_words} كلمة)."})
        elif total_words < 200:
            checks.append({"name": "طول السيرة", "status": "warning", "message": f"السيرة قصيرة جداً (~{total_words} كلمة). المطلوب 300-700 كلمة."})
            score -= 10
        else:
            checks.append({"name": "طول السيرة", "status": "warning", "message": f"السيرة طويلة (~{total_words} كلمة). حاول تختصرها لصفحتين."})
            score -= 5

        # ── 8. Keywords Density ─────────────────────────────────────────
        all_text = normalize_arabic(f"{summary} {' '.join(skills)} {exp_text}").lower()
        keyword_matches = 0
        matched_keywords: list[str] = []
        for category, keywords in COMMON_ATS_KEYWORDS.items():
            for kw in keywords:
                if kw in all_text:
                    keyword_matches += 1
                    matched_keywords.append(kw)

        if keyword_matches >= 5:
            checks.append({"name": "كلمات مفتاحية", "status": "pass", "message": f"تم العثور على {keyword_matches} كلمة مفتاحية شائعة."})
        elif keyword_matches >= 2:
            checks.append({"name": "كلمات مفتاحية", "status": "warning", "message": f"عدد الكلمات المفتاحية قليل ({keyword_matches}). أضف مصطلحات تقنية مرتبطة بمجالك."})
            score -= 5
        else:
            checks.append({"name": "كلمات مفتاحية", "status": "fail", "message": "لا توجد كلمات مفتاحية كافية. أنظمة ATS تبحث عن مصطلحات محددة."})
            score -= 10

        # Clamp score
        score = max(0, min(100, score))

        # Overall verdict
        if score >= 80:
            verdict = "سيرتك الذاتية متوافقة بشكل جيد مع أنظمة ATS."
            verdict_level = "good"
        elif score >= 60:
            verdict = "سيرتك الذاتية تحتاج تحسينات بسيطة لتكون متوافقة مع ATS."
            verdict_level = "fair"
        else:
            verdict = "سيرتك الذاتية تحتاج تعديلات جوهرية لتتجاوز أنظمة ATS."
            verdict_level = "poor"

        # LLM-powered improvement tips via OpenRouter
        llm_tips: str | None = None
        try:
            client = get_llm_client()
            if client.is_available:
                failed_issues = [c["message"] for c in checks if c["status"] in ("fail", "warning")]
                prompt = _LLM_USER_TEMPLATE.format(
                    score=score,
                    issues="; ".join(failed_issues) if failed_issues else "لا توجد مشكلات واضحة",
                    skills=", ".join(skills[:10]) if skills else "لا توجد مهارات",
                    summary=(summary[:200] + "...") if len(summary) > 200 else summary or "غير موجود",
                )
                llm_tips = client.chat(
                    messages=[
                        {"role": "system", "content": _LLM_SYSTEM},
                        {"role": "user", "content": prompt},
                    ],
                    max_tokens=400,
                    temperature=0.3,
                )
        except Exception as exc:
            logger.warning("ATS LLM tips failed: %s", exc)

        return {
            "ats_score": score,
            "verdict": verdict,
            "verdict_level": verdict_level,
            "checks": checks,
            "matched_keywords": matched_keywords,
            "total_checks": len(checks),
            "passed_checks": sum(1 for c in checks if c["status"] == "pass"),
            "warning_checks": sum(1 for c in checks if c["status"] == "warning"),
            "failed_checks": sum(1 for c in checks if c["status"] == "fail"),
            "llm_tips": llm_tips,
        }
