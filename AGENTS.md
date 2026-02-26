# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

TimeBack is a Next.js 16 (App Router, React 19, TypeScript 5.9, Tailwind CSS 4) SaaS application for short-form video creators. It includes three modules: **Editor** (video processing with FFmpeg + Silero VAD), **Ideate** (AI script generation via Claude), and **Schedule** (Instagram auto-scheduling). Uses Prisma ORM with PostgreSQL, Clerk for auth, and npm as package manager.

### Required system dependencies

- **PostgreSQL** — must be running for the app to start. Start with `sudo pg_ctlcluster 16 main start`.
- **FFmpeg** — pre-installed in the VM; used for all video processing.

### Environment variables

A `.env` file at the workspace root is required. At minimum:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Real Clerk key needed; placeholder values cause 500 on all routes |
| `CLERK_SECRET_KEY` | Yes | Clerk backend secret |
| `OPENAI_API_KEY` | For Editor/Schedule | Whisper transcription + caption generation |
| `CLAUDE_API_KEY` | For Ideate | Script generation via Anthropic |

### Key gotchas

- **Clerk middleware blocks all routes (including public ones) if the publishable key is invalid.** Even `/api/health` returns 500. You must have a real Clerk publishable key for any page to load.
- **You must use Clerk _development_ keys (prefix `pk_test_` / `sk_test_`) for localhost.** Production keys (prefix `pk_live_` / `sk_live_`) are domain-locked to `timebackvideo.com` and will fail on localhost with "Production Keys are only allowed for domain 'timebackvideo.com'". Get dev keys from the Clerk dashboard by switching to your Development instance.
- **`npm run build` also requires a valid Clerk key** because Next.js prerenders pages during build and Clerk validates the key at that stage.
- The Prisma schema uses `package.json#prisma` config (deprecated in Prisma 7) — warnings are expected.
- `next.config.ts` has `typescript.ignoreBuildErrors: true` — type errors won't block builds.
- Video upload directories (`uploads/`, `processed/`) are auto-created by the app relative to `process.cwd()`.

### Common commands

See `package.json` scripts. Key ones:

- `npm run dev` — start development server (port 3000)
- `npm run lint` — ESLint (pre-existing warnings/errors in codebase are expected)
- `npm run build` — production build (requires valid Clerk key)
- `npm run db:push` — push Prisma schema to database
- `npx prisma generate --schema=./prisma/schema.prisma` — regenerate Prisma client after schema changes

### Database

After PostgreSQL is running, ensure the `timeback` database exists:

```
sudo -u postgres createdb timeback 2>/dev/null || true
```

Then push the schema: `npm run db:push`.
