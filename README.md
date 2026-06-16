# الشغيلي (Al-Shughaily)

> مساعدك الذكي للتوظيف — Arabic-first AI Job Copilot SaaS

A full-stack Arabic-first job assistant that helps users upload CVs, match with jobs using AI, get CV improvement suggestions, generate cover letters, prepare for interviews, and track applications.

## Architecture

```
React (Vite) ──► Express API ──► Flask AI Service ──► Hugging Face
                     │                 │
                     └──► PostgreSQL ◄──┘
                          + pgvector
                             │
                           Redis (queue)
```

- **Frontend** — React + Vite + Tailwind + shadcn/ui + React Router + TanStack Query + Zustand (RTL-first Arabic UI)
- **Backend** — Express.js + TypeScript (auth, business logic, API)
- **AI Service** — Flask + sentence-transformers (8 specialized agents)
- **Database** — PostgreSQL with pgvector for semantic search
- **Queue** — Redis + BullMQ for async parsing/embedding jobs
- **Storage** — S3 / Cloudflare R2 for CV files

## Project Structure

```
shughaily/
├── frontend/          React + Vite + Tailwind app
├── backend/           Express + TypeScript API
├── ai-service/        Flask AI orchestrator + 8 agents
├── database/          schema.sql + seed.sql
├── shared/            Shared types + zod schemas
└── docker-compose.yml
```

## Quick Start

### 1. Environment

```bash
cp .env.example .env
# edit .env as needed
```

### 2. With Docker (recommended)

```bash
docker compose up -d
```

Services will be running at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000/api/v1
- AI Service: http://localhost:5001
- Postgres: localhost:5432
- Redis: localhost:6379

### 3. Without Docker (local dev)

**Database:**
```bash
# requires Postgres 16+ with pgvector extension installed
psql -U postgres -c "CREATE DATABASE shughaily;"
psql -U postgres -d shughaily -f database/schema.sql
psql -U postgres -d shughaily -f database/seed.sql
```

**Backend:**
```bash
cd backend
npm install
npm run dev
```

**AI Service:**
```bash
cd ai-service
pip install -r requirements.txt
python run.py
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## AI Agents

The Flask service orchestrates 8 specialized agents:

1. **Resume Parsing Agent** — PDF/DOCX → structured JSON
2. **Job Understanding Agent** — normalize job descriptions
3. **Matching Agent** — vector + skill overlap scoring
4. **Recommendation Agent** — ranked job feed with Arabic explanations
5. **CV Improvement Agent** — detect weaknesses, rewrite suggestions
6. **Cover Letter Agent** — tailored Arabic/English letters
7. **Interview Prep Agent** — questions + sample answers
8. **Copilot Conversation Agent** — intent classification + delegation

## Brand

- **Name**: الشغيلي
- **Tone**: Practical, honest, supportive. Never flatter, never fabricate skills.
- **Primary**: `#0EA5A4` (teal)
- **Gradient**: `#0EA5A4 → #06B6D4`
- **Typography**: IBM Plex Sans Arabic / Noto Sans Arabic
- **Direction**: RTL-first

## API Endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/v1/auth/register` | Register user |
| POST | `/api/v1/auth/login` | Login |
| GET | `/api/v1/auth/me` | Current user |
| GET | `/api/v1/jobs` | List jobs (paginated, filterable) |
| GET | `/api/v1/jobs/:id` | Job detail |
| GET | `/api/v1/jobs/recommended` | AI-ranked recommendations |
| POST | `/api/v1/resumes/upload` | Upload CV |
| POST | `/api/v1/resumes/:id/parse` | Trigger AI parse |
| GET | `/api/v1/applications` | Application tracker |
| POST | `/api/v1/applications` | Create application |
| POST | `/api/v1/copilot/chat` | Chat with الشغيلي |
| POST | `/api/v1/copilot/cv-feedback` | Get CV improvements |
| POST | `/api/v1/copilot/cover-letter` | Generate cover letter |
| POST | `/api/v1/copilot/interview-prep` | Interview questions |
| GET | `/api/v1/dashboard/stats` | Dashboard counters |
