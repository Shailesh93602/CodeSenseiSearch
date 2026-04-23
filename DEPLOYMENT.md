# Deployment runbook

End-to-end instructions to take CodeSenseiSearch from "passes CI in a
private repo" to "live on the internet, recruiter clicks the link, it
works." Total time: ~30 minutes if you already have the accounts.

> Targets the cheapest production-grade stack:
> - **Vercel** for the Next.js frontend (free tier)
> - **Railway** for the NestJS API (free $5/mo credit)
> - **Neon** for Postgres + pgvector (free 0.5 GB tier)
> - **Upstash** for Redis (free 10K commands/day)
> - **Google AI Studio** for Gemini (free 1500 req/min)
>
> Total monthly cost at portfolio-traffic levels: **$0**.

---

## Step 0 — Try it locally first (5 min, optional)

This proves the stack works on your machine before you deploy.

```bash
cd ~/Desktop/Coding/CodeSenseiSearch

# Get a Gemini key (free): https://aistudio.google.com/app/apikey
# Then write it to apps/api/.env (the file is gitignored):
echo "GEMINI_API_KEY=YOUR_KEY_HERE" >> apps/api/.env
echo "JWT_SECRET=$(openssl rand -hex 32)" >> apps/api/.env
echo "DATABASE_URL=postgresql://codesenseisearch:devpassword@localhost:5432/codesenseisearch" >> apps/api/.env

# Start everything (Postgres + Redis + API + web in containers)
docker compose --profile app up -d

# Apply DB migrations
pnpm --filter api db:migrate

# Open http://localhost:3010 — you should see the landing page.
# Open http://localhost:3001/api/docs — Swagger UI for the API.
# Open http://localhost:3001/api/health — should return status: ok
```

If anything fails locally, stop here — production won't work either.
Most common issue: forgot `GEMINI_API_KEY`. Check
`docker compose logs api`.

To reset: `docker compose --profile app down -v` (the `-v` wipes
volumes — DB + Redis state).

---

## Step 1 — Make the GitHub repo public (1 min)

This is the only blocker between code-done and recruiter-can-read-code.

1. Go to https://github.com/Shailesh93602/CodeSenseiSearch/settings
2. Scroll to "Danger Zone" → "Change repository visibility" → "Make public"
3. Type the repo name to confirm

After this:

```bash
# Verify the URL works
curl -I https://github.com/Shailesh93602/CodeSenseiSearch
# Should return 200, not 404.

# Trim it from the portfolio's KNOWN_PRIVATE allowlist
cd ~/Desktop/Coding/portfolio_next
sed -i '' '/CodeSenseiSearch/d' scripts/check-live-urls.mjs
git add scripts/check-live-urls.mjs
git commit -m "chore: CodeSenseiSearch repo is now public"
git push
```

---

## Step 2 — Provision Postgres on Supabase (5 min)

> Either Supabase or Neon works — both give you Postgres 15+ with
> pgvector pre-installed, free. The owner's standing pattern is
> Supabase, so this guide assumes Supabase. Skip to "Neon variant"
> below if you'd prefer that instead.

1. Sign up at https://supabase.com (GitHub auth)
2. Create a new project → pick a region close to the API host
3. Note your project ref (e.g. `telynjuvugerjemmknnz`) and DB password
4. Two connection strings, both required:
   ```
   DATABASE_URL=postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   DIRECT_URL=postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-1-us-east-1.pooler.supabase.com:5432/postgres
   ```
   - `DATABASE_URL` = pooled connection (port 6543, pgbouncer mode) for
     runtime queries.
   - `DIRECT_URL` = unpooled connection (port 5432) for Prisma
     migrations — pgbouncer can't handle prepared statements during
     `prisma migrate deploy`.
   `prisma/schema.prisma` already declares both via `directUrl`.
5. In the Supabase SQL editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

### Neon variant (skip if using Supabase)

1. Sign up at https://neon.tech, create project
2. Single connection string under `DATABASE_URL`; leave `DIRECT_URL`
   unset and Prisma falls back to `DATABASE_URL` for migrations
3. In Neon SQL editor: `CREATE EXTENSION IF NOT EXISTS vector;`

---

## Step 3 — Provision Redis on Upstash (3 min)

1. Sign up at https://upstash.com (GitHub auth)
2. "Create database" → name: `codesensei-redis`, region: same as your
   Postgres region, type: **Regional** (not Global — BullMQ needs full
   RESP), TLS: enabled
3. From the database details page copy the **REDIS URL** — looks like
   `rediss://default:PASSWORD@HOST:6379`. Parse it into the three env
   vars Railway expects:
   ```
   REDIS_HOST=alive-goblin-105184.upstash.io   # the host
   REDIS_PORT=6379
   REDIS_PASSWORD=gQ...gOA                       # the part after default:
   ```

> ioredis connects with TLS automatically when the host is `*.upstash.io`
> — no extra `REDIS_TLS=true` env needed.

---

## Step 4 — Deploy the API to Railway (10 min)

> **Why not Vercel for the API?** Vercel runs NestJS as serverless
> functions. That works for the HTTP request/response surface (search,
> auth, admin endpoints) but **breaks the BullMQ ingestion pipeline**:
> BullMQ workers need a long-running process with a persistent Redis
> connection to listen for jobs. Serverless functions die between
> requests, so workers never run, and the entire ingest → chunk →
> embed pipeline is dead code. Vercel cron functions can't substitute
> because Gemini embedding for a typical repo file routinely takes
> >10s, hitting the Hobby-plan timeout. Use Railway (or Fly.io) for
> the API; use Vercel only for the Next.js frontend in Step 5.


1. Sign up at https://railway.app (GitHub auth)
2. New Project → "Deploy from GitHub repo" → pick `CodeSenseiSearch`
3. Railway will auto-detect the Dockerfile but you need to point it at
   the right one. In the service settings:
   - **Root Directory:** leave blank (the Dockerfile builds from repo root)
   - **Dockerfile Path:** `apps/api/Dockerfile`
   - **Watch Paths:** `apps/api/**`
4. Add environment variables (Settings → Variables → Raw Editor):
   ```env
   NODE_ENV=production
   API_PORT=3001
   DATABASE_URL=postgresql://postgres.<REF>:<PWD>@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
   DIRECT_URL=postgresql://postgres.<REF>:<PWD>@aws-1-us-east-1.pooler.supabase.com:5432/postgres
   REDIS_HOST=alive-goblin-105184.upstash.io   # the host part of your Upstash URL
   REDIS_PORT=6379
   REDIS_PASSWORD=...                            # the part after default: in your Upstash URL
   JWT_SECRET=...                                # openssl rand -hex 32
   GEMINI_API_KEY=...                            # from aistudio.google.com/app/apikey
   FRONTEND_URL=https://codesenseisearch.vercel.app   # update after step 5
   LOG_LEVEL=info
   ```

5. Once deployed, Railway gives you a public URL like
   `https://codesenseisearch-api.up.railway.app`. Save it.
6. Verify the deploy:
   ```bash
   curl https://YOUR-RAILWAY-URL/api/health
   # Expected: { "status": "ok", "components": { "database": { "status": "up", ... } } }
   ```
7. Apply migrations against the live Supabase DB. From your laptop:
   ```bash
   cd ~/Desktop/Coding/CodeSenseiSearch/apps/api
   DATABASE_URL='postgresql://...:6543/postgres?pgbouncer=true' \
     DIRECT_URL='postgresql://...:5432/postgres' \
     pnpm prisma migrate deploy
   ```

---

## Step 5 — Deploy the web to Vercel (5 min)

1. Sign up at https://vercel.com (GitHub auth)
2. "Add New Project" → import the `CodeSenseiSearch` repo
3. **Configure project:**
   - Framework Preset: Next.js (auto-detected)
   - **Root Directory:** `apps/web` ← important
   - Build Command: leave default (`next build`)
   - Install Command: `pnpm install`
4. Environment variables:
   ```env
   NEXT_PUBLIC_API_URL=https://YOUR-RAILWAY-URL/api
   ```
5. Deploy. Vercel gives you a `https://codesensei-search.vercel.app` URL.
6. **Go back to Railway** and update the API's `FRONTEND_URL` env var to
   the Vercel URL — otherwise CORS will block the frontend's API calls.
7. Redeploy the API service so the new env takes effect.

---

## Step 6 — Sanity-check the live deploy (2 min)

```bash
# Frontend renders
curl -I https://YOUR-VERCEL-URL/
# Expected: HTTP/2 200

# API health
curl https://YOUR-RAILWAY-URL/api/health
# Expected: components.database.status: "up", components.redis.status: "up"

# Search endpoint
curl -X POST https://YOUR-RAILWAY-URL/api/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}'
# Expected: { "success": true, "data": { "results": [], "totalResults": 0 } }
# Empty results is fine — corpus isn't seeded yet.
```

---

## Step 6.5 — Wire the keepalive cron (1 min)

Free-tier Supabase auto-pauses after ~7 days of inactivity. Free-tier
Upstash throttles dormant DBs. The repo ships
[`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml)
which hits `/api/health` daily — that single endpoint pings Postgres
+ Redis as part of its check, keeping both warm without needing
direct DB credentials in CI.

One-time setup:

1. https://github.com/Shailesh93602/CodeSenseiSearch/settings/secrets/actions
2. New repository secret:
   - Name: `API_HEALTH_URL`
   - Value: `https://YOUR-RAILWAY-URL/api/health`
3. Trigger it once to confirm:
   ```bash
   gh workflow run keepalive.yml -R Shailesh93602/CodeSenseiSearch
   ```
   Then check Actions → Keepalive — should be green.

The cron runs daily at 09:00 UTC from then on.

---

## Step 7 — Update the portfolio (3 min)

Add the live URLs to the portfolio so the project card has working
"Launch experience" + "Repository" buttons.

```bash
cd ~/Desktop/Coding/portfolio_next
```

Edit `constants/projects.ts` — the CodeSenseiSearch entry:
- Set `live: "https://YOUR-VERCEL-URL"`
- The `github` URL is already correct now that the repo is public.

Also update the description / tags to drop the "Work in Progress" tag
since we're now live.

```bash
git add constants/projects.ts
git commit -m "feat: CodeSenseiSearch is live"
git push
```

The url-health-check workflow will pick up both URLs on its next daily
run; you can trigger it now manually:
```bash
gh workflow run url-health-check.yml -R Shailesh93602/portfolio_next
```

---

## Step 8 — Seed a demo corpus (15-30 min, OPTIONAL but recommended)

Right now the deployed search returns empty results because nothing's
been indexed. Fix this by triggering a one-time ingestion of a small
public repo so a recruiter can immediately see real results.

Option A — manual ingestion via the API (no code change):
```bash
# From your laptop, hit the production ingestion endpoint
# (Replace with the actual endpoint once it exists; today the only
# live ingestion path is via the BullMQ workers triggered by
# /admin/* routes which are auth-gated.)
```

Option B — write a one-shot seed script (~1 hr work, on the TODO as B2):
- Pre-embed a small popular repo (e.g. sindresorhus/type-fest)
- Commit the resulting SQL dump under
  `apps/api/prisma/seed/demo-corpus.sql.gz`
- Add `pnpm demo` script that restores it locally
- For the deployed instance, run the seed once via `railway run`

Both are documented in [TODO.md](TODO.md) as B2.

For now: a recruiter searching the live deploy gets "no results found"
which is honest but underwhelming. The README's "Status — honest
version" callout up top frames that — they know it's WIP.

---

## What the recruiter sees after this is done

1. Click portfolio's CodeSenseiSearch card → opens the project detail page
2. Click "Repository" → public GitHub repo, README explains it
3. Click "Launch Experience" → Vercel-hosted landing page renders
4. Click search → can type a query and it hits the real API
5. (Once Step 8 is done) → real ranked results from a real corpus

---

## Rollback / cleanup

If anything goes wrong:
- **Railway:** Service → Settings → Danger Zone → Remove
- **Vercel:** Project → Settings → Advanced → Delete Project
- **Neon:** Project → Settings → Delete Project
- **Upstash:** Database → Danger Zone → Delete Database
- All four are free-tier services so deleting costs nothing and you can
  start over in minutes.

---

## Estimated total time

| Step | Time |
|---|---|
| 0. Local sanity check | 5 min |
| 1. Repo public | 1 min |
| 2. Neon Postgres | 5 min |
| 3. Upstash Redis | 3 min |
| 4. Railway API | 10 min |
| 5. Vercel web | 5 min |
| 6. Sanity-check live | 2 min |
| 7. Portfolio update | 3 min |
| 8. Seed corpus (optional) | 15-30 min |
| **Total (without seed)** | **~35 min** |
| **Total (with seed)** | **~60 min** |
