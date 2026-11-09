# Smart Academic Advisor — Team B Backend

Backend foundation and Academic Core for the AIDM Smart Academic Advisor:
**Node.js · Express.js · TypeScript · MySQL · Prisma ORM · JWT · Zod · bcrypt · Swagger · Jest**

> Academic regulations are **configurable database records** (the `academic_rules` table),
> never hard-coded. Anything not yet confirmed by the official regulation is seeded as a
> clearly flagged rule (`requiresConfirmation = true`) — see `docs/MISSING_INFO.md`.

## Module map

| Module | Responsibility |
|---|---|
| `auth` | Login / register / refresh (rotation) / logout / me (JWT + bcrypt) |
| `students` | Profiles, academic summary, GPA report, roster data supply |
| `courses` | Catalog, prerequisites, availability per semester |
| `semesters` | Academic years and terms |
| `registrations` | Eligibility-gated registration |
| `rules` | Editable, versioned academic rules (grading scale, limits, policies) |
| `gpa` | Pure GPA math: semester + cumulative, policy-aware retakes |
| `eligibility` | Pure rule-based academic decision engine (returns structured verdicts) |
| `progress` | Degree progress vs program requirements |
| `recommendations` | Post-eligibility ranked suggestions |
| `admin` | Controlled CSV student import, advisor reassignment, audit logs |

Middleware: `auth` (JWT), `authorize` (RBAC), `validate` (Zod), `errorHandler`,
`rateLimit` (global + auth), request logging.

## Quick start

### Prerequisites
- Node.js 20+ and npm
- MySQL 8 (or the dev compose below)

### 1) Database (dev)
```bash
docker compose -f docker-compose.dev.yml up -d   # MySQL on :3306
```

### 2) Environment
```bash
cp .env.example .env
# edit DATABASE_URL + JWT secrets (>= 32 chars)
```

### 3) Database + seed
```bash
npm run db:push     # apply schema
npm run db:seed     # idempotent demonstration records
```

### 4) Run
```bash
npm run dev     # tsx watch (development)
npm run build   # tsc → dist
npm start       # production (node dist/server.js)
```

API docs: `http://localhost:4000/api/docs` (Swagger UI, non-production)
Health: `GET /health/live`, `GET /health/ready`

## Seed accounts (identifiable demo records)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@bua.edu.eg` | `ChangeMe!2026` |
| Advisor | `advisor1@aidm.bua.edu.eg` | `ChangeMe!2026` |
| Advisor | `advisor2@aidm.bua.edu.eg` | `ChangeMe!2026` |
| Student | `student1@aidm.bua.edu.eg` … `student6@aidm.bua.edu.eg` | `ChangeMe!2026` |

Student 1 ships with passed records (CS101/CS102/MA101) in the first semester
so GPA/progress can be verified immediately.

## API (selected)

- `POST /api/auth/login` · `POST /api/auth/register` · `POST /api/auth/refresh` · `POST /api/auth/logout` · `GET /api/auth/me`
- `GET /api/students/:id/profile` · `GET /api/students/:id/academic-records`
- `GET /api/students/:id/gpa` (+ `/gpa/history`) · `GET /api/students/:id/progress`
- `GET /api/courses` · `GET /api/courses/:id` · `GET /api/semesters/:id/courses`
- `POST /api/eligibility/check` · `POST /api/eligibility/check-bulk`
- `GET /api/academic-rules` · `POST /api/academic-rules` (admin)
- `GET /api/students/:id/registrations` · `POST /api/registrations`
- `GET /api/students/:id/recommendations`
- `POST /api/admin/students/import` · `PATCH /api/admin/students/:id/advisor` · `GET /api/admin/audit-logs`

Authorization: Bearer JWT required on all routes except `/health/*` and the
auth routes. `ADMIN` may access everything; `ADVISOR` reads students/progress;
`STUDENT` reads only their own records (ownership handled by middleware +
services).

## Eligibility verdict shape

```json
{
  "eligible": false,
  "courseCode": "CS301",
  "status": "NOT_ELIGIBLE",
  "reasons": [
    { "rule": "PREREQUISITE_REQUIRED", "message": "Prerequisite course 1 must be passed before registering for CS301.", "severity": "BLOCKING" }
  ],
  "missingPrerequisites": ["1"],
  "failedPrerequisites": [],
  "recommendations": ["Complete prerequisite course 1 successfully before registering for CS301."],
  "warnings": []
}
```

The engine evaluates **all** applicable rules, not just the first failure.

## Tests

```bash
npm test            # Jest: GPA, engine, auth, API guards, validation (no DB needed)
npm run typecheck   # strict TypeScript
```

## Docs

- `docs/ANALYSIS.md` — existing-project analysis + architecture + roadmap (all 9 phases)
- `docs/MISSING_INFO.md` — academic information awaiting official confirmation
- `docs/ERD.md` — entity-relationship diagram (Mermaid) and key constraints
- `prisma/schema.prisma` — source of truth for the schema
