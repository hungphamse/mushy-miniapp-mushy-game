# Mushy Level Editor

Standalone owner/editor application for authoring Mushy daily levels.

## First Milestone

This scaffold covers:

- `LE-001`: Vite/React app scaffold.
- `LE-002`: Browser env validation.
- `LE-003`: Supabase browser helper plus server/API helper boundary.
- `LE-004`: Password login/logout/session handling.
- `LE-005`: Owner allowlist gate for the editor UI.
- `LE-006`: Authenticated editor shell with Levels, Assets, and Service Tokens placeholders.

## Local Setup

1. Copy `.env.example` to `.env.local`.
2. Fill in the editor-owned Supabase project URL and publishable/anon key.
3. Add your Supabase Auth user ID or email to the owner allowlist.
4. Run:

```powershell
npm install
npm run dev
```

## Schema Workflow

- Schema migrations live in `migrations/`.
- Run `npm run schema:verify` before applying a migration to an editor-owned Supabase project.
- Apply migrations manually to the intended editor-owned Supabase project.
- There is no automatic dev schema creation for the level-editor database.
- Use separate Supabase projects for dev/staging and production, with Vercel env vars pointing each deployment to the correct project.
- Each game has its own `launch_date`; the editor-owned database assigns `daily_levels.level_number` from that launch date so level `001` can be the first launch-day puzzle for every game.
- The seeded `word-guess` launch date uses `now()::date`, so level `001` is based on the date this migration is applied in that Supabase project.
- Confirm each seeded game's `launch_date` before applying the migration to production.
- The migration is intended to be re-runnable: table/index creation is guarded, triggers are recreated, and the `word-guess` seed keeps its original launch date on conflict.
- After applying the migration, manually call the level-generation cron/backfill endpoint for the launch date so level `001` exists even if the scheduled cron already passed.

## Security Notes

- The Vite owner allowlist is client-visible and only protects the UI.
- Future HTTP APIs must enforce owner checks on the server with server-only env vars.
- Do not use Supabase `user_metadata` for owner authorization.
- Runtime Mushy Game access will use custom service tokens, not editor user/password sessions.

## UI Notes

- The app title is `Mushy Game Level Editor`.
- The visual baseline follows the Mushy miniapp template: compact hero title, red/pink brand accents, rounded cards, and connected section navigation.
- Authenticated views use one compact top header with a single account block on the right; do not duplicate account/email cards above the interactive editor area.
- Local development and Vercel preview builds show a visible non-production mode badge.
- Production builds do not show a mode badge, user ID, or session expiry diagnostics.
- `VERCEL_ENV` is injected automatically on Vercel; local Vite runs fall back to `development`.
