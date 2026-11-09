# Team B — Analysis of the Existing Project (Phase 1)

This document records the analysis performed **before** writing any Team B code, as
required by the project workflow.

## 1. What exists today

| Area | Existing implementation (full-stack repo) | Stack |
|---|---|---|
| Frontend | React + Vite, EN/AR i18n, theming, floating assistant | TypeScript |
| Backend API | Express, JWT access/refresh with rotation, RBAC, rate limiting, Zod validation | Node.js + TypeScript |
| Database | PostgreSQL 18 with pgvector (37 tables) | node-pg-migrate (SQL migrations) |
| Rule engine | Python/FastAPI service with RAG + Gemini generation | Python |
| Tests | Jest (153 backend tests), Vitest (32 frontend), Pytest (94 engine) | — |

## 2. Where the existing code conflicts with the Team B brief

| Requirement (Team B brief) | Existing reality | Decision |
|---|---|---|
| MySQL | PostgreSQL everywhere (compose, Docker, seeds) | Team B backend is implemented standalone exactly per the brief (MySQL + Prisma). The two stacks are **not merged**: this keeps the existing verified full-stack work untouched, per the "do not replace existing functionality" rule. |
| Prisma ORM | node-pg-migrate / raw SQL | Adopted for Team B; the existing repo keeps its tooling. |
| JWT + bcrypt + Zod + Swagger + Jest | Present (JWT/bcrypt/Zod in Express; Swagger missing) | Team B adds Swagger UI at `/api/docs` and the complete Jest suite. |
| Rule-based Academic Engine | Exists in Python (rule-engine) with RAG | Team B also implements a **TypeScript** engine (pure, DB-free) inside the API so rules are evaluated close to data and unit-testable without the external service. Both engines read from `academic_rules` — no hard-coded thresholds. |
| 13 modules listed | Existing modules are coarser (student/advisor/admin/chat) | Team B splits per the brief: auth, students, records, courses, semesters, registrations, prerequisites, rules, GPA, eligibility, progress, recommendations, admin. |

## 3. Proposed Team B architecture (implemented in this repo)

```
teamB-backend/
├── prisma/
│   ├── schema.prisma     # Normalized MySQL schema (enums, FKs, unique constraints)
│   └── seed.ts           # Idempotent demo seed (clearly identified records)
├── src/
│   ├── server.ts         # Bootstrap + graceful shutdown
│   ├── app.ts            # Express app, route table, docs
│   ├── config/env.ts     # Fail-fast env validation (Zod)
│   ├── lib/prisma.ts     # Shared Prisma client
│   ├── utils/apiError.ts # ApiError + helpers
│   ├── middlewares/      # auth (JWT), rbac, validate, errorHandler, rateLimit
│   ├── docs/openapi.ts   # OpenAPI 3.0 specification (Swagger UI)
│   └── modules/
│       ├── auth/         # login · register · refresh (rotation) · logout · me
│       ├── students/     # profile · academic summary · GPA report · CSV import data supply
│       ├── courses/      # catalog + semester availability
│       ├── semesters/
│       ├── registrations/# eligibility-gated registration
│       ├── rules/        # configurable, versioned academic rules
│       ├── gpa/          # pure GPA services (scale + retake policy driven)
│       ├── eligibility/  # pure rule-based academic engine
│       ├── progress/     # degree progress vs program requirements
│       ├── recommendations/ # post-eligibility ranked suggestions
│       └── admin/        # roster import, advisor reassignment, audit logs
└── tests/
    └── *.test.ts         # Jest: GPA, eligibility, auth, API guards, validation
```

Key guarantees:
- **Frontend never touches SQL or the engine directly.** All routes go through this API.
- **Eligibility is deterministic and reproducible**: returns `ELIGIBLE | NOT_ELIGIBLE | UNKNOWN | REVIEW_REQUIRED` with reasons, missing prerequisites, warnings and corrective recommendations — it evaluates ALL applicable rules.
- **Rules are data, not code**: grading scale, retake policy, and credit-limit brackets live in `academic_rules` (seeded with clearly flagged `requiresConfirmation` defaults derived from the official BUA-AIDM regulations). Missing regulations are marked for official confirmation instead of being invented.
- **Missing/conflicting data never guesses**

## 4. Implementation roadmap (9 phases → status)

| # | Phase | Status |
|---|---|---|
| 1 | Analyze existing project + ERD | ✅ This document + ERD |
| 2 | Identify missing academic info | ✅ `docs/MISSING_INFO.md` |
| 3 | Folder structure + schema | ✅ `prisma/schema.prisma` |
| 4 | Auth + database foundation | ✅ modules/auth, migrations via Prisma |
| 5 | Academic data services | ✅ students/gpa/progress/courses/semesters |
| 6 | Academic engine | ✅ modules/eligibility + modules/gpa |
| 7 | REST APIs | ✅ route table in `src/app.ts` |
| 8 | Tests + API documentation | ✅ Jest suite + Swagger at `/api/docs` |
| 9 | Frontend integration readiness | ✅ `/health/*`, JSON contracts, README | 
