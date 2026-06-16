"""CV improvement pipeline - analyse a resume and suggest improvements."""

from __future__ import annotations

from utils.arabic import normalize_arabic


class CVImproverPipeline:
    """Analyse a parsed resume and generate actionable improvement suggestions."""

    # ------------------------------------------------------------------
    # Summary analysis
    # ------------------------------------------------------------------

    @staticmethod
    def analyze_summary(summary: str) -> list[str]:
        """Return suggestions for the personal summary section."""
        suggestions: list[str] = []
        if not summary or not summary.strip():
            suggestions.append("الملخص الشخصي فاضي - أضف ملخص من 3-4 أسطر يوضح خبرتك وهدفك الوظيفي.")
            return suggestions

        word_count = len(summary.split())
        if word_count < 15:
            suggestions.append(
                "الملخص قصير جداً. حاول توضّح خبرتك وأبرز إنجازاتك في 3-4 أسطر."
            )
        elif word_count > 100:
            suggestions.append(
                "الملخص طويل. حاول تختصره في 50-70 كلمة وركّز على أبرز النقاط."
            )

        # Check if it contains quantifiable achievements
        has_numbers = any(c.isdigit() for c in summary)
        if not has_numbers:
            suggestions.append(
                "أضف أرقام وإنجازات محددة. مثلاً: 'أدرت فريق من 10 أشخاص' "
                "أو 'زدت المبيعات 30%'."
            )

        return suggestions

    # ------------------------------------------------------------------
    # Missing keywords
    # ------------------------------------------------------------------

    @staticmethod
    def find_missing_keywords(
        resume_skills: list[str], target_jobs: list[dict]
    ) -> list[str]:
        """Find skills mentioned in target jobs but missing from the resume."""
        resume_norm = {normalize_arabic(s).lower() for s in resume_skills}
        missing: set[str] = set()

        for job in target_jobs:
            job_skills = job.get("extracted_skills", job.get("skills", []))
            for skill in job_skills:
                if normalize_arabic(skill).lower() not in resume_norm:
                    missing.add(skill)

        return sorted(missing)

    # ------------------------------------------------------------------
    # Full suggestions
    # ------------------------------------------------------------------

    def suggest_improvements(
        self,
        parsed_resume: dict,
        target_titles: list[str] | None = None,
        target_jobs: list[dict] | None = None,
    ) -> dict:
        """Generate structured improvement feedback.

        Returns dict with keys: summary_feedback, skills_feedback,
        experience_feedback, general_tips, missing_keywords.
        """
        feedback: dict = {
            "summary_feedback": [],
            "skills_feedback": [],
            "experience_feedback": [],
            "general_tips": [],
            "missing_keywords": [],
        }

        # Summary
        feedback["summary_feedback"] = self.analyze_summary(
            parsed_resume.get("summary", "")
        )

        # Skills
        skills = parsed_resume.get("skills", [])
        if not skills:
            feedback["skills_feedback"].append(
                "ما فيه قسم مهارات واضح. أضف قسم يسرد مهاراتك التقنية والشخصية."
            )
        elif len(skills) < 5:
            feedback["skills_feedback"].append(
                "عدد المهارات قليل. حاول تذكر كل الأدوات والتقنيات اللي تعرفها."
            )
        elif len(skills) > 25:
            feedback["skills_feedback"].append(
                "عدد المهارات كبير جداً. ركّز على أهم 15-20 مهارة مرتبطة بالوظائف المستهدفة."
            )

        # Experience
        experience = parsed_resume.get("experience", [])
        if not experience:
            feedback["experience_feedback"].append(
                "قسم الخبرات فاضي. حتى لو ما عندك خبرة رسمية، اذكر التدريب أو المشاريع الشخصية."
            )
        else:
            # Check for action verbs / quantification
            exp_text = " ".join(experience) if isinstance(experience, list) else str(experience)
            if not any(c.isdigit() for c in exp_text):
                feedback["experience_feedback"].append(
                    "أضف أرقام وإنجازات في قسم الخبرات. مثلاً: 'طوّرت نظام خفّض وقت المعالجة 40%'."
                )

        # Missing keywords for target jobs
        if target_jobs:
            feedback["missing_keywords"] = self.find_missing_keywords(
                skills, target_jobs
            )
            if feedback["missing_keywords"]:
                feedback["skills_feedback"].append(
                    f"مهارات مطلوبة في الوظائف المستهدفة مو موجودة عندك: "
                    f"{', '.join(feedback['missing_keywords'][:10])}"
                )

        # General tips
        feedback["general_tips"] = [
            "تأكد إن السيرة الذاتية ما تتجاوز صفحتين.",
            "استخدم تنسيق واضح وبسيط - بعض أنظمة التوظيف ما تقرأ التنسيق المعقد.",
            "خصص سيرتك الذاتية لكل وظيفة تقدم عليها.",
            "راجع الأخطاء الإملائية - خطأ واحد ممكن يأثر على انطباع صاحب العمل.",
        ]

        if target_titles:
            feedback["general_tips"].append(
                f"ركّز على إبراز خبرتك المتعلقة بـ: {', '.join(target_titles)}"
            )

        return feedback
