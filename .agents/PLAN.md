# Level-Editor Trackable Build Plan

## Summary
Build the standalone `level-editor/` first as the owner/editor surface for authoring daily levels, managing assets, exposing read-only runtime catalog APIs, and creating service tokens. Each task is intentionally small, isolated, and reversible: one agent can complete it, verify it, and mark it done without needing to implement later milestones.

## Working Rules
- Each task should be completed in its own small commit or clearly isolated patch.
- Prefer additive changes; avoid modifying `mushy-game/` except final handoff docs or contract fixtures.
- A task is complete only when its “Done when” check passes.
- If a task reveals ambiguity, stop and document the blocker instead of expanding scope.
- After each completed task, update this file by checking the task and adding any relevant checkpoint notes.
- Use `mushy-game/docs/plan-mushy-game.md` and `mushy-game/docs/plan-wordle-v1.md` as the design/vision references.

## Milestone 1 — Level-Editor Foundation
- [x] `LE-001` Scaffold the standalone `level-editor/` app.
  Done when: the app installs, starts locally, renders a placeholder page, and does not depend on `mushy-game/` imports.

- [x] `LE-002` Add environment configuration validation.
  Done when: server-only Supabase/editor env vars are documented and local example env docs exist.

- [x] `LE-003` Add Supabase client helpers for browser and server/API usage.
  Done when: browser code calls backend auth APIs and server-side Supabase helpers own privileged/authenticated access.

- [x] `LE-004` Implement password login/logout/session handling.
  Done when: manually created Supabase Auth users can log in, log out, and reload without losing session.

- [x] `LE-005` Implement owner-only authorization.
  Done when: owner identity is checked server-side from an allowlist, not user-editable metadata. Browser code must not receive owner allowlists.

- [x] `LE-006` Add the base editor shell.
  Done when: authenticated users see navigation placeholders for Levels, Assets, and Service Tokens.

### Milestone 1 Checkpoint
- Completed on branch `feat/level-editor`.
- Build check: `npm run build` passes in `level-editor/`.
- Security check: `npm audit` reports zero vulnerabilities in `level-editor/`.
- Review polish applied: title is `Mushy Game Level Editor`, non-production mode is visible in dev/preview only, production hides user ID/session diagnostics, the authenticated header is compact with one account management block, section tabs are visually connected to their panel, and styling follows the Mushy miniapp template direction.
- Auth hardening update: browser Supabase Auth usage and frontend owner allowlist checks were replaced by backend `/api/auth/*` routes, HTTP-only cookies, and server-only owner allowlists.

## Milestone 2 — Editor-Owned Database Schema
- [x] `LE-010` Add the `games` table and seed the `word-guess` game.
  Done when: the editor database has one canonical game row for Wordle-style levels.

- [x] `LE-011` Add immutable level numbering support.
  Done when: `compute_level_number()` exists in the editor-owned schema and `daily_levels.level_number` is stored, not computed by app code.

- [x] `LE-012` Add the `daily_levels` table.
  Done when: levels can store date, game key/id, level number, generated/custom source, content JSON, and publish state.

- [x] `LE-013` Add asset metadata tables.
  Done when: asset records store `object_key`, metadata, ownership/audit fields, and level references without storing persistent public URLs.

- [x] `LE-014` Add service-token storage.
  Done when: `editor_service_tokens` can store hashed tokens, scopes, labels, created/revoked metadata, and no raw token.

- [x] `LE-015` Add schema verification checks.
  Done when: a local verification command confirms required tables, constraints, and seed data exist.

### Milestone 2 Checkpoint
- Added `level-editor/migrations/001_level_catalog_schema.sql`.
- Added `npm run schema:verify` for migration structure checks.
- Level numbering is anchored to each game row's `launch_date`; the database trigger assigns stored `daily_levels.level_number`, so every game can launch with level `001`.
- The seeded `word-guess` launch date uses `now()::date`, so its level `001` is based on the date the migration is applied in each editor-owned Supabase project.
- Migration idempotency checkpoint: table/index creation is guarded, triggers are recreated safely, and reruns preserve the existing `word-guess.launch_date`.
- Content hash checkpoint: `daily_levels.content_hash` is maintained by a database trigger using a SHA-256 digest of canonical `jsonb` content and backfilled on migration reruns.
- Cron/backfill checkpoint: after applying the migration, manually call the idempotent generate-levels endpoint for the launch date so level `001` exists even if the scheduled cron already passed.
- Schema separation rule: apply migrations manually to separate editor-owned Supabase projects for dev/staging and production; do not expect Mushy miniapp-style automatic dev schema creation.
- Verification: `npm run schema:verify`, `npm run build`, and `npm audit` pass in `level-editor/`.

## Milestone 3 — Word-Guess Generator Support
- [x] `LE-020` Duplicate Wordle constants into `level-editor/`.
  Done when: editor generator logic does not import constants from `mushy-game/`.

- [x] `LE-021` Add deterministic seeded RNG utilities.
  Done when: the same date and game key always produce the same generated level data, the RNG exports an explicit algorithm/version label such as `RNG_ALGORITHM_VERSION = 'mulberry32-hash31-v1'`, and the plan notes that changing the RNG sequence requires a `generator_version` bump for affected games.

- [x] `LE-022` Add word-list build or import workflow.
  Done when: curated answer/guess lists are available inside `level-editor/` and can be regenerated or audited.

- [x] `LE-023` Implement the Word-Guess generator.
  Done when: a generated level returns valid Word-Guess content and generator metadata only; it does not compute or persist `level_number`, because the editor-owned database trigger assigns that value on insert.

- [x] `LE-024` Add generator tests for fixed dates.
  Done when: known dates produce stable snapshots and duplicate answers are detectable.

### Milestone 3 Checkpoint
- Added editor-local Word-Guess constants, generator metadata, registry, date seed helper, and pure `generate()`/`generateForDate()` functions.
- Added deterministic `seededRandom()` with `RNG_ALGORITHM_VERSION = 'mulberry32-hash31-v1'`; RNG sequence changes require a `generator_version` bump.
- Added committed generated `wordLists.js`, `wordlists:build`, and `wordlists:verify`. The intended source policy is SCOWL 2020.12.07 `english-words.20`-style answers plus merged SCOWL-50 valid-guess variants, with LDNOOBW applied to answers.
- Added duplicate-answer utility for later API/UI use without coupling it to Supabase or HTTP.
- Verification: `npm run generator:verify`, `npm run schema:verify`, and `npm run build` pass in `level-editor/`.

## Milestone 4 — Level Authoring APIs
- [x] `LE-030` Add authenticated level preview API.
  Done when: the editor can request generated/custom preview data for a game/date without saving.

- [x] `LE-031` Add level list/calendar API.
  Done when: the editor can load daily level status across a date range.

- [x] `LE-032` Add save custom level API.
  Done when: authenticated editors can create or replace custom level content for a date.

- [x] `LE-033` Add clear custom override API.
  Done when: an editor can revert a date back to generated content without deleting generated behavior.

- [x] `LE-034` Add duplicate-answer check API.
  Done when: the API reports whether a proposed Word-Guess answer already appears in nearby or existing levels.

- [x] `LE-035` Add API tests for save, clear, preview, and duplicate checks.
  Done when: tests cover owner/editor access, invalid payloads, and stable date behavior.

### Milestone 4 Checkpoint
- Added editor-session API auth that verifies Supabase access tokens server-side from HTTP-only cookies or `Authorization: Bearer <token>` and enforces server-side owner allowlists.
- Added `GET /api/levels/preview`, `GET /api/levels`, `POST /api/levels`, `DELETE /api/levels`, and `GET /api/levels/check-duplicate`.
- Preview is read-only and uses the local generator registry. Save writes custom levels only after Word-Guess content validation.
- Level writes do not compute `level_number` or `content_hash`; the editor-owned database triggers remain responsible for those persisted values.
- Tests cover auth failures, preview/list/save/clear/duplicate behavior, invalid payload rejection, and trigger-owned field boundaries.

## Milestone 5 — Cron And Daily Catalog Maintenance
- [x] `LE-040` Add cron date resolution and auth guard.
  Done when: `level-editor/api/cron/generate-levels.js` accepts Vercel Cron calls plus manual maintainer calls, validates `CRON_SECRET`, resolves a default UTC date, accepts an optional `date=YYYY-MM-DD`, rejects invalid/future-before-launch dates clearly, and never uses editor browser sessions.

- [x] `LE-041` Add active-game loading for cron.
  Done when: the cron endpoint loads active `games` rows from the editor-owned Supabase project with server-side credentials and returns a safe per-game result shape without exposing secrets.

- [x] `LE-042` Add generated level materialization.
  Done when: for each active game, cron calls the local `level-editor` generator registry, builds the stable seed, inserts a missing `daily_levels` row with generated/published source/status and version snapshots, and relies on database triggers for `level_number` and `content_hash`.

- [x] `LE-043` Preserve existing and custom rows.
  Done when: cron is idempotent: existing generated/published rows are reported as skipped/unchanged, custom rows are never overwritten, retries are safe, and the response distinguishes inserted, skipped existing, skipped custom, and failed games.

- [x] `LE-044` Add launch-date backfill workflow.
  Done when: maintainers have a documented/manual command or script to call `POST /api/cron/generate-levels?date=YYYY-MM-DD` immediately after migration so launch-date level `001` is materialized even if the scheduled cron already passed.

- [x] `LE-045` Add Vercel Cron configuration.
  Done when: `level-editor/vercel.json` schedules the endpoint at midnight UTC and uses the same route as the manual backfill path.

- [x] `LE-046` Add cron tests.
  Done when: tests cover auth failures, default UTC date resolution, manual date override, idempotency, custom override preservation, version snapshots, database-assigned `level_number`, and database-maintained `content_hash`.

- [x] `LE-047` Add cron observability and dry-run support.
  Done when: non-production maintainers can run a safe dry-run/check path that reports intended per-game actions without inserting rows, and real cron logs include `{ gameSlug, puzzleDate, action, levelNumber, generatorVersion }` without logging generated answers in production.

### Milestone 5 Checkpoint
- Added `api/cron/generate-levels.js` with `CRON_SECRET` authorization for both Vercel GET calls and manual POST backfill calls.
- Added cron service logic that loads active games, generates missing levels from the editor-local generator registry, skips existing/custom rows, and leaves `level_number` plus `content_hash` to database triggers.
- Added `dryRun=1` support and production-safe per-game logs that do not include generated answers.
- Added `vercel.json` with a midnight UTC schedule and README backfill instructions for migration-date level `001`.

## Milestone 6 — Level Authoring UI
- [ ] `LE-050` Build the level calendar/list screen.
  Done when: an authenticated editor can choose a game/date and see generated/custom status.

- [ ] `LE-051` Build shared level fields.
  Done when: date, game, publish/source status, and validation messages are visible consistently.

- [ ] `LE-052` Build the Word-Guess editor form.
  Done when: an editor can set the answer and accepted guesses without editing raw JSON.

- [ ] `LE-053` Add answer autocomplete.
  Done when: answer suggestions come from the editor-owned word list.

- [ ] `LE-054` Add live preview.
  Done when: changing form values updates a preview using the same shape the runtime API will expose.

- [ ] `LE-055` Add duplicate warning UX.
  Done when: duplicate checks are debounced and clearly shown before save.

- [ ] `LE-056` Add save and clear flows.
  Done when: editor actions round-trip through APIs and refresh the calendar/list state.

## Milestone 7 — Asset Workflow
- [ ] `LE-060` Add object storage configuration and server helper.
  Done when: asset operations use `object_key` internally and never persist long-lived public URLs.

- [ ] `LE-061` Add asset upload initiation API.
  Done when: the editor can request an upload target/key for a new asset.

- [ ] `LE-062` Add upload completion API.
  Done when: completed uploads create or update asset metadata in the editor database.

- [ ] `LE-063` Add short-lived asset view URL API.
  Done when: callers can exchange an `object_key` for a temporary URL with about a one-hour lifetime.

- [ ] `LE-064` Add asset picker UI.
  Done when: editors can select assets by metadata and the level stores `imageObjectKey`, not URL or `imageAssetId`.

- [ ] `LE-065` Add asset reference syncing on level save.
  Done when: saving level content updates `level_asset_refs` from object keys in the content JSON.

- [ ] `LE-066` Add asset workflow tests.
  Done when: tests confirm object keys persist, public URLs do not persist, and expired URLs can be regenerated.

## Milestone 8 — Service Tokens And Runtime Catalog APIs
- [ ] `LE-070` Add service-token generation helper.
  Done when: raw tokens are generated securely, stored only as hashes, and shown once.

- [ ] `LE-071` Add owner-only create/list/revoke service-token APIs.
  Done when: owners can create scoped tokens, list metadata, and revoke tokens.

- [ ] `LE-072` Build the Service Tokens owner UI.
  Done when: the owner can create a token with `catalog:read` and/or `asset:read`, copy it once, and revoke it.

- [ ] `LE-073` Add service-token auth middleware.
  Done when: runtime APIs accept bearer tokens, enforce scopes, reject revoked tokens, and never require editor email/password.

- [ ] `LE-074` Add runtime games/catalog API.
  Done when: Mushy Game can fetch available games using only `LEVEL_EDITOR_SERVICE_TOKEN`.

- [ ] `LE-075` Add runtime daily-level API.
  Done when: Mushy Game can fetch level content by game/date and receives stored `level_number`.

- [ ] `LE-076` Add runtime asset URL API.
  Done when: Mushy Game can request short-lived asset URLs using `asset:read` scope.

- [ ] `LE-077` Add service-token security tests.
  Done when: tests cover missing token, bad token, revoked token, insufficient scope, and valid scoped access.

## Milestone 9 — End-To-End Acceptance
- [ ] `LE-080` Run owner login acceptance.
  Done when: a manually created owner account can log in and access all owner/editor surfaces.

- [ ] `LE-081` Run Word-Guess authoring acceptance.
  Done when: the owner can preview, customize, save, clear, and re-preview a Word-Guess daily level.

- [ ] `LE-082` Run asset acceptance.
  Done when: the owner can upload/select an asset, store only `imageObjectKey`, and resolve a short-lived view URL.

- [ ] `LE-083` Run service-token acceptance.
  Done when: the owner creates a token, a simulated Mushy Game request reads catalog/level data, and revoked tokens stop working.

- [ ] `LE-084` Produce Mushy Game handoff notes.
  Done when: the required env vars, runtime API endpoints, response shapes, and expected failure modes are documented for the later Mushy Game integration.

## Assumptions
- `level-editor/` is the first application to build.
- Mushy Game does not query the editor-owned Supabase database directly.
- Mushy Game later calls level-editor runtime HTTP APIs using `LEVEL_EDITOR_SERVICE_TOKEN`.
- Service tokens are custom level-editor tokens, not Supabase Auth sessions.
- Level content stores object keys such as `imageObjectKey`, never persistent public URLs.
- Word-Guess generator logic is duplicated into `level-editor/`, not imported from `mushy-game/`.
