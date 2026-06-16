"""Generation endpoints for CV feedback, cover letters, and interview prep."""

from __future__ import annotations

import json
import logging
import re

from flask import Blueprint, jsonify, request

from pipelines.apply_pack import ApplyPackPipeline
from pipelines.ats_checker import ATSCheckerPipeline
from pipelines.auto_apply_decision import AutoApplyDecisionPipeline
from pipelines.cover_letter import CoverLetterPipeline
from pipelines.cv_improver import CVImproverPipeline
from pipelines.job_processor import JobProcessorPipeline
from pipelines.job_targeting import JobTargetingPipeline
from routes.helpers import fetch_job, fetch_resume, fetch_user, get_db
from services.llm_client import get_llm_client

logger = logging.getLogger(__name__)

generate_bp = Blueprint("generate", __name__)


def _resume_payload(resume: dict | None) -> dict:
    if not resume:
        return {}
    parsed_data = resume.get("parsed_data")
    return parsed_data if isinstance(parsed_data, dict) else {}


def _format_suggestions(feedback: dict) -> list[dict]:
    suggestions: list[dict] = []

    for section, priority in (
        ("summary_feedback", "high"),
        ("skills_feedback", "medium"),
        ("experience_feedback", "medium"),
        ("general_tips", "low"),
    ):
        for suggestion in feedback.get(section, []):
            suggestions.append(
                {
                    "section": section.replace("_feedback", "").replace("_", "-"),
                    "issue": suggestion,
                    "suggestion": suggestion,
                    "priority": priority,
                }
            )

    return suggestions


@generate_bp.post("/api/cv-feedback")
def cv_feedback():
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    resume_id = data.get("resume_id")

    if not user_id or not resume_id:
        return jsonify({"error": "user_id and resume_id are required"}), 400

    resume = fetch_resume(str(resume_id))
    if not resume:
        return jsonify({"error": "Resume not found"}), 404

    db = get_db()
    preferences = db.fetch_one(
        """
        SELECT target_titles, preferred_locations, min_salary, work_type, industries
        FROM user_preferences
        WHERE user_id = %s
        """,
        (str(user_id),),
    ) or {}

    target_titles = preferences.get("target_titles") or []
    target_jobs: list[dict] = []
    processor = JobProcessorPipeline()

    for title in target_titles[:3]:
        jobs = db.fetch_all(
            """
            SELECT id, title, company, location, description, salary_text, employment_type, created_at
            FROM jobs
            WHERE title ILIKE %s
            ORDER BY created_at DESC
            LIMIT 3
            """,
            (f"%{title}%",),
        )
        target_jobs.extend(processor.process(job) for job in jobs)

    feedback = CVImproverPipeline().suggest_improvements(
        _resume_payload(resume),
        target_titles=target_titles,
        target_jobs=target_jobs,
    )

    return jsonify({**feedback, "suggestions": _format_suggestions(feedback)})


@generate_bp.post("/api/cover-letter")
def cover_letter():
    """Generate JD analysis + tailored full and short cover letters."""
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    job_id = data.get("job_id")
    resume_id = data.get("resume_id")
    language = str(data.get("language") or "en").lower()

    if not user_id or not job_id or not resume_id:
        return jsonify({"error": "user_id, job_id, and resume_id are required"}), 400

    user = fetch_user(str(user_id))
    resume = fetch_resume(str(resume_id))
    job = fetch_job(str(job_id))

    if not user or not resume or not job:
        return jsonify({"error": "User, resume, or job not found"}), 404

    parsed_resume = _resume_payload(resume)
    if not parsed_resume:
        return jsonify({"error": "Resume must be parsed before generating a cover letter"}), 400

    result = CoverLetterPipeline().run(
        user=dict(user),
        parsed_resume=parsed_resume,
        job=dict(job),
        language=language,
    )

    # Backwards compatibility: keep `cover_letter` field for older clients
    result["cover_letter"] = result["full_cover_letter"]
    return jsonify(result)


@generate_bp.post("/api/interview-prep")
def interview_prep():
    data = request.get_json(silent=True) or {}
    job_id = data.get("job_id")
    resume_id = data.get("resume_id")
    language = str(data.get("language") or "ar").lower()

    if not job_id:
        return jsonify({"error": "job_id is required"}), 400

    job = fetch_job(str(job_id))
    resume = fetch_resume(str(resume_id)) if resume_id else None

    if not job:
        return jsonify({"error": "Job not found"}), 404

    parsed_resume = _resume_payload(resume)
    required_skills = JobProcessorPipeline().process(job).get("extracted_skills", [])
    primary_skills = required_skills[:3] or parsed_resume.get("skills", [])[:3]

    questions = []
    for skill in primary_skills:
        if language == "en":
            question = {
                "question": f"Tell me about a project where you used {skill}.",
                "sample_answer": f"Highlight a concrete example where you used {skill}, explain the challenge, the action you took, and the measurable result.",
                "category": "technical",
            }
        else:
            question = {
                "question": f"احكِ لي عن موقف استخدمت فيه مهارة {skill}.",
                "sample_answer": f"اختر مثالاً واضحاً يبرز كيف استخدمت {skill}، وما المشكلة التي كانت موجودة، وما الإجراء الذي اتخذته، وما النتيجة التي وصلت إليها.",
                "category": "technical",
            }
        questions.append(question)

    questions.append(
        {
            "question": "لماذا تريد هذه الوظيفة؟" if language != "en" else "Why do you want this role?",
            "sample_answer": (
                "اربط بين مهاراتك الحالية وبين أهدافك المهنية وبين طبيعة الشركة والوظيفة."
                if language != "en"
                else "Connect your current strengths, growth goals, and what attracts you to the company."
            ),
            "category": "motivation",
        }
    )
    questions.append(
        {
            "question": "حدثني عن موقف صعب وكيف تعاملت معه." if language != "en" else "Tell me about a difficult challenge and how you handled it.",
            "sample_answer": (
                "استخدم أسلوب STAR: الموقف، المهمة، الإجراء، النتيجة."
                if language != "en"
                else "Use the STAR structure: situation, task, action, result."
            ),
            "category": "behavioral",
        }
    )

    return jsonify({"questions": questions, "language": language, "job_title": job.get("title")})


@generate_bp.post("/api/ats-check")
def ats_check():
    """Run ATS compatibility checks on a parsed resume."""
    data = request.get_json(silent=True) or {}
    resume_id = data.get("resume_id")

    if not resume_id:
        return jsonify({"error": "resume_id is required"}), 400

    resume = fetch_resume(str(resume_id))
    if not resume:
        return jsonify({"error": "Resume not found"}), 404

    parsed_data = _resume_payload(resume)
    if not parsed_data:
        return jsonify({"error": "Resume has not been parsed yet. Parse it first."}), 400

    raw_text = resume.get("raw_text") or parsed_data.get("raw_text") or ""

    result = ATSCheckerPipeline().check(parsed_data, raw_text=raw_text)
    return jsonify(result)


@generate_bp.post("/api/job-targeting")
def job_targeting():
    """Compile free-form candidate preferences into a structured search config."""
    data = request.get_json(silent=True) or {}
    user_preferences = (data.get("preferences") or "").strip()
    if not user_preferences:
        return jsonify({"error": "preferences is required"}), 400

    resume_summary = data.get("resume_summary")
    skills = data.get("skills") or []

    # Optionally hydrate from resume_id if provided
    resume_id = data.get("resume_id")
    if resume_id and not resume_summary:
        resume = fetch_resume(str(resume_id))
        parsed = _resume_payload(resume)
        if parsed:
            resume_summary = parsed.get("summary")
            if not skills:
                skills = parsed.get("skills") or []

    config = JobTargetingPipeline().run(
        user_preferences=user_preferences,
        resume_summary=resume_summary,
        skills=skills,
    )
    return jsonify(config)


# ── Application email + form auto-fill ──────────────────────────────────


_APP_EMAIL_SYSTEM = (
    "You are an expert job application writer. You write concise, "
    "professional but human application emails grounded only in the "
    "candidate facts you are given. You never invent jobs, skills, or "
    "achievements. You match the language requested."
)

_APP_EMAIL_USER = """Write a job application email.

Constraints:
- 120-180 words in the body
- Strong, personalized opening (no "I am writing to apply for...")
- Highlight 2-3 relevant achievements drawn ONLY from the candidate facts
- Mirror keywords from the JD naturally
- End with a clear call to action
- Language: {language}

Job Title: {job_title}
Company: {company}
Job Description (truncated):
{job_description}

Candidate facts (only use these):
- Name: {name}
- Recent role: {recent_role}
- Skills: {skills}
- Summary: {summary}

Return STRICTLY this format and nothing else:
Subject: <subject line>

<email body, plain text, no markdown>
"""


def _fallback_application_email(
    *, name: str, job_title: str, company: str, skills: list[str], language: str
) -> dict:
    """Deterministic fallback when no LLM is available."""
    skills_phrase = ", ".join(skills[:4]) if skills else "relevant tools"
    if language == "ar":
        subject = f"طلب توظيف لدور {job_title} – {name}"
        body = (
            f"مرحباً فريق {company},\n\n"
            f"أتواصل معكم بخصوص وظيفة {job_title}. بناءً على عملي المباشر مع "
            f"{skills_phrase}, أرى أنني أستطيع المساهمة فعلياً في الفريق منذ "
            "اليوم الأول. أركّز على تسليم نتائج قابلة للقياس بدلاً من المخرجات "
            "الشكلية، وهو ما يتوافق مع طبيعة هذا الدور.\n\n"
            f"يسعدني تنسيق مكالمة قصيرة لمناقشة كيف يمكنني دعم خطط {company} "
            "في المرحلة القادمة.\n\n"
            f"شكراً لوقتكم،\n{name}"
        )
    else:
        subject = f"Application for {job_title} – {name}"
        body = (
            f"Hi {company} team,\n\n"
            f"I'd like to be considered for the {job_title} role. My day-to-day "
            f"already centers on {skills_phrase}, which lines up directly with "
            "what you're hiring for. I focus on shipping measurable outcomes "
            "rather than checking off tasks, and that is the kind of work I "
            "want to bring to your team.\n\n"
            f"I'd welcome a short call to discuss how I can contribute to "
            f"{company}'s next chapter.\n\n"
            f"Best,\n{name}"
        )
    return {"subject": subject, "body": body, "llm": False}


def _parse_application_email(text: str) -> dict | None:
    """Extract subject + body from an LLM response."""
    if not text:
        return None
    cleaned = text.strip().strip("`")
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
    match = re.search(r"^\s*Subject:\s*(.+?)\n+(.*)$", cleaned, re.DOTALL | re.IGNORECASE)
    if not match:
        return None
    subject = match.group(1).strip()
    body = match.group(2).strip()
    if not subject or not body:
        return None
    return {"subject": subject, "body": body}


@generate_bp.post("/api/application-email")
def application_email():
    """Generate a tailored job application email (subject + body)."""
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    job_id = data.get("job_id")
    resume_id = data.get("resume_id")
    language = str(data.get("language") or "en").lower()

    if not user_id or not job_id:
        return jsonify({"error": "user_id and job_id are required"}), 400

    user = fetch_user(str(user_id))
    job = fetch_job(str(job_id))
    if not user or not job:
        return jsonify({"error": "User or job not found"}), 404

    resume = fetch_resume(str(resume_id)) if resume_id else None
    parsed_resume = _resume_payload(resume)

    name = user.get("name") or "Applicant"
    skills = parsed_resume.get("skills") or []
    summary = (parsed_resume.get("summary") or "").strip()
    recent_role = ""
    for item in parsed_resume.get("experience") or []:
        if isinstance(item, dict):
            t = (item.get("title") or "").strip()
            c = (item.get("company") or "").strip()
            if t and c:
                recent_role = f"{t} at {c}"
                break
            if t:
                recent_role = t
                break

    job_description = (job.get("description") or "")[:2500]

    client = get_llm_client()
    parsed: dict | None = None
    if client.is_available:
        prompt = _APP_EMAIL_USER.format(
            language="Arabic" if language == "ar" else "English",
            job_title=job.get("title") or "the role",
            company=job.get("company") or "the company",
            job_description=job_description or "(not provided)",
            name=name,
            recent_role=recent_role or "(none listed)",
            skills=", ".join(skills[:10]) or "(none listed)",
            summary=summary or "(none)",
        )
        try:
            content = client.chat(
                messages=[
                    {"role": "system", "content": _APP_EMAIL_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=550,
                temperature=0.5,
            )
            parsed = _parse_application_email(content) if content else None
        except Exception as exc:  # noqa: BLE001
            logger.warning("application_email LLM failed: %s", exc)
            parsed = None

    if parsed:
        return jsonify({**parsed, "language": language, "llm": True})

    fallback = _fallback_application_email(
        name=name,
        job_title=job.get("title") or "the role",
        company=job.get("company") or "your team",
        skills=skills,
        language=language,
    )
    return jsonify({**fallback, "language": language})


# ── Form auto-fill ──────────────────────────────────────────────────────


_FORM_SYSTEM = (
    "You are an AI job application assistant. You analyze job application "
    "forms and generate concise, professional answers grounded only in the "
    "user profile and job description you are given. You never fabricate "
    "credentials, employers, or qualifications."
)

_FORM_USER = """Generate answers for the form fields below.

Rules:
- Keep answers concise and professional.
- For file fields (resume / cv / cover letter), return the literal string "USE_RESUME" or "USE_COVER_LETTER".
- For dropdown / select fields, choose the single most relevant option from the provided options list.
- For salary questions, provide a realistic range based on the role and location.
- For "why do you want this job" style questions, tailor to the company and role.
- For unknown or unclear fields, make a reasonable assumption based on the user profile.
- Language: {language}

Job:
- Title: {job_title}
- Company: {company}
- Description (truncated): {job_description}

User Profile:
- Name: {name}
- Email: {email}
- Location: {location}
- Skills: {skills}
- Summary: {summary}
- Recent role: {recent_role}

Form Fields (JSON):
{fields_json}

Return STRICT JSON in EXACTLY this shape, no preamble, no markdown, no code fences:
{{"fields": [{{"field_label": "...", "type": "...", "answer": "..."}}]}}
"""


def _normalize_form_field(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None
    label = (raw.get("field_label") or raw.get("label") or raw.get("name") or "").strip()
    if not label:
        return None
    field_type = (raw.get("type") or "text").strip().lower()
    options = raw.get("options") or raw.get("choices") or []
    if not isinstance(options, list):
        options = []
    return {
        "field_label": label,
        "type": field_type,
        "options": [str(o) for o in options if o is not None],
    }


def _fallback_form_answer(field: dict, *, profile: dict) -> str:
    label = field["field_label"].lower()
    ftype = field["type"]
    if ftype == "file":
        if "cover" in label:
            return "USE_COVER_LETTER"
        return "USE_RESUME"
    if "name" in label and "company" not in label:
        return profile.get("name") or ""
    if "email" in label:
        return profile.get("email") or ""
    if "phone" in label:
        return profile.get("phone") or ""
    if "location" in label or "city" in label or "country" in label:
        return profile.get("location") or ""
    if field.get("options"):
        return field["options"][0]
    if ftype == "textarea":
        return (
            f"{profile.get('name') or 'I'} brings hands-on experience with "
            f"{', '.join((profile.get('skills') or [])[:4]) or 'the required tools'} "
            "and a track record of delivering measurable outcomes."
        )
    return ""


def _strip_code_fences(text: str) -> str:
    cleaned = text.strip().strip("`")
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
    return cleaned.strip()


@generate_bp.post("/api/form-answers")
def form_answers():
    """Generate structured answers for an application form's detected fields."""
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    job_id = data.get("job_id")
    resume_id = data.get("resume_id")
    language = str(data.get("language") or "en").lower()
    raw_fields = data.get("form_fields") or data.get("fields") or []

    if not isinstance(raw_fields, list) or not raw_fields:
        return jsonify({"error": "form_fields (non-empty array) is required"}), 400

    fields = [f for f in (_normalize_form_field(rf) for rf in raw_fields) if f]
    if not fields:
        return jsonify({"error": "form_fields must contain at least one valid field"}), 400

    user = fetch_user(str(user_id)) if user_id else None
    job = fetch_job(str(job_id)) if job_id else None
    resume = fetch_resume(str(resume_id)) if resume_id else None
    parsed_resume = _resume_payload(resume)

    profile = {
        "name": (user or {}).get("name") or parsed_resume.get("name") or "",
        "email": (user or {}).get("email") or "",
        "location": " ".join(
            filter(None, [(user or {}).get("city"), (user or {}).get("country")])
        ),
        "phone": parsed_resume.get("phone") or "",
        "skills": parsed_resume.get("skills") or [],
        "summary": (parsed_resume.get("summary") or "").strip(),
        "experience": parsed_resume.get("experience") or [],
    }

    recent_role = ""
    for item in profile["experience"]:
        if isinstance(item, dict):
            t = (item.get("title") or "").strip()
            c = (item.get("company") or "").strip()
            if t and c:
                recent_role = f"{t} at {c}"
                break

    client = get_llm_client()
    answers: list[dict] | None = None

    if client.is_available:
        prompt = _FORM_USER.format(
            language="Arabic" if language == "ar" else "English",
            job_title=(job or {}).get("title") or "(unspecified)",
            company=(job or {}).get("company") or "(unspecified)",
            job_description=((job or {}).get("description") or "")[:2000] or "(not provided)",
            name=profile["name"] or "(not provided)",
            email=profile["email"] or "(not provided)",
            location=profile["location"] or "(not provided)",
            skills=", ".join(profile["skills"][:10]) or "(none listed)",
            summary=profile["summary"] or "(none)",
            recent_role=recent_role or "(none listed)",
            fields_json=json.dumps(fields, ensure_ascii=False),
        )
        try:
            content = client.chat(
                messages=[
                    {"role": "system", "content": _FORM_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=900,
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            if content:
                try:
                    parsed = json.loads(_strip_code_fences(content))
                    raw_answers = parsed.get("fields") if isinstance(parsed, dict) else None
                    if isinstance(raw_answers, list):
                        answers = [
                            {
                                "field_label": str(a.get("field_label") or ""),
                                "type": str(a.get("type") or "text"),
                                "answer": str(a.get("answer") or ""),
                            }
                            for a in raw_answers
                            if isinstance(a, dict)
                        ]
                except json.JSONDecodeError:
                    logger.warning("form_answers: LLM returned non-JSON: %s", content[:200])
        except Exception as exc:  # noqa: BLE001
            logger.warning("form_answers LLM failed: %s", exc)

    # If LLM did not return a usable answer for every field, fill the gaps deterministically.
    by_label = {a["field_label"]: a for a in (answers or [])}
    final: list[dict] = []
    for f in fields:
        existing = by_label.get(f["field_label"])
        if existing and existing["answer"]:
            final.append(existing)
        else:
            final.append(
                {
                    "field_label": f["field_label"],
                    "type": f["type"],
                    "answer": _fallback_form_answer(f, profile=profile),
                }
            )

    return jsonify({"fields": final, "language": language, "llm": bool(answers)})


# ── Interview question answer ───────────────────────────────────────────


_INTERVIEW_ANSWER_SYSTEM = (
    "You are an expert career coach. You write tailored, specific answers "
    "to job interview questions, grounded only in the candidate facts "
    "provided. You never invent jobs, achievements, or skills. You match "
    "the language requested."
)

_INTERVIEW_ANSWER_USER = """Answer the interview question below in 3-5 sentences.

Hard rules:
- 3-5 sentences, no more
- Mention something SPECIFIC about the company (mission, product, growth, market) drawn from the job description
- Align the answer with the candidate's real experience and skills
- Avoid generic phrases like "I am passionate", "great opportunity", "perfect fit"
- No preamble, no markdown, return only the final answer
- Language: {language}

Question: {question}

Company: {company}
Role: {job_title}
Job Description (truncated):
{job_description}

Candidate facts (only use these):
- Name: {name}
- Recent role: {recent_role}
- Skills: {skills}
- Summary: {summary}
"""


def _fallback_interview_answer(
    *,
    question: str,
    company: str,
    job_title: str,
    skills: list[str],
    recent_role: str,
    language: str,
) -> str:
    skills_phrase = ", ".join(skills[:3]) if skills else ""
    if language == "ar":
        return (
            f"ما يجذبني إلى {company} هو أنها تعمل على مشكلات حقيقية في مجالها وتبني "
            f"منتجات يستخدمها الناس فعلاً. خلفيتي {('كـ' + recent_role + ' ') if recent_role else ''}"
            f"تعتمد بشكل مباشر على {skills_phrase or 'المهارات التي يطلبها هذا الدور'}, "
            f"وهي القاعدة التي يقوم عليها دور {job_title}. أبحث عن فريق يقيس النتائج بدلاً من المخرجات الشكلية، "
            f"وهذا ما لمسته في طريقة عرض {company} لفرصها. أرى نفسي قادراً على المساهمة من اليوم الأول "
            "وتسليم تأثير قابل للقياس بسرعة."
        )
    return (
        f"What draws me to {company} is that you're solving real problems in your space "
        f"and building products that people actually rely on. My background "
        f"{('as ' + recent_role + ' ') if recent_role else ''}is built directly on "
        f"{skills_phrase or 'the stack this role calls for'}, which is exactly what the "
        f"{job_title} role centers on. I look for teams that measure outcomes instead of "
        f"output, and that came through clearly in how {company} frames this role. "
        "I'd come in ready to contribute from day one and ship measurable impact early."
    )


@generate_bp.post("/api/interview-answer")
def interview_answer():
    """Generate a tailored answer to a single interview question."""
    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    user_id = data.get("user_id")
    job_id = data.get("job_id")
    resume_id = data.get("resume_id")
    language = str(data.get("language") or "en").lower()

    if not question:
        return jsonify({"error": "question is required"}), 400
    if not user_id or not job_id:
        return jsonify({"error": "user_id and job_id are required"}), 400

    user = fetch_user(str(user_id))
    job = fetch_job(str(job_id))
    if not user or not job:
        return jsonify({"error": "User or job not found"}), 404

    resume = fetch_resume(str(resume_id)) if resume_id else None
    parsed_resume = _resume_payload(resume)

    name = user.get("name") or "Applicant"
    skills = parsed_resume.get("skills") or []
    summary = (parsed_resume.get("summary") or "").strip()
    recent_role = ""
    for item in parsed_resume.get("experience") or []:
        if isinstance(item, dict):
            t = (item.get("title") or "").strip()
            c = (item.get("company") or "").strip()
            if t and c:
                recent_role = f"{t} at {c}"
                break
            if t:
                recent_role = t
                break

    company = job.get("company") or "the company"
    job_title = job.get("title") or "this role"
    job_description = (job.get("description") or "")[:2500]

    client = get_llm_client()
    answer: str | None = None
    if client.is_available:
        prompt = _INTERVIEW_ANSWER_USER.format(
            language="Arabic" if language == "ar" else "English",
            question=question,
            company=company,
            job_title=job_title,
            job_description=job_description or "(not provided)",
            name=name,
            recent_role=recent_role or "(none listed)",
            skills=", ".join(skills[:10]) or "(none listed)",
            summary=summary or "(none)",
        )
        try:
            content = client.chat(
                messages=[
                    {"role": "system", "content": _INTERVIEW_ANSWER_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=400,
                temperature=0.5,
            )
            if content:
                answer = re.sub(r"^```[a-zA-Z]*\n?|\n?```$", "", content.strip().strip("`")).strip()
        except Exception as exc:  # noqa: BLE001
            logger.warning("interview_answer LLM failed: %s", exc)

    if not answer:
        answer = _fallback_interview_answer(
            question=question,
            company=company,
            job_title=job_title,
            skills=skills,
            recent_role=recent_role,
            language=language,
        )
        return jsonify({"question": question, "answer": answer, "language": language, "llm": False})

    return jsonify({"question": question, "answer": answer, "language": language, "llm": True})


# ── ATS review (rich, recruiter-style) ──────────────────────────────────


_ATS_REVIEW_SYSTEM = (
    "You are an expert ATS (Applicant Tracking System) optimizer and senior "
    "technical recruiter. You produce strict, structured JSON reports that "
    "compare a resume against a job description. You never invent skills or "
    "experience that are not in the resume. You match the language requested."
)

_ATS_REVIEW_USER = """Review the resume against the job description and return a STRICT JSON report.

Rules:
- Score the ATS compatibility 0-100 (integer)
- Extract 8-15 important keywords from the JD; for each, classify as "present", "missing", or "weak" based on the resume
- Issues: bullet list of formatting / metric / weak-verb / redundancy / parsing-risk problems (5-10 items)
- Section feedback: short paragraph for each of header / summary / experience / skills / education
- Rewrites: 2-3 BEFORE/AFTER bullet rewrites with metrics + strong action verbs, plus an optimized summary
- Tips: 3-6 ATS optimization tips (keyword density, structure, formatting)
- Verdict: one of "yes" | "maybe" | "no", and the top 3 fixes ranked
- Language: {language}

Job Description (truncated):
{job_description}

Resume (parsed JSON, truncated):
{resume_json}

Return ONLY this exact JSON shape with no preamble, no markdown, no code fences:
{{
  "score": 0,
  "keywords": {{
    "present": ["..."],
    "missing": ["..."],
    "weak": ["..."]
  }},
  "issues": ["..."],
  "sections": {{
    "header": "...",
    "summary": "...",
    "experience": "...",
    "skills": "...",
    "education": "..."
  }},
  "rewrites": {{
    "bullets": [
      {{"before": "...", "after": "..."}}
    ],
    "summary": "..."
  }},
  "tips": ["..."],
  "verdict": "maybe",
  "top_fixes": ["...", "...", "..."]
}}
"""


def _fallback_ats_review(parsed_resume: dict, raw_text: str, job: dict, language: str) -> dict:
    """Best-effort fallback when LLM is unavailable. Wraps the existing pipeline."""
    base = ATSCheckerPipeline().check(parsed_resume, raw_text=raw_text)

    jd_text = (job.get("description") or "").lower()
    resume_skills = [s.lower() for s in (parsed_resume.get("skills") or [])]
    jd_words = re.findall(r"[a-zA-Z][a-zA-Z+#\.]{2,}", jd_text)
    seen: set[str] = set()
    candidates: list[str] = []
    for w in jd_words:
        wl = w.lower()
        if wl in {"the", "and", "for", "with", "you", "our", "are", "this", "that", "will", "have", "from"}:
            continue
        if wl not in seen:
            seen.add(wl)
            candidates.append(w)
    keywords = candidates[:12]
    present = [k for k in keywords if k.lower() in resume_skills or k.lower() in (raw_text or "").lower()]
    missing = [k for k in keywords if k not in present]

    score = int(base.get("ats_score") or base.get("score") or 60)
    return {
        "score": score,
        "keywords": {"present": present, "missing": missing, "weak": []},
        "issues": [c.get("message", "") for c in (base.get("checks") or []) if c.get("status") != "pass"][:8]
        or ["Add quantifiable metrics to bullet points.", "Use stronger action verbs."],
        "sections": {
            "header": "Verify name, email, phone, and LinkedIn are at the top in plain text.",
            "summary": "Tighten the summary to 2-3 lines that mirror the job title.",
            "experience": "Lead each bullet with an action verb and end with a measurable result.",
            "skills": "Group skills by category and align with the JD's terminology.",
            "education": "Keep degree, institution, and graduation year in plain lines (no tables).",
        },
        "rewrites": {
            "bullets": [
                {
                    "before": "Worked on backend services.",
                    "after": "Built and shipped 6 backend microservices in Node.js, cutting p95 latency by 38%.",
                },
                {
                    "before": "Helped the team with code reviews.",
                    "after": "Reviewed 200+ pull requests across 4 services, reducing post-release bugs by 22%.",
                },
            ],
            "summary": (
                f"{(parsed_resume.get('name') or 'Engineer')} — engineer focused on shipping measurable outcomes. "
                f"Day-to-day work centers on {', '.join((parsed_resume.get('skills') or [])[:4]) or 'modern tooling'}."
            ),
        },
        "tips": [
            "Mirror the JD's exact phrasing for primary keywords.",
            "Avoid tables, columns, headers, footers, and icons that ATS parsers drop.",
            "Use one column, plain text, standard section names (Experience, Skills, Education).",
            "Aim for 1-2 mentions of each top JD keyword in the resume body.",
        ],
        "verdict": "maybe" if score >= 60 else "no",
        "top_fixes": [
            "Add metrics to every bullet (numbers, percentages, time saved).",
            "Replace weak verbs (helped/worked on) with strong action verbs.",
            "Mirror the JD's primary keywords in the skills + experience sections.",
        ],
    }


def _truncate_resume_for_prompt(parsed: dict, max_chars: int = 4000) -> str:
    """Serialize parsed resume to JSON, truncating long arrays for prompt size."""
    slim = {
        "name": parsed.get("name"),
        "summary": (parsed.get("summary") or "")[:600],
        "skills": (parsed.get("skills") or [])[:30],
        "languages": (parsed.get("languages") or [])[:10],
        "experience": [
            {
                "title": (e.get("title") or "")[:120] if isinstance(e, dict) else "",
                "company": (e.get("company") or "")[:120] if isinstance(e, dict) else "",
                "description": (e.get("description") or "")[:500] if isinstance(e, dict) else str(e)[:500],
            }
            for e in (parsed.get("experience") or [])[:6]
        ],
        "education": [
            {
                "degree": (ed.get("degree") or "")[:120] if isinstance(ed, dict) else str(ed)[:120],
                "institution": (ed.get("institution") or "")[:120] if isinstance(ed, dict) else "",
            }
            for ed in (parsed.get("education") or [])[:4]
        ],
    }
    text = json.dumps(slim, ensure_ascii=False)
    return text[:max_chars]


@generate_bp.post("/api/ats-review")
def ats_review():
    """Generate a recruiter-style ATS review of a resume against a job description."""
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    job_id = data.get("job_id")
    resume_id = data.get("resume_id")
    language = str(data.get("language") or "en").lower()

    if not user_id or not job_id or not resume_id:
        return jsonify({"error": "user_id, job_id, and resume_id are required"}), 400

    user = fetch_user(str(user_id))
    job = fetch_job(str(job_id))
    resume = fetch_resume(str(resume_id))
    if not user or not job or not resume:
        return jsonify({"error": "User, job, or resume not found"}), 404

    parsed_resume = _resume_payload(resume)
    if not parsed_resume:
        return jsonify({"error": "Resume must be parsed before running an ATS review"}), 400

    raw_text = resume.get("raw_text") or ""
    job_description = (job.get("description") or "")[:3000]

    client = get_llm_client()
    review: dict | None = None
    if client.is_available:
        prompt = _ATS_REVIEW_USER.format(
            language="Arabic" if language == "ar" else "English",
            job_description=job_description or "(not provided)",
            resume_json=_truncate_resume_for_prompt(parsed_resume),
        )
        try:
            content = client.chat(
                messages=[
                    {"role": "system", "content": _ATS_REVIEW_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=1800,
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            if content:
                cleaned = content.strip().strip("`")
                if cleaned.startswith("```"):
                    cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
                    cleaned = re.sub(r"\n?```$", "", cleaned)
                try:
                    review = json.loads(cleaned)
                except json.JSONDecodeError as exc:
                    logger.warning("ats_review: LLM returned non-JSON: %s | %s", exc, cleaned[:200])
        except Exception as exc:  # noqa: BLE001
            logger.warning("ats_review LLM failed: %s", exc)

    if not isinstance(review, dict) or "score" not in review:
        review = _fallback_ats_review(parsed_resume, raw_text, dict(job), language)
        return jsonify(
            {
                **review,
                "language": language,
                "llm": False,
                "job": {"id": str(job.get("id")), "title": job.get("title"), "company": job.get("company")},
            }
        )

    return jsonify(
        {
            **review,
            "language": language,
            "llm": True,
            "job": {"id": str(job.get("id")), "title": job.get("title"), "company": job.get("company")},
        }
    )


# ── Auto-apply decision (9th agent) ─────────────────────────────────────


def _hydrate_user_profile(user_id: str | None, resume_id: str | None) -> dict:
    """Build a structured profile from DB rows when the client sends only IDs."""
    profile: dict = {}
    if user_id:
        user = fetch_user(str(user_id))
        if user:
            profile["name"] = user.get("name")
            profile["location"] = " ".join(
                filter(None, [user.get("city"), user.get("country")])
            ) or None
        db = get_db()
        prefs = db.fetch_one(
            """
            SELECT target_titles, preferred_locations, min_salary, work_type, industries
            FROM user_preferences
            WHERE user_id = %s
            """,
            (str(user_id),),
        ) or {}
        profile["preferred_titles"] = prefs.get("target_titles") or []
        profile["preferred_locations"] = prefs.get("preferred_locations") or []
        profile["min_salary"] = prefs.get("min_salary")
        profile["work_type"] = prefs.get("work_type")
        profile["industries"] = prefs.get("industries") or []

    if resume_id:
        resume = fetch_resume(str(resume_id))
        parsed = _resume_payload(resume)
        if parsed:
            profile["skills"] = parsed.get("skills") or []
            profile["summary"] = parsed.get("summary")
            exp = parsed.get("experience") or []
            profile["experience"] = exp
            # Rough years-of-experience count: number of distinct roles
            profile.setdefault("experience_years", len(exp) if isinstance(exp, list) else None)
    return profile


def _hydrate_job(job_id: str | None) -> dict:
    if not job_id:
        return {}
    job = fetch_job(str(job_id))
    if not job:
        return {}
    return {
        "id": str(job.get("id")),
        "title": job.get("title"),
        "company": job.get("company"),
        "location": job.get("location"),
        "description": job.get("description"),
        "salary": job.get("salary_text"),
        "employment_type": job.get("employment_type"),
    }


@generate_bp.post("/api/auto-apply-decision")
def auto_apply_decision():
    """Decide APPLY / SKIP / REVIEW for a (user, job, score, rules) tuple."""
    data = request.get_json(silent=True) or {}

    language = str(data.get("language") or "en").lower()
    user_id = data.get("user_id")
    job_id = data.get("job_id")
    resume_id = data.get("resume_id")

    # Inline payloads take precedence; DB hydrates any gaps.
    user_profile = data.get("user_profile") or {}
    if not user_profile and (user_id or resume_id):
        user_profile = _hydrate_user_profile(user_id, resume_id)

    job = data.get("job") or {}
    if not job and job_id:
        job = _hydrate_job(job_id)

    rules = data.get("rules") or {}
    match_score = data.get("match_score")

    if not user_profile:
        return jsonify({"error": "user_profile (or user_id) is required"}), 400
    if not job:
        return jsonify({"error": "job (or job_id) is required"}), 400
    if match_score is None:
        return jsonify({"error": "match_score is required"}), 400

    try:
        score_val = float(match_score)
    except (TypeError, ValueError):
        return jsonify({"error": "match_score must be numeric"}), 400

    result = AutoApplyDecisionPipeline().decide(
        user_profile=user_profile,
        job=job,
        match_score=score_val,
        rules=rules,
        language=language,
    )
    return jsonify({**result, "language": language})


# ── Apply pack (10th agent, orchestrator) ───────────────────────────────


@generate_bp.post("/api/apply-pack")
def apply_pack():
    """Assemble a full apply pack: CV highlights, match points, answers, cover letter."""
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    job_id = data.get("job_id")
    resume_id = data.get("resume_id")
    language = str(data.get("language") or "en").lower()

    if not user_id or not job_id or not resume_id:
        return jsonify({"error": "user_id, job_id, and resume_id are required"}), 400

    user = fetch_user(str(user_id))
    job = fetch_job(str(job_id))
    resume = fetch_resume(str(resume_id))

    if not user or not job or not resume:
        return jsonify({"error": "User, job, or resume not found"}), 404

    parsed_resume = _resume_payload(resume)
    if not parsed_resume:
        return jsonify({"error": "Resume must be parsed before generating an apply pack"}), 400

    result = ApplyPackPipeline().run(
        user=dict(user),
        parsed_resume=parsed_resume,
        job=dict(job),
        language=language,
    )
    return jsonify(result)
