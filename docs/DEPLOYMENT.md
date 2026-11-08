# النشر (الوضع الحي) — Railway + Supabase

> الفكرة: الفرونت على **Vercel** (الريبو `Front_end-_Smart_Acadmic_ad`)، والباك
> (API + rule-engine) + قاعدة البيانات برى — **Supabase** لقاعدة البيانات و**Railway**
> للـ backend + engine. عندك حسابات Gitea milik sendiri? عادي — أي منصة Docker-based
> تنفع (Render/Fly.io) بشرط: **Postgres مع pgvector** + تشغيل ملفات الـ Dockerfile
> برويتش المصدر.

---

## 1) Supabase — قاعدة البيانات

1. ادخل [supabase.com](https://app.supabase.com) → **New project** (اسم أي، كلمة سر قوية).
2. في **Project Settings → Database** أو **SQL Editor** نفّذ:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   CREATE EXTENSION IF NOT EXISTS citext;
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
   (Supabase فيه pgvector جاهز، وتفعيله من `Database → Extensions` أسرع من SQL.)
3. من **Project Settings → Database → Connection pooling** اختر **Session mode**
   (مهم: الدائمة اتصالات postgres مشتركة) وانسخ الـ **Connection string (URI)**.
   يكون شبه:  
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
4. احتفظ بـ URL ده — هو **الباسورد** اللي بيتربط بيه الـ migrate والـ runtime.

> ملحوظة: الـ migration بيعمل دور `smart_advisor_app` (بكلمة سر `DB_APP_PASSWORD`)
> وبيمنحه صلاحيات — Supabase بيسمح بإنشاء أدوار عادية، فالكلام ده ممكن من SQL
> براوزر أو `psql`. لو الدور ده مش ممكن، استخدم دور `postgres` كـ `DATABASE_URL`
> الافتراضي، لكن الأدوار المنفصلة أنظف.

---

## 2) Railway — الـ backend-api والـ rule-engine

### 2.1 أنشئ مشروع
1. ادخل [railway.app](https://railway.app) → login (GitHub) → **New Project** →
   **Deploy from GitHub repo** → اختر الريبو الـ full-stack
   وليس ريبو الفرونت فقط.
2. لنفس المشروع من **"+ New" → Service** اختار **GitHub Repo** تاني لنفس الريبو
   (نبني خدمتين من نفس الريبو).

### 2.2 الخدمة الأولى: backend-api
- **Settings**: 
  - Build Command: (يترك فاضي — بيستخدم الـ Dockerfile)
  - الـ Dockerfile Path: `backend-api/Dockerfile` — لكن الـ Dockerfile
    مصمم **من جذر الريبو** (`COPY backend-api/...` + `COPY db/` + `COPY regulation-data/`).
  - الشبكة: الـ Dockerfile نفسه يحدد `EXPOSE 4000` — سيب الـ port الافتراضي.
- **Variables** (أضفها بالظبط):
  ```
  NODE_ENV=production
  PORT=4000
  DATABASE_URL=postgresql://smart_advisor_app:<DB_APP_PASSWORD>@<supabase-host>:5432/postgres?sslmode=require
  MIGRATION_DATABASE_URL=postgresql://postgres:<supabase-password>@<supabase-host>:5432/postgres?sslmode=require
  DB_APP_PASSWORD=<32+ حرف عشوائي>
  JWT_ACCESS_SECRET=<32+ حرف عشوائي>
  JWT_REFRESH_PEPPER=<32+ حرف عشوائي>
  JWT_ISSUER=bua-aidm-advisor
  JWT_AUDIENCE=bua-aidm-api
  ACCESS_TOKEN_TTL_SECONDS=900
  REFRESH_TOKEN_TTL_DAYS=7
  ENGINE_URL=http://<rule-engine-railway-url>
  ENGINE_SERVICE_TOKEN=<32+ حرف عشوائي>
  ENGINE_HMAC_SECRET=<32+ حرف عشوائي>
  ENGINE_TIMEOUT_MS=30000
  ALLOWED_EMAIL_DOMAIN=bua.edu.eg        (=> يسبق @aidm.bua.edu.eg و @bua.edu.eg الاتنين)
  CORS_ORIGINS=https://front-end-smart-acadmic-ad.vercel.app
  COOKIE_SECURE=true
  TRUST_PROXY=loopback
  QR_SIGNING_SECRET=<32+ حرف عشوائي>
  APP_BASE_URL=https://front-end-smart-acadmic-ad.vercel.app
  DEMO_PASSWORD=ChangeMe!2026
  SMTP_HOST=<smtp.example.com أو mailhog داخلي>
  SMTP_PORT=1025
  SMTP_FROM=no-reply@aidm.bua.edu.eg
  RUN_MIGRATIONS=true          (عشان الـ migrate يعمل مرة واحدة عند أول deploy)
  RUN_SEED=true
  SEED_DEMO=true
  REGULATION_DATA_DIR=/app/regulation-data
  DB_POOL_MAX=10
  GEMINI_API_KEY=<مفتاحك من Google AI Studio (اختياري — من غيره يشتغل extractive فقط)>
  ```
  > مهم: الـ `DATABASE_URL` لازم يكون الـ **password-encoded** (لو الباسورد فيه رموز
  > زي `@`/`#`/`/` لازم الـ URL-encode).

### 2.3 الخدمة التانية: rule-engine
- **Settings** (نفس الريبو، Dockerfile تاني):
  - الـ Dockerfile Path: `rule-engine/Dockerfile` (يبنى من الجذر برضه)
- **Variables**:
  ```
  APP_ENV=production
  DATABASE_URL=postgresql://smart_advisor_app:<DB_APP_PASSWORD>@<supabase-host>:5432/postgres?sslmode=require
  ENGINE_SERVICE_TOKEN=<نفس الـ token اللي حطيته في backend-api>
  ENGINE_HMAC_SECRET=<نفس الـ hmac>
  REGULATION_DATA_DIR=/app/regulation-data
  POLICY_INGEST_ON_START=true
  RAG_MIN_CONFIDENCE=0.32
  RAG_TOP_K=5
  GEMINI_API_KEY=<نفس المفتاح (اختياري)>
  GEMINI_MODEL=gemini-3.5-flash
  GEMINI_TIMEOUT_SECONDS=18
  RAG_GENERATE=true
  LOG_LEVEL=INFO
  ```
  > الـ engine بيتأكد أن الـ secrets **32 حرف على الأقل** في production —
  > لازم تكون قوّيّة.

### 2.4 الترتيب (مرة واحدة)
1. انشر **backend-api** أولاً — الـ entrypoint هيعمل `migrate:up` + `seed`
   تلقائيًا (هيوجد 37 جدول + البيانات والحسابات).
2. انشر **rule-engine** ثانيًا — هيعمل ingest كل policy chunks (539 chunks)
   وهي-Check `/health`.
3. في Railway انقر على **rule-engine** لنسخ الـ domain العام بتاعه
   (يمشي كده `https://rule-engine-production-xxxx.up.railway.app`) وحطه في
   `ENGINE_URL` في backend-api → **Redeploy** الـ backend-api.

> ملاحظة: دوال الـ `ENGINE_URL` الداخلية لازم تخدم الـ **public URL** بتاع الـ engine
> (لأن الخدمتين منفصلتين على Railway ومش على نفس الشبكة الداخلية — أو ممكن
> تستخدم **private networking** في Railway: `http://rule-engine.railway.internal:8000`
> وهو أسرع وأرخص لو متاح.)

---

## 3) التحقق
```
# Health API
curl https://<backend-railway-domain>/health/ready
# expected: {"status":"ok","checks":{"database":{"ok":true},"engine":{"ok":true,"detail":"chunks=539"}}}

# Login (test account)
curl -X POST https://<backend-railway-domain>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student1@aidm.bua.edu.eg","password":"ChangeMe!2026"}'
```

---

## 4) ربط الفرونت (Vercel) — آخر خطوة

في `vercel.json` الـ rewrite بتاع `/api` بيشاور لـ `<backend-railway-domain>/api`.
عدّل الـ rewrite ده في الريبو `Front_end-_Smart_Acadmic_ad` (فرع `main`) وأرفع
الكوميت — Vercel هيبدأ يعمل deploy جديد فورًا.

```
# مثال الـ vercel.json الجديد:
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://<backend-railway-domain>/api/:path*" },
    { "source": "/health", "destination": "https://<backend-railway-domain>/health" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

> ⚠️ `CORS_ORIGINS` لازم يحتوي الدومين بتاع الفرونت بالظبط — وحاليات الـ access
> token والـ CSRF cookies بتعتمد على الـ rewrite ده.

---

## حسابات الاختبار (بعد ما الـ seed يمشي)

| الدور | الإيميل | كلمة المرور |
|---|---|---|
| Admin | `admin@bua.edu.eg` | `ChangeMe!2026` |
| Advisor | `advisor1@aidm.bua.edu.eg` | `ChangeMe!2026` |
| Advisor | `advisor2@aidm.bua.edu.eg` | `ChangeMe!2026` |
| Student | `student1@aidm.bua.edu.eg` … `student6@aidm.bua.edu.eg` | `ChangeMe!2026` |
