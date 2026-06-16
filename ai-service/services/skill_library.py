"""Canonical skill library used for zero-shot skill extraction.

Each entry is the preferred display form. Matching is performed case-insensitively
and after Arabic normalisation.
"""

from __future__ import annotations

# ── Programming languages ────────────────────────────────────────────────
_LANGUAGES = [
    "Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "Go",
    "Rust", "Ruby", "PHP", "Swift", "Kotlin", "Scala", "R", "MATLAB",
    "Objective-C", "Dart", "Perl", "Shell scripting", "Bash", "PowerShell",
    "SQL", "HTML", "CSS",
]

# ── Frontend ─────────────────────────────────────────────────────────────
_FRONTEND = [
    "React", "Next.js", "Vue.js", "Nuxt.js", "Angular", "Svelte", "SolidJS",
    "Redux", "Zustand", "MobX", "TanStack Query", "jQuery",
    "Tailwind CSS", "Sass", "Bootstrap", "Material UI", "Chakra UI",
    "Webpack", "Vite", "Rollup", "Storybook", "Three.js", "D3.js",
    "Progressive Web Apps", "Web Components", "Responsive Design",
]

# ── Backend & frameworks ─────────────────────────────────────────────────
_BACKEND = [
    "Node.js", "Express.js", "NestJS", "Fastify", "Django", "Flask",
    "FastAPI", "Spring Boot", "Spring Framework", "Laravel", "Symfony",
    "Ruby on Rails", "ASP.NET", ".NET Core", "Phoenix", "Gin", "Fiber",
    "GraphQL", "REST API", "gRPC", "WebSockets", "Microservices",
    "Serverless", "Event-driven architecture", "Domain-driven design",
    "Distributed systems", "System design", "API design", "OAuth",
    "JWT authentication", "WebRTC",
]

# ── Mobile ───────────────────────────────────────────────────────────────
_MOBILE = [
    "iOS development", "Android development", "React Native", "Flutter",
    "SwiftUI", "Jetpack Compose", "Xamarin", "Ionic", "Expo",
]

# ── Databases ────────────────────────────────────────────────────────────
_DATABASES = [
    "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch",
    "Cassandra", "DynamoDB", "SQLite", "Neo4j", "Oracle Database",
    "Microsoft SQL Server", "MariaDB", "CouchDB", "InfluxDB", "TimescaleDB",
    "Supabase", "Firebase Firestore", "pgvector", "Pinecone", "Weaviate",
    "Qdrant", "Database design", "Query optimization", "Database indexing",
]

# ── Cloud & DevOps ───────────────────────────────────────────────────────
_CLOUD = [
    "AWS", "Amazon Web Services", "Microsoft Azure", "Google Cloud Platform",
    "AWS Lambda", "Amazon S3", "Amazon EC2", "Amazon RDS", "Amazon DynamoDB",
    "AWS CloudFront", "Amazon EKS", "Amazon ECS", "Amazon SageMaker",
    "Azure Functions", "Azure DevOps", "Azure Kubernetes Service",
    "Google Kubernetes Engine", "Google BigQuery", "Google Cloud Run",
    "Vercel", "Netlify", "Heroku", "Cloudflare", "Firebase", "Railway",
    "Docker", "Kubernetes", "Helm", "Istio", "Terraform", "Ansible",
    "Pulumi", "Packer", "Vagrant", "CI/CD", "Jenkins", "GitHub Actions",
    "GitLab CI", "CircleCI", "Travis CI", "ArgoCD", "Cloud architecture",
    "Infrastructure as code", "Site Reliability Engineering",
    "Load balancing", "Auto scaling", "CDN",
]

# ── Observability & security ─────────────────────────────────────────────
_OPS_SECURITY = [
    "Prometheus", "Grafana", "Datadog", "New Relic", "Sentry", "Splunk",
    "ELK Stack", "OpenTelemetry", "Nginx", "Apache", "HAProxy", "Envoy",
    "Linux administration", "Networking", "TCP/IP", "DNS",
    "Cybersecurity", "Penetration testing", "OWASP", "SIEM",
    "Vulnerability assessment", "Incident response", "Encryption",
    "PKI", "SSO", "SAML", "Zero trust", "ISO 27001", "SOC 2", "GDPR",
    "Identity and access management", "Network security",
]

# ── Data, ML, AI ─────────────────────────────────────────────────────────
_DATA_ML = [
    "Machine Learning", "Deep Learning", "Neural Networks",
    "Natural Language Processing", "Computer Vision",
    "Reinforcement Learning", "Generative AI", "Large Language Models",
    "Prompt engineering", "LangChain", "LlamaIndex", "Hugging Face",
    "Transformers", "Sentence Transformers", "Vector embeddings",
    "Retrieval Augmented Generation", "Fine-tuning", "OpenAI API",
    "Anthropic API", "TensorFlow", "PyTorch", "Keras", "scikit-learn",
    "XGBoost", "LightGBM", "pandas", "NumPy", "SciPy", "Matplotlib",
    "Seaborn", "Plotly", "Jupyter Notebook", "Data analysis",
    "Data visualization", "Statistical analysis", "A/B testing",
    "Feature engineering", "Model deployment", "MLOps",
    "Experiment tracking", "MLflow", "Weights & Biases",
    "ETL", "Data warehousing", "Data modeling", "Data engineering",
    "Snowflake", "Databricks", "Apache Airflow", "dbt", "Apache Spark",
    "Apache Kafka", "Apache Hadoop", "Apache Hive", "Apache Beam",
    "Tableau", "Power BI", "Looker", "Qlik", "Google BigQuery",
    "Amazon Redshift", "Presto", "Trino",
]

# ── Testing ──────────────────────────────────────────────────────────────
_TESTING = [
    "Unit testing", "Integration testing", "End-to-end testing",
    "Test-driven development", "Behavior-driven development",
    "Selenium", "Cypress", "Playwright", "Puppeteer", "Jest", "Vitest",
    "Mocha", "Pytest", "JUnit", "TestNG", "RSpec", "Postman",
    "Load testing", "Performance testing", "Chaos engineering",
]

# ── Design / UX ──────────────────────────────────────────────────────────
_DESIGN = [
    "Figma", "Sketch", "Adobe XD", "Adobe Photoshop", "Adobe Illustrator",
    "Adobe InDesign", "Adobe Premiere Pro", "Adobe After Effects",
    "InVision", "Zeplin", "Framer", "Canva", "Blender", "Cinema 4D",
    "UI design", "UX design", "User research", "Wireframing",
    "Prototyping", "User testing", "Design systems", "Accessibility",
    "Interaction design", "Motion design", "Typography",
    "Visual design", "Information architecture",
]

# ── Product, project management & business ──────────────────────────────
_PM_BUSINESS = [
    "Project management", "Product management", "Program management",
    "Agile", "Scrum", "Kanban", "Lean", "Six Sigma", "PMP",
    "Jira", "Confluence", "Trello", "Asana", "Monday.com", "Notion",
    "ClickUp", "Linear", "Roadmapping", "Stakeholder management",
    "Risk management", "Budget management", "Strategic planning",
    "Business analysis", "Requirements gathering", "Process improvement",
    "Change management", "Vendor management", "Cross-functional collaboration",
    "OKRs", "KPIs", "Product discovery", "Product strategy",
]

# ── Marketing / sales ────────────────────────────────────────────────────
_MARKETING = [
    "Digital marketing", "SEO", "SEM", "Google Ads", "Meta Ads",
    "Social media marketing", "Content marketing", "Email marketing",
    "Marketing automation", "HubSpot", "Salesforce", "Mailchimp",
    "CRM", "Lead generation", "Copywriting", "Brand management",
    "Market research", "Google Analytics", "Conversion rate optimization",
    "Public relations", "Influencer marketing", "Growth marketing",
    "Sales strategy", "B2B sales", "Account management",
]

# ── Finance / accounting ─────────────────────────────────────────────────
_FINANCE = [
    "Financial analysis", "Financial modeling", "Accounting", "Bookkeeping",
    "QuickBooks", "SAP", "Oracle Financials", "Microsoft Excel",
    "VBA", "Power Query", "Forecasting", "Budgeting", "Auditing",
    "Taxation", "IFRS", "US GAAP", "SOX compliance", "Financial reporting",
    "Investment analysis", "Risk analysis",
]

# ── Languages & soft skills ──────────────────────────────────────────────
_SOFT_SKILLS = [
    "Leadership", "Communication", "Teamwork", "Problem solving",
    "Critical thinking", "Time management", "Negotiation",
    "Presentation skills", "Public speaking", "Mentoring", "Coaching",
    "Technical writing", "Customer service",
]

_SPOKEN_LANGUAGES = [
    "Arabic", "English", "French", "Spanish", "German",
    "Mandarin Chinese", "Japanese", "Turkish",
]

# ── Arabic canonical skills (for Arabic-first resumes) ───────────────────
_ARABIC_SKILLS = [
    "البرمجة", "تطوير البرمجيات", "تحليل البيانات", "علم البيانات",
    "تعلم الآلة", "الذكاء الاصطناعي", "تطوير الويب", "تطوير تطبيقات الجوال",
    "إدارة قواعد البيانات", "الحوسبة السحابية", "أمن المعلومات",
    "الشبكات", "إدارة المشاريع", "إدارة المنتجات", "التسويق الرقمي",
    "التسويق الإلكتروني", "وسائل التواصل الاجتماعي", "تحسين محركات البحث",
    "كتابة المحتوى", "المبيعات", "خدمة العملاء", "المحاسبة",
    "التحليل المالي", "الموارد البشرية", "التصميم الجرافيكي",
    "تصميم تجربة المستخدم", "تصميم واجهة المستخدم", "التحرير",
    "الترجمة", "التدريس", "القيادة", "التواصل", "العمل الجماعي",
    "حل المشكلات", "إدارة الوقت", "التفاوض", "العرض والتقديم",
    "الإنجليزية", "العربية",
]


def build_library() -> list[str]:
    """Build the full de-duplicated skill library."""
    all_skills: list[str] = []
    seen: set[str] = set()
    groups = [
        _LANGUAGES, _FRONTEND, _BACKEND, _MOBILE, _DATABASES, _CLOUD,
        _OPS_SECURITY, _DATA_ML, _TESTING, _DESIGN, _PM_BUSINESS,
        _MARKETING, _FINANCE, _SOFT_SKILLS, _SPOKEN_LANGUAGES,
        _ARABIC_SKILLS,
    ]
    for group in groups:
        for skill in group:
            key = skill.lower().strip()
            if key and key not in seen:
                seen.add(key)
                all_skills.append(skill)
    return all_skills


SKILL_LIBRARY: list[str] = build_library()
