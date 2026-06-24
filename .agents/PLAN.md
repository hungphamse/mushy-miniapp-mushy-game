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
  Done when: missing Supabase/editor env vars fail fast with clear messages, and local example env docs exist.

- [x] `LE-003` Add Supabase client helpers for browser and server/API usage.
  Done when: login-capable client code and server-side privileged helpers are separated.

- [x] `LE-004` Implement password login/logout/session handling.
  Done when: manually created Supabase Auth users can log in, log out, and reload without losing session.

- [x] `LE-005` Implement owner-only authorization.
  Done when: owner identity is checked from an allowlist, not user-editable metadata. Current milestone gates the UI and provides server helper boundaries; future privileged APIs must repeat the check server-side.

- [x] `LE-006` Add the base editor shell.
  Done when: authenticated users see navigation placeholders for Levels, Assets, and Service Tokens.

### Milestone 1 Checkpoint
- Completed on branch `feat/level-editor`.
- Build check: `npm run build` passes in `level-editor/`.
- Security check: `npm audit` reports zero vulnerabilities in `level-editor/`.
- Review polish applied: title is `Mushy Game Level Editor`, non-production mode is visible in dev/preview only, production hides user ID/session diagnostics, the authenticated header is compact with one account management block, section tabs are visually connected to their panel, and styling follows the Mushy miniapp template direction.

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
- Schema separation rule: apply migrations manually to separate editor-owned Supabase projects for dev/staging and production; do not expect Mushy miniapp-style automatic dev schema creation.
- Verification: `npm run schema:verify`, `npm run build`, and `npm audit` pass in `level-editor/`.

## Milestone 3 — Word-Guess Generator Support
- [ ] `LE-020` Duplicate Wordle constants into `level-editor/`.
  Done when: editor generator logic does not import constants from `mushy-game/`.

- [ ] `LE-021` Add deterministic seeded RNG utilities.
  Done when: the same date and game key always produce the same generated level data.

- [ ] `LE-022` Add word-list build or import workflow.
  Done when: curated answer/guess lists are available inside `level-editor/` and can be regenerated or audited.

- [ ] `LE-023` Implement the Word-Guess generator.
  Done when: a generated level includes the answer, accepted guesses, display metadata, and persisted level number.

- [ ] `LE-024` Add generator tests for fixed dates.
  Done when: known dates produce stable snapshots and duplicate answers are detectable.

## Milestone 4 — Level Authoring APIs
- [ ] `LE-030` Add authenticated level preview API.
  Done when: the editor can request generated/custom preview data for a game/date without saving.

- [ ] `LE-031` Add level list/calendar API.
  Done when: the editor can load daily level status across a date range.

- [ ] `LE-032` Add save custom level API.
  Done when: authenticated editors can create or replace custom level content for a date.

- [ ] `LE-033` Add clear custom override API.
  Done when: an editor can revert a date back to generated content without deleting generated behavior.

- [ ] `LE-034` Add duplicate-answer check API.
  Done when: the API reports whether a proposed Word-Guess answer already appears in nearby or existing levels.

- [ ] `LE-035` Add API tests for save, clear, preview, and duplicate checks.
  Done when: tests cover owner/editor access, invalid payloads, and stable date behavior.

## Milestone 5 — Level Authoring UI
- [ ] `LE-040` Build the level calendar/list screen.
  Done when: an authenticated editor can choose a game/date and see generated/custom status.

- [ ] `LE-041` Build shared level fields.
  Done when: date, game, publish/source status, and validation messages are visible consistently.

- [ ] `LE-042` Build the Word-Guess editor form.
  Done when: an editor can set the answer and accepted guesses without editing raw JSON.

- [ ] `LE-043` Add answer autocomplete.
  Done when: answer suggestions come from the editor-owned word list.

- [ ] `LE-044` Add live preview.
  Done when: changing form values updates a preview using the same shape the runtime API will expose.

- [ ] `LE-045` Add duplicate warning UX.
  Done when: duplicate checks are debounced and clearly shown before save.

- [ ] `LE-046` Add save and clear flows.
  Done when: editor actions round-trip through APIs and refresh the calendar/list state.

## Milestone 6 — Asset Workflow
- [ ] `LE-050` Add object storage configuration and server helper.
  Done when: asset operations use `object_key` internally and never persist long-lived public URLs.

- [ ] `LE-051` Add asset upload initiation API.
  Done when: the editor can request an upload target/key for a new asset.

- [ ] `LE-052` Add upload completion API.
  Done when: completed uploads create or update asset metadata in the editor database.

- [ ] `LE-053` Add short-lived asset view URL API.
  Done when: callers can exchange an `object_key` for a temporary URL with about a one-hour lifetime.

- [ ] `LE-054` Add asset picker UI.
  Done when: editors can select assets by metadata and the level stores `imageObjectKey`, not URL or `imageAssetId`.

- [ ] `LE-055` Add asset reference syncing on level save.
  Done when: saving level content updates `level_asset_refs` from object keys in the content JSON.

- [ ] `LE-056` Add asset workflow tests.
  Done when: tests confirm object keys persist, public URLs do not persist, and expired URLs can be regenerated.

## Milestone 7 — Service Tokens And Runtime Catalog APIs
- [ ] `LE-060` Add service-token generation helper.
  Done when: raw tokens are generated securely, stored only as hashes, and shown once.

- [ ] `LE-061` Add owner-only create/list/revoke service-token APIs.
  Done when: owners can create scoped tokens, list metadata, and revoke tokens.

- [ ] `LE-062` Build the Service Tokens owner UI.
  Done when: the owner can create a token with `catalog:read` and/or `asset:read`, copy it once, and revoke it.

- [ ] `LE-063` Add service-token auth middleware.
  Done when: runtime APIs accept bearer tokens, enforce scopes, reject revoked tokens, and never require editor email/password.

- [ ] `LE-064` Add runtime games/catalog API.
  Done when: Mushy Game can fetch available games using only `LEVEL_EDITOR_SERVICE_TOKEN`.

- [ ] `LE-065` Add runtime daily-level API.
  Done when: Mushy Game can fetch level content by game/date and receives stored `level_number`.

- [ ] `LE-066` Add runtime asset URL API.
  Done when: Mushy Game can request short-lived asset URLs using `asset:read` scope.

- [ ] `LE-067` Add service-token security tests.
  Done when: tests cover missing token, bad token, revoked token, insufficient scope, and valid scoped access.

## Milestone 8 — Cron And Daily Catalog Maintenance
- [ ] `LE-070` Add cron endpoint for daily level materialization.
  Done when: the endpoint creates or confirms generated daily rows without overwriting custom levels.

- [ ] `LE-071` Add Vercel Cron configuration.
  Done when: cron can be deployed from the level-editor app and targets the correct endpoint.

- [ ] `LE-072` Add manual cron verification.
  Done when: an owner or maintainer can trigger/check the cron path safely in non-production.

- [ ] `LE-073` Add cron tests.
  Done when: tests confirm idempotency, immutable level numbers, and custom override preservation.

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
