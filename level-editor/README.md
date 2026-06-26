# Mushy Level Editor

Standalone owner/editor application for authoring Mushy daily levels.

## First Milestone

This scaffold covers:

- `LE-001`: Vite/React app scaffold.
- `LE-002`: Runtime mode detection.
- `LE-003`: Server/API Supabase helper boundary.
- `LE-004`: Backend password login/logout/session handling with HTTP-only cookies.
- `LE-005`: Server-side owner allowlist gate.
- `LE-006`: Authenticated editor shell with Levels, Assets, and Service Tokens placeholders.

## Local Setup

1. Copy `.env.example` to `.env.local`.
2. Fill in the server-only editor-owned Supabase project URL, anon key, and service-role key.
3. Add your Supabase Auth user ID or email to the server-side owner allowlist.
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

## Cron And Backfill Workflow

- `api/cron/generate-levels.js` is the level catalog publisher.
- Vercel Cron calls it once per day at midnight UTC through `vercel.json`.
- Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically when `CRON_SECRET` is set on the Vercel project.
- Manual maintainer calls must send the same bearer token.
- The default date is the current UTC date.
- Use `date=YYYY-MM-DD` to backfill a specific non-future date.
- Use `dryRun=1` to inspect intended actions without inserting rows.
- Existing generated rows are skipped, custom rows are never overwritten, and database triggers assign `level_number` and `content_hash`.

After applying `migrations/001_level_catalog_schema.sql`, get the seeded game launch date from the editor-owned Supabase project and backfill it immediately:

```powershell
$env:LEVEL_EDITOR_BASE_URL = "https://your-level-editor.vercel.app"
$env:CRON_SECRET = "same-secret-configured-on-vercel"
$launchDate = "YYYY-MM-DD"

Invoke-RestMethod `
  -Method Post `
  -Uri "$env:LEVEL_EDITOR_BASE_URL/api/cron/generate-levels?date=$launchDate" `
  -Headers @{ Authorization = "Bearer $env:CRON_SECRET" }
```

## Generator Workflow

- Word-Guess generator code is editor-local under `src/lib/generators/`; do not import from `mushy-game/`.
- `npm run generator:verify` audits the committed word lists and runs fixed-date generator tests.
- `src/lib/utils/random.js` exports `RNG_ALGORITHM_VERSION = 'mulberry32-hash31-v1'`; changing the RNG sequence requires a `generator_version` bump for affected games.
- `src/lib/data/wordLists.js` is committed generated data. The intended source policy is SCOWL 2020.12.07 `english-words.20`-style answers plus merged SCOWL-50 valid-guess variants, filtered by LDNOOBW for answers.
- To regenerate word lists, place raw sources in `scripts/wordlist-sources/` and run `npm run wordlists:build`, then `npm run generator:verify`.
- Preferred source names for configurable builds:
  - `scowl-answers.txt` or `scowl-answers-*.txt` for answer lists. For easier answers, copy `english-words.20` to `scowl-answers.txt`.
  - `scowl-valid-guesses.txt` or `scowl-valid-guesses-*.txt` for valid guesses. To merge forgiving guesses, copy multiple files such as `english-words.50`, `american-words.50`, and `british-words.50` to `scowl-valid-guesses-english.txt`, `scowl-valid-guesses-american.txt`, and `scowl-valid-guesses-british.txt`.
  - If these preferred names are absent, the builder falls back to legacy local source filenames for older checkouts.
- Raw SCOWL/profanity source files stay gitignored; commit only the generated `src/lib/data/wordLists.js`.

## Security Notes

- The browser does not receive Supabase keys or owner allowlists.
- Backend auth routes set HTTP-only Supabase session cookies after password login succeeds and server-side owner authorization passes.
- Editor management APIs require a server-validated owner session.
- Do not use Supabase `user_metadata` for owner authorization.
- Runtime Mushy Game access will use custom service tokens, not editor user/password sessions.

## UI Notes

- The app title is `Mushy Game Level Editor`.
- The visual baseline follows the Mushy miniapp template: compact hero title, red/pink brand accents, rounded cards, and connected section navigation.
- Authenticated views use one compact top header with a single account block on the right; do not duplicate account/email cards above the interactive editor area.
- Local development and Vercel preview builds show a visible non-production mode badge.
- Production builds do not show a mode badge, user ID, or session expiry diagnostics.
- `VERCEL_ENV` is injected automatically on Vercel; local Vite runs fall back to `development`.
