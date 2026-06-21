# 06 — Deploy

The app runs locally with `npm run dev`. To make it reachable from your phone /
any device, deploy to **Vercel** (the app) on top of your existing **Supabase**
Postgres. ~$0/month on free tiers.

## 1. Prerequisites
- The Mumbai Supabase project (already set up).
- A GitHub repo for `E:\cp-website` (Vercel deploys from Git).
- A Vercel account.

## 2. Switch the DB URL to the hostname (not the pinned IP)
Local dev pins the pooler's IP because of this machine's ISP DNS. **Vercel's DNS
is fine**, so for production use the hostname. In Vercel's env vars set:

```
DATABASE_URL = postgresql://postgres.iwuwlkefjtnkzhsttkwa:<PWD>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true
DIRECT_URL   = postgresql://postgres.iwuwlkefjtnkzhsttkwa:<PWD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require
```
(URL-encode the password's `@` as `%40`.)

## 3. Set all env vars in Vercel (Project → Settings → Environment Variables)
- `DATABASE_URL`, `DIRECT_URL` (above)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `CF_HANDLE`, `ATCODER_HANDLE`
- `COACH_MODE=scaffold`
- **`APP_PASSWORD=<a strong password>`** ← this turns on the login gate. Without
  it the public URL would be open to anyone.

## 4. Statements on Vercel
Codeforces statements are fetched via `curl` (to pass Cloudflare). Vercel's
serverless runtime **may not have curl**, and the fetch falls back to Node
`fetch` which Cloudflare 403s. Two options:
- **Pre-warm the cache locally** (recommended): open the problems you care about
  locally once so `Problem.statementHtml` is cached in the DB; production then
  serves the cached HTML and never needs to fetch. CSES works via plain fetch.
- Or run a small always-on fetcher service later. (Not needed for daily use if
  you pre-warm.)

## 5. Deploy
```
git init && git add -A && git commit -m "CP Academy"
# push to GitHub, then "Import Project" in Vercel → it auto-detects Next.js
```
Build command: `prisma generate && next build` (add `prisma generate` to the
build if Vercel doesn't run it automatically — set `"build": "prisma generate && next build"` in package.json before deploying).

## 6. Known item to resolve before `next build`
Dev logs a Next 16 "Failed to generate static paths" warning for the dynamic
routes. They're `force-dynamic` and serve fine at runtime; confirm `next build`
passes (and if it doesn't, the fix is ensuring those routes opt out of
prerendering — they already declare `export const dynamic = "force-dynamic"`).

## 7. Note on per-device state
Editor code, saved templates, and the coach-prompt clipboard are browser
`localStorage` (per device). Solves, reflections, contests, analytics, authored
problems, and the reference book are all in Postgres (synced everywhere). If you
want code/templates to sync across devices too, that's a follow-up (move them to
DB tables keyed by problem).
