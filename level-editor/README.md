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

## Generator Workflow

- Word-Guess generator code is editor-local under `src/lib/generators/`; do not import from `mushy-game/`.
- `npm run generator:verify` audits the committed word lists and runs fixed-date generator tests.
- `src/lib/utils/random.js` exports `RNG_ALGORITHM_VERSION = 'mulberry32-hash31-v1'`; changing the RNG sequence requires a `generator_version` bump for affected games.
- `src/lib/data/wordLists.js` is committed generated data from SCOWL 2020.12.07 (`english-words.35` answers and `english-words.50` valid guesses), filtered by LDNOOBW for answers.
- To regenerate word lists, place raw sources in `scripts/wordlist-sources/` and run `npm run wordlists:build`, then `npm run generator:verify`.
- Preferred source names for configurable builds:
  - `scowl-answers.txt` or `scowl-answers-*.txt` for answer lists. For easier answers, copy `english-words.20` to `scowl-answers.txt`.
  - `scowl-valid-guesses.txt` or `scowl-valid-guesses-*.txt` for valid guesses. To merge forgiving guesses, copy multiple files such as `english-words.50`, `american-words.50`, and `british-words.50` to `scowl-valid-guesses-english.txt`, `scowl-valid-guesses-american.txt`, and `scowl-valid-guesses-british.txt`.
  - If these preferred names are absent, the builder falls back to legacy `scowl-35.txt` and `scowl-50.txt`.
- Raw SCOWL/profanity source files stay gitignored; commit only the generated `src/lib/data/wordLists.js`.

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
