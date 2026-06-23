# Plan: Mushy Game — Daily Puzzle Sub-Platform

> Reviewed and approved by: 
> Author: Claude (Sonnet 4.6)
> Last updated: 2026-06-22 (companion `level-editor` image import now uses editor-owned R2 assets through its separate Supabase/API surface; versioning model split between Mushy Game platform SemVer and per-puzzle game versions)

---

## 0. Overview

### 0.1 Introduction

Mushy Game is a **daily puzzle sub-platform** built as a Mushy mini-app. Each day, every registered game gets a new published level from the editor-owned level catalog managed by the companion `level-editor/` app and its Vercel Cron job. Players solve puzzles, earn streaks, and compare results with their workspace teammates and globally. The platform is designed so new game types can be plugged in with minimal boilerplate — see §17 for the complete guide.

### 0.2 Application Target

Vietnamese players are the primary audience — all UI copy defaults to Vietnamese. Brand-specific elements (e.g. footer "Mushy") are kept as-is in English.

### 0.3 Mushy Platform Integration

Mushy Game is a **Mushy mini-app** — it runs inside the Mushy Shell (iOS/Android WebView or web). The following platform conventions apply and are verified against `mushy-miniapp-orgchart` (DB slug: `app_status_mate`):

**Context (`ctx`):**
The Mushy Shell injects `window.__APP_CONTEXT__` before the WebView loads. The miniapp reads it via `src/lib/context.js`:
```js
// window.__APP_CONTEXT__ shape (Shell-injected)
{
  token:         string,   // user JWT (Bearer token for Supabase + API calls)
  workspaceId:   string,   // UUID of the currently active workspace
  userId:        string,   // UUID of the authenticated user
  role:          string,   // workspace role: 'admin' | 'member'
  workspaceSlug: string,   // URL-safe workspace slug
}
```
Dev fallback: `VITE_DEV_TOKEN`, `VITE_DEV_WORKSPACE_ID`, `VITE_DEV_USER_ID`, `VITE_DEV_ROLE` env vars (same as `mushy-miniapp-orgchart`).

**Supabase clients (`src/lib/supabase.js`):**
Two lazy-proxy clients, both initialised with `ctx.token` as the Bearer token:
- `db` → app schema. Schema name derived from `mushy.config.json` slug (`app_mushy_game` in production, `app_mushy_game_dev` in preview/dev). Switching is automatic via `VERCEL_ENV` build-time constant.
- `dbPublic` → `public` schema. Used for `workspace_members`, `user_profiles`, `workspaces`.

**Config (`mushy.config.json`):**
Slug, Supabase URL, and anon key are stored in `mushy.config.json` at the project root — same pattern as `mushy-miniapp-orgchart`. Dashes in slug are converted to underscores for the schema name.

**API server auth (`api/_verify.js`):**
Reads `Authorization: Bearer <token>` and `x-workspace-id` header. Calls `auth.getUser(token)` then checks `public.workspace_members` for membership. Returns `{ userId, workspaceId, role, token }`. No service role needed for auth — Mushy Game runtime only uses service role for cross-workspace aggregate queries. Daily-level cron credentials belong to the separate `level-editor` deployment.

**RLS pattern:**
Mushy miniapps use two **database-level helper functions** already defined by the Mushy platform developers in the `public` schema:

- **`public.can_access_app_data(workspace_id, app_slug)`** — call this in policies on workspace-scoped tables. It returns TRUE if the calling user is a direct member of `workspace_id`, or a member of a follower workspace that holds a share grant for `app_slug`.
- **`public.is_owner_workspace_member(workspace_id)`** — call this in DELETE policies. It returns TRUE only for direct members of `workspace_id`; follower-workspace members return FALSE.

For shared read tables where rows belong to a specific user (for example `player_sessions`, which powers score/history/leaderboard display), do **not** rely on workspace access alone for writes. Use workspace/share access for SELECT so members can read each other's scores, but require `user_id = auth.uid()` on INSERT and UPDATE so a member cannot create or mutate another player's session row. API endpoints still check ownership, but RLS must be the database backstop.

These are not miniapp-defined functions and must not be redefined in this migration. They are guaranteed to exist in the Mushy public DB before any miniapp migration runs. See `migrations/000_init_example.sql` for generic helper usage and §12 for the stricter `player_sessions` policy intent used by this app.

Older miniapps (pre-superapp-mig-049) used a raw inline subquery instead of these helpers. `mushy-game` is a new miniapp built after mig 049 and uses the helper functions.

**`public` schema tables accessible to miniapps:**
- `public.workspace_members` — `user_id, role, workspace_id` (readable via RLS workspace-mate visibility, superapp mig 004)
- `public.user_profiles` — `user_id, full_name, avatar_url` (readable for workspace-mates)
- `public.workspaces` — workspace display name and metadata

---

## 1. Screen Architecture

```
HomeScreen
  ├─ GameScreen (in-progress puzzle + timer)
  │     └─ ResultScreen (post-completion stats)
```

### 1.1 HomeScreen
- Lists all active games (cards: icon, display name, today's level `#NNN`, primary action)
- Primary action is either `Start` or `See the result`
- `See the result` is shown when today's puzzle for that game is already completed in the active workspace
- `Start` is shown otherwise; if an unresolved carryover session exists, clicking it opens the carryover-resolution dialog before any new session is created
- Game catalog is global — no `workspace_id` filtering on this screen

### 1.2 GameScreen
- Header layout depends on `game.has_timer`:
  - **Timer game**: `← Quay lại` | Game title | Live timer (MM:SS, counts up)
  - **No-timer game**: `← Quay lại` | Game title | `#NNN` (level number in the header slot; no score shown during play)
- Main area: pluggable puzzle renderer per game type (see §17 for renderer contract). **Score is never displayed during gameplay** — only revealed on the result screen after completion.
- **First-time player**: show a "Cách chơi" (How to play) dialog on first visit for this game type. For timer games, the timer only starts when the dialog is dismissed. Dialog content is defined per game type in the game's own plan document.
- If the entry resolver returns `prompt_carryover`, GameScreen shows the carryover dialog first; the puzzle renderer stays blocked until the player continues or skips the old session
- On mount: call `POST /api/sessions/enter?gameSlug=` — the server returns `start_new`, `resume_today`, `prompt_carryover`, or `show_result` and either a fresh bundle or a carryover-dialog payload (see §4.4)
- On puzzle solved → POST `/api/sessions/complete` → navigate to ResultScreen, passing the `{ session, level, game }` bundle in route state

### 1.3 ResultScreen
- Receives `{ session, level, game }` bundle from GameScreen via route state — no independent data fetch needed for score display
- **Top-center score card** — unified display for both game types (see §8.6 for per-game config):
  - Timer game: player's time (MM:SS or HH:MM:SS) in large text; "Trung bình: MM:SS" in smaller text below
  - No-timer game: score in large text using game-specific label; game-specific average in smaller text — format defined per game type via `scoreConfig.js` (see §8.6)
  - If `score_direction = null` (unranked game): score card is omitted entirely
- **Stats card list** (vertical, scrollable):
  - **Global percentile card**: "Top X% của tất cả mọi người" — thresholds: 1%, 5%, 10%, 25%, 50%; omit if outside top 50%
  - **Workspace percentile card**: "Top X% của mọi người trong **\<workspace name\>**" (workspace name in smaller text) — same thresholds; omit if workspace has < 10 members OR < 2 completions for this level (see §8.4)
  - **Streak card**: "🔥 N ngày liên tiếp" — if streak frozen: "❄️ Đã giữ chuỗi NNN ngày"
- CTA: "Về trang chủ"

### 1.4 Companion `level-editor` App _(separate project)_
- Level authoring is **not** part of the Mushy Game screen tree
- Upcoming-level preview, custom override, duplicate checks, and typed authoring UI live in the `level-editor/` project and are deployed separately from the Mushy mini-app
- The companion app keeps its own copy of the generator registry instead of importing from `mushy-game/`; when a generator changes, update both copies and bump `generator_version` as needed. The canonical level-number derivation lives in the editor-owned catalog schema so date previews match the published level rows exactly
- Saved levels are still marked `is_custom = true`; the `level-editor` catalog cron skips those dates via `ON CONFLICT DO NOTHING`

---

## 2. Routing

No external router library. Simple state machine in `App.jsx`:

```js
// Route type
| { screen: 'home' }
| { screen: 'game';   gameSlug: string }
| { screen: 'result'; bundle: { session: SessionRow, level: LevelRow, game: GameRow } }
```

Navigation = `setRoute(...)`.
Level authoring is outside this router — it belongs to the separate `level-editor` deployment.

**Why `gameSlug` only on the game route (not `levelId`):** `GameScreen` always calls `POST /api/sessions/enter?gameSlug=` on mount — the server resolves today's level, today's session, and any carryover prompt from the slug alone. There is no need to pre-supply `levelId` in the route; the endpoint returns it.

**Why `bundle` on the result route (not just `sessionId`):** `ResultScreen` needs `session` (for score, streak, `elapsed_seconds`), `level` (for `content`, `level_number`, `levelId` to pass to stats endpoints), and `game` (for `has_timer`, `score_direction`, `slug` to look up `scoreConfig`). Passing the bundle in route state means ResultScreen never makes an extra fetch — it always has everything it needs. The bundle is populated by `POST /api/sessions/enter` on GameScreen mount and passed through unchanged when navigating to results.

---

## 3. Level Authoring Boundary

Mushy Game no longer carries an in-app privileged authoring surface. There is no in-app level-authoring screen, no owner-env gate, and no level-authoring route in the Mushy Game deployment.

Instead, level authoring lives in `level-editor/`, a sibling project to `mushy-game/`. It is a **separate app and separate deploy target** even if it shares this workspace with `mushy-game/`.

Boundary of responsibility:
- **`mushy-game/`** — gameplay, player sessions, stats, and runtime API endpoints that consume published level bundles
- **`level-editor/`** — level catalog database, upcoming-level preview, custom overrides, duplicate checks, typed authoring UX, asset storage metadata, and daily level publishing cron

The Mushy shell context (`window.__APP_CONTEXT__`) still only provides `{ token, workspaceId, userId, role, workspaceSlug }` — see §0.3. That is sufficient for gameplay APIs. The companion `level-editor` app uses its editor-owned Supabase project for password-based auth. Human editor/owner accounts are provisioned manually there. Mushy Game runtime APIs do **not** log in with an editor email/password; they call level-editor HTTP APIs with a custom read-only service token created by a level-editor owner. The service token is stored only in Mushy Game backend environment variables and is never sent to the browser. Mushy Game does not need an app-owner bit in `ctx` anymore.

### 3.1 Companion `level-editor` Asset Storage

Image import for authored levels is owned by the companion `level-editor` app, not by Mushy Game and not by the Mushy miniapp template storage helper.

Storage/database boundary:
- `level-editor` uses its **own Supabase project/config** for editor authentication, level catalog tables, asset metadata, and server APIs.
- Image bytes live in an editor-owned **R2 bucket** configured through server-side environment variables on the `level-editor` deployment.
- Do **not** copy Mushy Game's miniapp Supabase config merely to upload images, and do **not** write editor assets into the `miniapp-mushy-game` bucket.
- Do **not** modify `mushy-game/src/lib/storage.js`. `AGENTS.md` marks `src/lib/*` as synced shared infra; app-specific helpers must live under `src/lib/app/*` or `src/app-lib/*`. Because image upload belongs to the separate `level-editor` app, create a dedicated helper such as `level-editor/src/lib/editorAssets.js` instead.
- Persist `object_key` as the canonical asset reference. Follow the `mushy-game/src/lib/storage.js` model: generate a short-lived view URL from `object_key` only when a UI or runtime needs to display the asset, using a TTL that matches the normal login session window (about 1 hour).

R2 access model:
- R2 credentials are server-only (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` or equivalent).
- The browser never receives R2 credentials. It only receives a short-lived presigned upload URL from `level-editor` after the server validates the editor user, file type, and file size.
- Runtime image reads use the same short-lived view URL model as `mushy-game/src/lib/storage.js`: call the editor-owned storage/API helper with `object_key`, receive a temporary URL, and keep URLs out of saved level content.
- Object keys are editor-scoped, not workspace-scoped. Recommended format: `assets/{env}/{yyyy}/{mm}/{uuid}.{ext}`. Never use `{workspace_id}/...` or `{editor_id}/...` in the existing miniapp bucket; that path shape is reserved for the Mushy template storage policies.

Asset metadata model in the `level-editor` Supabase project:

```sql
editor_assets
- id uuid primary key
- object_key text not null unique
- mime_type text not null
- size_bytes integer not null
- width integer null
- height integer null
- alt_text text null
- tags text[] not null default '{}'
- game_slug text null
- created_by uuid not null
- status text not null default 'pending' -- 'pending' | 'ready'
- created_at timestamptz not null default now()
- archived_at timestamptz null

level_asset_refs
- asset_id uuid not null
- game_slug text not null
- puzzle_date date not null
- level_id uuid null       -- copied from Mushy Game when known; no cross-project FK
- content_path text not null
- created_at timestamptz not null default now()
```

`public_url` is not a persisted column. Derive it from `object_key` when the editor or runtime needs to display an asset, using the same short-lived signed URL model as `mushy-game/src/lib/storage.js`.

Level content contract:
- Custom level content stores `imageObjectKey`.
- `imageObjectKey` is the canonical persisted reference. When the editor or runtime needs to render the asset, it resolves a short-lived `publicUrl` from that object key instead of storing a permanent URL in the level content.
- Do not overwrite an existing R2 object. If an image changes, upload a new object and create a new asset record so old published levels remain visually immutable.

Reuse and deletion:
- New levels can reuse any non-archived `editor_assets` row. V1 does not add a per-game editor permission model; access is controlled by manually provisioned editor-owned Supabase accounts.
- The asset picker should support search/filter by `game_slug`, tag, filename/alt text, and recently used assets.
- Removing an image from a level deletes only the `level_asset_refs` row and clears the level content field; it does not delete the R2 object.
- `DELETE /api/assets/:id` archives the asset when it is still referenced by any saved/published level.
- Hard delete from R2 is allowed only when `ref_count = 0`; otherwise the asset is hidden from future picker results but remains available to old levels.

### 3.2 Workspace Tree & Companion `level-editor` Project Structure

The workspace contains two sibling projects. Unless a path explicitly starts with `mushy-game/`, any `level-editor/...` path in this document refers to the top-level sibling app shown below, not `mushy-game/level-editor/...`.

```text
workspace-root/
├── mushy-game/                         ← Mushy mini-app: gameplay, sessions, stats
│   ├── docs/
│   ├── src/
│   ├── api/
│   └── migrations/                     ← runtime/player schema only
└── level-editor/                       ← separate editor app and deploy target
    ├── package.json
    ├── vercel.json                     ← level catalog cron lives here
    ├── migrations/
    │   └── 001_level_catalog_schema.sql ← owns games, daily_levels, editor_assets, level_asset_refs, editor_service_tokens
    ├── src/
    │   ├── App.jsx                     ← calendar + editor UI for future levels
    │   ├── lib/
    │   │   ├── levelCatalog.js         ← calls level-editor level APIs
    │   │   ├── editorAssets.js         ← calls level-editor asset APIs; R2 helper wrapper
    │   │   └── serviceTokens.js        ← owner-only service-token API helper
    │   └── components/
    │       ├── editors/
    │       │   └── <GameSlug>LevelEditor.jsx
    │       ├── fields/
    │       │   └── ImageAssetField.jsx
    │       └── settings/
    │           └── ServiceTokensPanel.jsx
    └── api/
        ├── levels/
        │   ├── index.js                ← list/save custom daily levels
        │   ├── preview.js              ← generated preview for date+game
        │   └── check-duplicate.js
        ├── assets/
        │   ├── index.js                ← list reusable assets
        │   ├── presign.js              ← create R2 presigned upload URL
        │   ├── [id]/complete.js        ← finalize uploaded asset
        │   └── [id]/index.js           ← archive/hard-delete asset
        ├── service-tokens/
        │   ├── index.js                ← owner-only list/create read service tokens
        │   └── [id]/revoke.js          ← owner-only revoke
        └── cron/
            └── generate-levels.js      ← inserts daily_levels into the level catalog DB
```

The companion project is not a screen inside Mushy Game. It is a sibling web app, separate deployment, and separate Supabase project. Its database migrations are separate from `mushy-game/migrations/`.

`level-editor/migrations/001_level_catalog_schema.sql` is the **daily level schema file**. It owns:
- `games`
- `daily_levels`
- `editor_assets`
- `level_asset_refs`
- `editor_service_tokens`

`mushy-game/migrations/001_mushy_game_schema.sql` must not redefine those tables. Mushy Game stores only runtime/player data and treats `game_id` / `level_id` as external IDs copied from level-editor HTTP API responses.

---

## 4. Timer, Ping & Disconnect Recovery

### 4.1 Timer Design
- Counts **up**, driven by the server-owned `elapsed_seconds` value loaded on mount
- Visual tick: `setInterval` every 1 second in a `useEffect` — display only, not a source of truth
- Display: `MM:SS` (or `HH:MM:SS` if ≥ 1 hour)
- Timer only starts after the "Cách chơi" (How to play) dialog is dismissed (first-time player)
- **The server owns elapsed time** — the client never reports a number; it only sends pings. The server derives elapsed from its own timestamps.

**Timer and dialog ownership — GameScreen owns both:**
`GameScreen` owns the timer state (`elapsed`, `running`) and renders `<Timer elapsed={elapsed} running={running} />` in the header. It also owns the "Cách chơi" dialog skeleton — it reads `howToPlays[game.slug]` from the renderer registry and renders the dialog shell (with an **×** close button in the top corner) around the game-specific `HowToPlay` component. The renderer itself never manages timer state or dialog visibility.

When `game.has_timer = true` and the "Cách chơi" dialog is shown on first visit, `GameScreen` keeps `running = false` until the player dismisses the dialog (taps **×**). The interval ping loop also does not start until the dialog is dismissed. For `has_timer = false` games, the dialog dismiss has no timer effect — there is no timer to start.

The renderer receives no props related to the timer or dialog state. It always calls `onAction` and `onComplete` normally regardless of whether the dialog is open or the timer is running — GameScreen ignores incoming `onAction` calls while the dialog is visible (the renderer is not yet interactive since the dialog overlays it).

### 4.2 Two-Tier Ping System

The server owns and atomically updates a unified session checkpoint object on every ping:

```js
{
  elapsed_seconds,   // server-computed — see formula below
  last_ping_at,      // now()
  game_state         // updated on game action pings; unchanged on interval pings
}
```

**`elapsed_seconds` formula:** the server does not track offline gaps as a separate column. Instead, elapsed is computed from the two timestamps already stored on the session:

```js
// On every successful ping:
elapsed_seconds = previous_elapsed_seconds + (now - last_ping_at)
// i.e. accumulate only the time that passed since the last confirmed ping.
// Offline gaps (time between last_ping_at and reconnect) are naturally excluded
// because they never contributed a ping — nothing is added for that gap.
```

On a brand-new session (`last_ping_at` is NULL), `elapsed_seconds` stays 0 until the first ping arrives.

There are two types of pings, with a clear hierarchy:

#### Tier 1 — Game Action Ping (First Class)
- **Trigger:** Player performs a game action (submits a guess, places a tile, etc.)
- **Sent by client:** `POST /api/sessions/ping` with `{ levelId, gameState }`
- **Server action:** Validates connection window (see §4.3), then atomically updates `elapsed_seconds`, `last_ping_at`, and `game_state`
- **Purpose:** Records puzzle progress as a confirmed checkpoint

#### Tier 2 — Interval Ping (Second Class)
- **Trigger:** Every 5 seconds on a repeating timer — **applies to all game types**
- **Sent by client:** `POST /api/sessions/ping` with `{ levelId }` (no game state)
- **Server action:** Updates `elapsed_seconds` and `last_ping_at` only; `game_state` is untouched
- **Purpose:** Connection heartbeat and elapsed time checkpoint. For no-timer games, elapsed is computed but not used for display — the ping still runs for connectivity validation.

Two named constants govern the ping system — both easy to tune:

```js
const PING_INTERVAL_MS       = 5000;   // client fires an interval ping every 5 s
const MISSED_PING_THRESHOLD_MS = 5000; // server rejects a game action ping if
                                        // now() - last_ping_at > this value
                                        // (equal to PING_INTERVAL_MS by design)
```

The threshold is intentionally equal to `PING_INTERVAL_MS`. This means an interval ping is "missed" the moment the next one was due but did not arrive — there is no grace buffer. The server uses `now() - last_ping_at > MISSED_PING_THRESHOLD_MS` as the exact rejection predicate.

| Trigger | Client sends | Server updates |
|---|---|---|
| Every 5 seconds (all game types) | `{ levelId }` | `elapsed_seconds`, `last_ping_at` |
| Game action (all game types) | `{ levelId, gameState }` | `elapsed_seconds`, `last_ping_at`, `game_state` — only if connection window is valid |
| Puzzle completed | `{ levelId, score }` via `/api/sessions/complete` | `status`, `elapsed_seconds`, `completed_at`, `streak`, `score` — `game_state` is **preserved** (not cleared) |

### 4.3 Connection Window & Rejection

The **interval ping is the commit boundary**. A game action ping is only accepted by the server if the preceding interval ping was successfully received. This rule applies uniformly to all game types — timer and no-timer alike.

**Definition — "missed" interval ping:** an interval ping is considered missed when `now() - last_ping_at > PING_INTERVAL_MS` at the moment the server processes a game action ping. If `last_ping_at` is NULL (brand-new session with no ping yet received), the game action ping is accepted — the session was just created and no interval has elapsed yet.

**If the preceding interval ping was missed:**
- Any subsequent game action ping is **rejected immediately** by the server
- Server responds with: `{ ok: false, reason: 'disconnected', message: 'Server disconnected. Please reconnect again.' }`
- Client receives this response → triggers the auto-reconnect sequence (see below)
- The server never silently drops a ping — rejection is always explicit

**Auto-reconnect sequence (client-side):**

When a game action ping returns `{ ok: false, reason: 'disconnected' }`, the client immediately attempts to re-establish the connection without user involvement:

1. Stop the interval ping timer and any pending game action pings
2. Attempt to re-POST `/api/sessions/ping` with `{ levelId }` (interval ping shape — no game state) as a reconnect probe
3. If the probe succeeds (`{ ok: true }`) → restart the interval ping timer, resume normal play, restore game state from last committed checkpoint (same as Case B in §4.4)
4. If the probe fails → wait 2 seconds, retry (up to **3 automatic attempts** total)
5. If all 3 automatic attempts fail → stop retrying and display the **manual reconnect UI**: a banner with the message `'Server disconnected. Please reconnect again.'` and a visible **"Kết nối lại"** button. The player must tap it to trigger another probe sequence

```js
// Named constants for retry behaviour
const MAX_AUTO_RECONNECT_ATTEMPTS = 3;
const AUTO_RECONNECT_DELAY_MS     = 2000; // delay between automatic retry probes
```

The player cannot submit any game actions while the auto-reconnect sequence is running or the manual reconnect UI is shown.

**On reconnect (either auto or manual):**
- Game state is restored to the last successfully committed checkpoint (the state as of the last received interval ping)
- Any game actions that occurred after that interval ping are discarded — even if their pings technically reached the server before the rejection was enforced
- For timer games: elapsed resumes from the server's last computed value
- For no-timer games: puzzle state is restored from the last committed checkpoint — the rejected action is simply re-entered by the player

> **Example:** A player in a no-timer game has made 3 confirmed moves. The interval ping is missed. Their 4th action ping is rejected. The client auto-probes up to 3 times. If the third probe succeeds, the game reappears with 3 moves and the player re-enters their 4th action. If all 3 probes fail, the "Kết nối lại" button is shown. See each game's plan document for game-specific reconnect behaviour.

### 4.4 Session Lifecycle & Reconnect Flow

**Home summary vs entry resolver**

- `GET /api/games/home` is read-only and powers HomeScreen's `Start` / `See the result` button state for the active workspace.
- `POST /api/sessions/enter?gameSlug=` is the only gameplay entrypoint that may create a session, resume one, or surface the carryover prompt.

The resolver uses the same UTC day helper as cron. `today` always means the current UTC date, not the browser locale date.

```text
HomeScreen click (intent = start | see_result)
  └─ POST /api/sessions/enter?gameSlug={gameSlug}
       body = { intent, decision? }
       Server logic (all in caller.workspaceId):
         1. Resolve active game row by slug.
         2. Resolve today's daily_level.
         3. Look up today's session.
         4. Look up yesterday's unresolved session.
         5. If intent = 'see_result' and today's session is completed:
              → return mode = show_result
         6. If intent = 'start' and yesterday's unresolved session exists:
              → if decision is missing, return mode = prompt_carryover with skipLabel
              → if decision = 'continue', return mode = resume_carryover
              → if decision = 'skip', finalize the carryover session per §7, then continue
         7. If today's session is in_progress:
              → return mode = resume_today
         8. If today's session is completed:
              → return mode = show_result
         9. If no session exists for today:
              → INSERT a new session row with freeze_count copied from the latest completed session in the same workspace/game/user
              → return mode = start_new
       Carryover is only allowed for the immediately previous UTC day. Any unresolved session older than that is stale; the server finalizes it as a missed day before allowing a new start, and never shows `Skip (Activate Freeze)` for it.
```

Client behavior:
- `show_result` routes straight to ResultScreen.
- `resume_today` and `resume_carryover` restore the active renderer immediately.
- `prompt_carryover` shows a modal asking the player to continue the old session or skip it.
- `continue` keeps the original puzzle_date; a late completion still counts if the session is still carryover-eligible.
- `skip` either consumes one freeze or resets the streak, then returns to the current-day flow.

**Why a server endpoint instead of a direct client INSERT:**
1. **Atomic read-or-create:** the server performs the level lookup and session upsert as a single coordinated operation. A client doing two separate Supabase calls (fetch level → insert session) has a window where a second tab can race the INSERT and surface a duplicate-key error the client must handle; the server handles this with one `ON CONFLICT DO NOTHING` plus a re-fetch.
2. **Single data bundle:** the server assembles and returns `{ session, level, game }` in one response. The client never stitches together three separate reads or reconciles their timestamps. This bundle flows directly into GameScreen state and onward to ResultScreen — no extra fetches anywhere.
3. **Future-proof application layer:** rate-limiting new session creation, A/B testing level assignments, workspace trial enforcement, or audit logging all have one place to live. None of those concerns can be expressed in RLS.

### 4.5 Mobile Backgrounding

When the iOS/Android WebView is backgrounded, `setInterval` is throttled or paused — both the display tick and the interval ping naturally stop. The server sees `last_ping_at` freeze. When the player returns, the connection window is expired, so the first game action ping will be rejected and the player is prompted to reconnect. No special handling needed — the standard reconnect flow applies.

### 4.6 Cheat Resistance

Because the client never reports its own `elapsed` value, timing manipulation is not possible. The server independently computes elapsed from `(now - started_at) - total_offline_gaps` using its own timestamps. A player cannot send a falsely low time. The connection window additionally means that game state cannot be advanced without maintaining a live heartbeat — batch-firing fake game action pings without the interval ping will be rejected.

---

## 5. Daily Level Generation

### 5.1 Mechanism

Three-layer system:

**Layer 1 — Date-seeded auto-generation (default)**
Each game type ships a generator function. Seed = `"${game.slug}-${puzzle_date}"` (e.g. `"word-guess-2026-06-05"`). Same seed always produces the same puzzle — deterministic, reproducible, debuggable.

**Layer 2 — Date-arithmetic level numbering**
Level numbers are derived from the game's launch date — no counter column needed. The rule:

```
level_number = days_elapsed(game.launched_at → puzzle_date) + 1
```

The canonical rule lives in the editor-owned catalog schema as an immutable database helper. `level-editor` writes and cron use that helper when persisting `daily_levels`; Mushy Game runtime never reimplements the arithmetic in app code.

```sql
-- level-editor/migrations/001_level_catalog_schema.sql
create or replace function compute_level_number(launched_at date, puzzle_date date)
returns integer
language plpgsql
immutable
as $$
begin
  if puzzle_date < launched_at then
    raise exception 'puzzleDate % is before launched_at %', puzzle_date, launched_at;
  end if;
  return (puzzle_date - launched_at) + 1;
end;
$$;
```

The first level on `launched_at` is **#1**. A level one week later is always **#7**, regardless of when the row was written or by whom.

**Why this is strictly better than an atomic counter:**
An atomic counter assigns numbers sequentially in insertion order. If the admin saves a custom level for day 14 today (day 7), the counter increments to 8 and assigns #8 to day 14. When the cron then fills days 8–13, those get #9–#14. Day 14 ends up labelled #8 while the surrounding days carry higher numbers — permanently broken ordering with no recovery.

With date arithmetic, day 14 is always #14 no matter when or how the row was created. The companion `level-editor` flow can freely customise any future date without affecting any other level's number.

`launched_at date NOT NULL` replaces `current_level_number integer` on the `games` table (see §6.2 and §12).

**Layer 3 — Companion `level-editor` custom override**
Trusted editor users can customise any upcoming date's level via the companion `level-editor` app. The flow is **preview-first, edit-second**:

1. Editor user clicks a date in `level-editor`
2. The editor opens pre-populated with the **cron-generated content for that date** — computed on-the-fly by calling the level-editor app's local copy of the generator with the date seed, without touching the DB
3. Editor user can edit the content JSON (or leave it as-is) and save — this writes an `is_custom = true` row to `daily_levels` with `level_number` sourced from the catalog schema helper
4. The cron uses `ON CONFLICT (game_id, puzzle_date) DO NOTHING`, so any date that already has a row is silently skipped

```sql
INSERT INTO daily_levels (...) VALUES (...) -- level-editor level catalog DB
ON CONFLICT (game_id, puzzle_date) DO NOTHING
```

> When saving a custom level, the companion `level-editor` backend uses the catalog schema's immutable `compute_level_number()` helper to derive `level_number` and copies `game_version`, `content_schema_version`, `generator_version`, and `rules_version` from the `games` row into the `daily_levels` row — no counter increment, no DB lock needed.

### 5.2 Level Catalog Vercel Cron (`level-editor/api/cron/generate-levels.js`)

- Schedule: `0 0 * * *` (midnight UTC) in `level-editor/vercel.json`
- Protected by `CRON_SECRET` header (Vercel built-in)
- Uses level-editor server-side Supabase credentials — no user JWT in a cron context
- Flow per active game: generate content → derive `level_number` through the editor-owned catalog schema helper → insert level with version snapshots from the `games` row → `ON CONFLICT DO NOTHING`
- Logs: `{ game, levelNumber, date, wasSkipped }` per game

```js
// level-editor/vercel.json
{
  "crons": [{ "path": "/api/cron/generate-levels", "schedule": "0 0 * * *" }]
}
```

### 5.3 Generator Functions (`src/lib/generators/`)

One file per game type, e.g. `word-guess.js`. Exports:
```js
export const gameMeta = {
  slug: 'word-guess',
  gameVersion: '1.0.0',
  contentSchemaVersion: 1,
  generatorVersion: 1,
  rulesVersion: 1,
};

export function generate(seed) { ... return content; }
```
Mushy Game and `level-editor/` each keep their own copy of the generator registry. Do not import generator files across the app boundary. The level-editor cron and preview endpoint resolve `generators[game.slug]` from the level-editor copy; Mushy Game runtime/dev helpers resolve from the Mushy Game copy. When a generator changes, update both copies and increment `generator_version` if the same seed can now produce materially different content.

#### Seeded RNG — `src/lib/utils/random.js`

All generators use a **mulberry32** seeded PRNG. This algorithm was chosen for its simplicity, speed, and good statistical properties for small-scale use. The seed string is hashed to a 32-bit integer before being fed to mulberry32.

```js
// src/lib/utils/random.js

/**
 * Simple 32-bit string hash (djb2 variant).
 * Converts a seed string into a stable 32-bit unsigned integer.
 */
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return h >>> 0; // unsigned 32-bit
}

/**
 * mulberry32 — deterministic PRNG seeded by a 32-bit integer.
 * Returns a function that produces uniform floats in [0, 1).
 * Same seed always produces the same sequence.
 *
 * @param {string} seedStr — e.g. "word-guess-2026-06-05"
 * @returns {() => number}
 */
export function seededRandom(seedStr) {
  let s = hashSeed(seedStr);
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

Usage in any generator:
```js
import { seededRandom } from '../utils/random.js';

export function generate(seed) {
  const rng = seededRandom(seed); // seed = "my-game-2026-06-05"
  const index = Math.floor(rng() * list.length);
  // ...
}
```

The same `seededRandom` implementation must be used everywhere the seed is consumed — cron, the companion level-editor preview path, and the dev helper script. Since all three call the generator function directly (never the RNG directly), consistency is guaranteed automatically.

---

## 6. Database Design

### 6.1 Deviations from original suggestion — rationale

| Original suggestion | What I'm doing | Why |
|---|---|---|
| `player_game_histories` (history only) | `player_sessions` (in-progress + completed) | Single table, single row per player per level. `status` field unifies live state and history. Disconnect recovery uses the same row — no separate active-state table. |
| Streak stored in history | Streak stored in session row at completion time | Same row, no extra join. Computed server-side to prevent manipulation. |
| `game content` in daily_levels as jsonb | Same | Agreed — flexible per game type. |
| Level displayed as `#NNN` | `level_number integer` per game (not globally unique) | Each game has independent numbering — e.g. Game A #442, Game B #100. |
| No mention of `game_state` for disconnect | Added `game_state jsonb` | Required for puzzle progress recovery. |
| No mention of catalog vs workspace scoping | Catalog tables are global (no `workspace_id`); sessions are workspace-scoped | Game content is the same for everyone; only play data is per-workspace. |
| No level generation mechanism | `launched_at` date on `games` + Vercel Cron + date-seed generator | Level numbers are derived by the editor-owned catalog schema helper and stored on `daily_levels` — no counter needed. Fully automated daily publishing with admin override capability. |

### 6.2 Table Definitions

The database schema is split by ownership:

- **Level catalog DB (`level-editor` Supabase project)** — owns `games`, `daily_levels`, editor asset metadata, and service-token metadata. Its migration file is `level-editor/migrations/001_level_catalog_schema.sql`.
- **Mushy Game runtime DB (`mushy-game` miniapp schema)** — owns `player_sessions` only. Its migration file is `mushy-game/migrations/001_mushy_game_schema.sql`.

Mushy Game runtime endpoints receive level catalog rows by calling the level-editor HTTP APIs with a read-only service token, then copy stable external IDs into `player_sessions`. Mushy Game never queries the editor-owned Supabase database directly, never stores an editor email/password, and there are no cross-project foreign keys between the two databases.
Mushy Game runtime reads the persisted `level_number` from published level rows; it never recomputes level numbering locally.

#### Level catalog DB: `games`
```sql
id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid()
slug                 text        UNIQUE NOT NULL     -- kebab-case, e.g. "my-game"
display_name         text        NOT NULL            -- Vietnamese display label, e.g. "Trò Chơi"
description          text
icon                 text                            -- ion icon name, e.g. "ion:text-outline"
is_active            boolean     DEFAULT true
launched_at          date        NOT NULL            -- date of level #1; level_number for any date = days_elapsed(launched_at → puzzle_date) + 1
has_timer            boolean     DEFAULT true        -- false = no timer shown (e.g. Wordle-style)
score_direction      text        DEFAULT 'asc'       -- 'asc' = lower is better, 'desc' = higher is better, null = unranked
game_version         text        NOT NULL DEFAULT '1.0.0' -- SemVer for this puzzle game type, independent from Mushy Game platform version
content_schema_version integer   NOT NULL DEFAULT 1  -- current content JSON shape emitted for new levels
generator_version   integer      NOT NULL DEFAULT 1  -- current deterministic generator implementation for new levels
rules_version       integer      NOT NULL DEFAULT 1  -- current scoring/win/loss semantics for new levels
created_at           timestamptz DEFAULT now()
```
Direct browser access is not required for players. The level-editor HTTP API is the only access boundary for catalog reads/writes: editor users write through password-authenticated editor sessions, and Mushy Game runtime APIs consume published level bundles through a read-only service token.

> `score_direction = null` means the game has no rankable metric — percentile cards are omitted on the result screen. Only streak card shows.

#### Level catalog DB: `daily_levels`
```sql
id           uuid        PRIMARY KEY DEFAULT gen_random_uuid()
game_id      uuid        NOT NULL REFERENCES games(id) ON DELETE CASCADE
level_number integer     NOT NULL                    -- display as "#442"
puzzle_date  date        NOT NULL                    -- the day this level is active
content      jsonb       NOT NULL                    -- flexible per game type (see §6.4)
is_custom    boolean     DEFAULT false               -- true = editor-authored override, false = auto-generated
game_version text        NOT NULL                    -- snapshot from games.game_version when this level was written
content_schema_version integer NOT NULL              -- snapshot used by renderer/editor to parse content safely
generator_version integer NOT NULL                   -- snapshot of generator implementation that produced this content
rules_version integer   NOT NULL                     -- snapshot of scoring/win/loss semantics for this level
created_at   timestamptz DEFAULT now()
UNIQUE (game_id, puzzle_date)
```
Direct browser access is not required for players. Writes come from `level-editor` cron or the `level-editor` save-override API, both of which use the editor-owned catalog schema helper to derive `level_number`. Mushy Game stores no local copy of `content`; it receives the level bundle from server-side level catalog reads.

#### Level catalog DB: `editor_service_tokens`
```sql
id              uuid        PRIMARY KEY DEFAULT gen_random_uuid()
name            text        NOT NULL                    -- e.g. "Mushy Game production read token"
token_hash      text        NOT NULL UNIQUE             -- hash/HMAC of the raw token; raw token is shown once only
token_prefix    text        NOT NULL                    -- safe display prefix, e.g. "le_read_abcd"
scopes          text[]      NOT NULL DEFAULT '{catalog:read,asset:read}'
created_by      uuid        NOT NULL REFERENCES auth.users(id)
created_at      timestamptz NOT NULL DEFAULT now()
last_used_at    timestamptz
expires_at      timestamptz
revoked_at      timestamptz
```

`editor_service_tokens` belongs to the level-editor project. It is not a Supabase Auth user and it is not a Supabase session token. A level-editor owner creates the raw token through the owner-only UI; the backend stores only a hash/HMAC and shows the raw token exactly once. Mushy Game stores the raw token in server-only deployment env vars and sends it to level-editor with `Authorization: Bearer <token>` for catalog reads.

V1 scopes:
- `catalog:read` — read active games and published/current daily level bundles needed by Mushy Game runtime APIs.
- `asset:read` — resolve short-lived view URLs for object keys referenced by published levels.

No write scopes are issued in V1. Custom level writes, asset uploads, service-token creation, revocation, and cron publishing remain level-editor-owned privileged operations.

#### Versioning model

Mushy Game uses two separate versioning layers:

- **Mushy Game platform version** — SemVer in application metadata/package/changelog. It tracks shared runtime behavior: session APIs, streak/freeze semantics, stats, the level-catalog integration contract, runtime schema shape, and shared UI shell behavior.
- **Puzzle game type version** — SemVer per `games.slug` in `games.game_version`. It tracks one puzzle type's renderer, generator, scoring copy, validation, and editor UI.

Database/runtime compatibility uses integer version columns, not SemVer:

- `content_schema_version` changes when the shape of `daily_levels.content` changes.
- `generator_version` changes when the deterministic generator algorithm or source data changes in a way that can produce materially different levels for the same seed.
- `rules_version` changes when win/loss/scoring/fairness semantics change for that puzzle type.

`games` stores the **current** versions for future levels. `daily_levels` snapshots those values when the row is created or saved, so an old published level remains interpretable even after the game type evolves.

Version bump rules:

- Platform-only change (HomeScreen, session entry, streak/freeze, stats, cron infrastructure, schema/API): bump the Mushy Game platform version only.
- Pure visual polish inside one renderer/editor with no content/state/scoring compatibility impact: bump that puzzle game's patch version only.
- Backward-compatible field added to that game's content: bump that puzzle game's minor version and increment `content_schema_version`.
- Breaking content shape change: bump that puzzle game's major version and increment `content_schema_version`; renderers/editors must still support any older `content_schema_version` present in existing `daily_levels`.
- Generator source data or deterministic algorithm change: increment `generator_version`; also bump the puzzle game's minor/major version depending on player-visible impact.
- Scoring, win/loss, timer/freeze eligibility, or fairness change for one puzzle type: increment `rules_version`; also bump the puzzle game's minor/major version depending on whether old sessions/levels can still be compared fairly.
- Adding a brand-new puzzle game through the normal plug-in path: insert a new `games` row with `game_version = '1.0.0'`, `content_schema_version = 1`, `generator_version = 1`, and `rules_version = 1`. Do **not** bump existing games' version columns. Bump the Mushy Game platform version only if the new game required platform/schema/API changes outside the normal renderer/generator/editor registration flow.
- Migration version labels such as `002_add_my_game` remain migration/audit identifiers only. They are not application or puzzle game versions.

#### Mushy Game runtime DB: `app_mushy_game.player_sessions` — Workspace-scoped
```sql
id              uuid        PRIMARY KEY DEFAULT gen_random_uuid()
workspace_id    uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE
user_id         uuid        NOT NULL REFERENCES auth.users(id)
game_id         uuid        NOT NULL                 -- external ID copied from level catalog DB; no local FK
game_slug       text        NOT NULL                 -- denormalized for routing/streak queries
level_id        uuid        NOT NULL                 -- external daily_levels.id copied from level catalog DB; no local FK
level_number    integer     NOT NULL                 -- copied from level catalog for result/history display
puzzle_date     date        NOT NULL                 -- denormalized for streak queries
game_version    text        NOT NULL                 -- copied from daily_levels snapshot
content_schema_version integer NOT NULL              -- copied from daily_levels snapshot
generator_version integer NOT NULL                   -- copied from daily_levels snapshot
rules_version   integer     NOT NULL                 -- copied from daily_levels snapshot
status          text        NOT NULL CHECK (status IN ('in_progress','completed'))
elapsed_seconds integer     NOT NULL DEFAULT 0       -- last confirmed checkpoint from client ping
game_state      jsonb                                -- current puzzle progress; preserved on completion (never cleared) so GameScreen can restore the completed board view
started_at      timestamptz NOT NULL DEFAULT now()
last_ping_at    timestamptz                          -- last time client pinged (replaces last_saved_at)
completed_at    timestamptz
streak          integer                              -- NULL while in_progress; on completion: current streak after applying win/loss/freeze rules
freeze_count    integer     NOT NULL DEFAULT 0       -- banked freeze count after this resolution, capped at 2
streak_frozen   boolean     NOT NULL DEFAULT false   -- true when this resolution consumed one freeze and preserved the streak
score           integer                              -- no-timer games: game-specific metric (e.g. attempts); NULL for timer games
created_at      timestamptz NOT NULL DEFAULT now()
UNIQUE (workspace_id, user_id, level_id)
INDEX (workspace_id, level_id)                       -- leaderboard queries
INDEX (workspace_id, user_id, game_id, puzzle_date DESC) -- streak calculation
```
RLS: uses `public.can_access_app_data` and `public.is_owner_workspace_member` helpers defined on the Mushy public database (see §12 for function origins and the full policy intent):
- **SELECT:** workspace/share-wide read via `public.can_access_app_data(workspace_id, 'mushy-game')`, so members can see leaderboard/history rows for the active scope.
- **INSERT:** workspace/share access **and** `user_id = auth.uid()`. A player can create only their own session row.
- **UPDATE:** workspace/share access **and** `user_id = auth.uid()` on both the existing row and the new row. A player can checkpoint/complete only their own session row and cannot rewrite it to another `user_id`.
- **DELETE:** direct owner-workspace members only via `public.is_owner_workspace_member(workspace_id)`. No client delete path in V1.

`freeze_count` is copied forward from the latest completed session in the same workspace/game/user. The entry resolver uses it to decide whether the carryover prompt may show `Skip (Activate Freeze)`.

> **Why `UNIQUE (workspace_id, user_id, level_id)` rather than `(user_id, game_id, puzzle_date)`?**  
> `level_id` is the stable external daily-level ID from the level catalog DB and already encodes both game + date. Keeping `workspace_id` in the uniqueness constraint makes session state workspace-scoped, so the same user can maintain independent progress in multiple workspaces without cross-workspace bleed.

### 6.3 Aggregate / Stats

All percentile and average calculations are **server-side only** (Vercel API functions):
- Avoid exposing raw times of other players to the client
- Global queries need to bypass per-workspace RLS — requires service role

### 6.4 Game Content JSON Convention (per type)

Each game type defines its own `content` JSON shape. The `type` field is required and must match the game's `slug` — used by the renderer registry to identify the game. All other fields are game-specific.

```json
// Minimal required shape
{ "type": "<game-slug>", ...game-specific fields }
```

See each game's individual plan document for its specific content schema (e.g. `plan-wordle.md §3`).

---

## 7. Streak Tracking

### 7.1 Definition
Streak is the number of consecutive UTC days on which the player resolved this game's daily puzzle successfully in the active workspace. The server materialises two values on the resolved session row:
- `streak` — consecutive-day count
- `freeze_count` — banked freezes, capped at 2

| Outcome | Streak effect | Freeze effect |
|---|---|---|
| **Win** (`score` is a positive integer) | Streak increments by 1 | If the game supports losses, `freeze_count = min(2, freeze_count + 1)`; otherwise `freeze_count = 0` |
| **Loss** (loss-capable games only) | If a freeze is available, preserve the streak; otherwise reset the streak to 0 | If a freeze is available, consume one; otherwise `freeze_count = 0` |
| **Missed day** / stale unresolved session / timer-game miss | Streak resets to 0 | `freeze_count = 0` |

A carryover session is the immediately previous UTC day's unresolved session. The player may still complete it after the next daily level launches; if they do, the completion is still credited to the original puzzle date as long as the session is still carryover-eligible.

### 7.2 Calculation (server-side, at completion)

```js
// api/sessions/complete.js — pseudo-code
// `score` is the value from the request body:
//   - positive integer = win
//   - null = loss on loss-capable games, or miss on timer games
// The calculation is anchored to the session's puzzle_date, not the wall-clock day the player clicks Complete.

const previousDate = puzzleDate - 1 day
const supportsLossPath = !game.has_timer // timer games never use the freeze bank

// Look up the immediately previous day's completed session in the same workspace
const prevSession = await db
  .from('player_sessions')
  .select('streak, freeze_count')
  .eq('workspace_id', workspaceId)
  .eq('user_id', userId)
  .eq('game_id', gameId)
  .eq('puzzle_date', previousDate)
  .eq('status', 'completed')
  .maybeSingle()

const prevStreak = prevSession?.streak ?? 0
const prevFreeze = prevSession?.freeze_count ?? 0

let streak
let freezeCount
let streakFrozen = false

if (score !== null) {
  // Win: always extend the previous completed streak; only loss-capable games bank one more freeze.
  streak = prevStreak + 1
  freezeCount = supportsLossPath ? Math.min(2, prevFreeze + 1) : 0
} else if (supportsLossPath) {
  // Loss-capable game: a loss consumes one freeze if available; otherwise reset.
  if (prevFreeze > 0) {
    streak = prevStreak
    freezeCount = prevFreeze - 1
    streakFrozen = true
  } else {
    streak = 0
    freezeCount = 0
  }
} else {
  // Timer game: a null score is a miss, not a loss. No freeze bank applies.
  streak = 0
  freezeCount = 0
}

// Write final session fields:
// status = 'completed', streak, freeze_count, streak_frozen, score, elapsed_seconds
// game_state is NOT cleared — it is preserved so GameScreen can restore the completed board view on re-entry
```

**Summary of all cases:**

| Yesterday state | Today resolution | streak | freeze_count | streak_frozen |
|---|---|---|---|---|
| Loss-capable game with no completed session yesterday | Win | 1 | 1 | false |
| Loss-capable game with no completed session yesterday | Loss | 0 | 0 | false |
| Timer-only game | Win | `N + 1` | 0 | false |
| Timer-only game | Miss | 0 | 0 | false |
| Completed yesterday with freeze bank `F` and streak `N` | Loss / skip on loss-capable game | `N` if `F > 0`, otherwise `0` | `F - 1` if `F > 0`, otherwise `0` | `true` if `F > 0`, otherwise `false` |
| Completed yesterday with freeze bank `F` and streak `N` | Win | `N + 1` | `min(2, F + 1)` | false |

### 7.3 Streak Freeze Display

`streak_frozen = true` means the server consumed one freeze and preserved the streak for a loss-capable game. ResultScreen shows the ❄️ card:
**"❄️ Đã giữ chuỗi NNN ngày"** (where NNN = preserved streak value).

`freeze_count` is the banked carryover state copied into future sessions and returned by the resolver so the carryover prompt can show `Skip (Activate Freeze)` only when the session is the immediately previous UTC day, the game supports losses, and `freeze_count > 0`. Stale unresolved sessions never get that label; timer-only games use plain `Skip` because the freeze bank does not apply.

The `streak_frozen` column in `player_sessions` stays the display flag; `freeze_count` is the bank.

---

## 8. Leaderboard / Percentile

### 8.1 Workspace scope
Member count is retrieved via `listMembers(ctx.workspaceId)` from `src/lib/members.js` — a direct `dbPublic` query on `public.workspace_members` (readable by workspace-mates via superapp mig 004 RLS). If `members.length < 10` → workspace card omitted. If completion count for this level < 2 → also omit.

```js
// src/lib/members.js — verified pattern from mushy-miniapp-orgchart
import { dbPublic } from './supabase.js';

export async function listMembers(workspaceId) {
  if (!workspaceId) return [];
  const { data, error } = await dbPublic
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspaceId);
  if (error) throw error;
  return data ?? [];
}
```

The workspace shown is always `ctx.workspaceId` (currently active workspace). "Most members" selection is not feasible — the miniapp can only see the current workspace via RLS, and `ctx` only exposes one workspace at a time.

Workspace display name: query `public.workspaces` via `dbPublic`. Fall back to formatting `ctx.workspaceSlug` if that query fails.

The rank column used in all queries switches based on `game.has_timer`:
- Timer game → rank by `elapsed_seconds` (lower is better, `score_direction = 'asc'`)
- No-timer game → rank by `score` with direction from `game.score_direction`

```sql
-- Total completions in workspace
SELECT COUNT(*) AS total
FROM app_mushy_game.player_sessions
WHERE level_id = $levelId AND workspace_id = $workspaceId AND status = 'completed';

-- Players who beat me (direction-aware):
-- asc  (lower better): elapsed_seconds < $myValue  OR  score < $myValue
-- desc (higher better): score > $myValue
SELECT COUNT(*) AS better
FROM app_mushy_game.player_sessions
WHERE level_id = $levelId AND workspace_id = $workspaceId
  AND status = 'completed'
  AND <rank_column> <direction_operator> $myValue;

-- percentile = (better / total) * 100
-- top X% = percentile <= X
```

If `score_direction = null` → skip both queries entirely, omit percentile cards.

### 8.2 Global scope
Same queries without `workspace_id` filter. Runs via `api/stats/global.js` using `SUPABASE_SERVICE_ROLE_KEY`. Returns only aggregates — no individual rows.

### 8.3 Percentile display logic
Thresholds checked in order: 1%, 5%, 10%, 25%, 50%. Show the best (smallest) qualifying threshold. If > 50% → omit card entirely.

### 8.4 Card text
- Global: "Top X% của tất cả mọi người"
- Workspace: "Top X% của mọi người trong" + `<workspace name>` in smaller text on second line

### 8.5 Average score display
```sql
-- Timer game
SELECT AVG(elapsed_seconds) AS avg ...

-- No-timer game
SELECT AVG(score) AS avg ...
```
Both return the result as `avg` — the generic field name used in both stats endpoints. Formatted via `scoreConfig.formatAvg({ avg })` (see §8.6) and shown in the top score card.

### 8.6 Score Display Config

Frontend-only registry — display metadata is not stored in the DB. Lives in `src/lib/app/scoreConfig.js`.

**Reference table** (pattern examples — see each game's plan document for its specific config):

| Pattern | `has_timer` | `score_direction` | Score display (large) | Average display (small) |
|---|---|---|---|---|
| _(timer game)_ | `true` | `asc` | `MM:SS` | `Trung bình: MM:SS` |
| _(attempt-count game)_ | `false` | `asc` | `{score} / {max} lần thử` | `Trung bình: {avg} lần thử` |
| _(point game)_ | `false` | `desc` | `{score} điểm` | `Trung bình: {avg} điểm` |
| _(unranked game)_ | `false` | `null` | _(score card omitted)_ | _(n/a)_ |

**Config structure:**
```js
// src/lib/app/scoreConfig.js

// Timer games share one config — no per-slug entry needed
export const TIMER_SCORE_CONFIG = {
  formatScore: ({ elapsed })        => formatMMSS(elapsed),
  formatAvg:   ({ avg })            => `Trung bình: ${formatMMSS(Math.round(avg))}`,
};

// No-timer game configs keyed by game slug
// Each game type that is no-timer + ranked adds an entry here.
// See each game's plan document for its specific formatScore / formatAvg implementation.
// See §17.5 for the full config contract.
export const SCORE_CONFIG = {
  // e.g. 'my-game': { formatScore: ..., formatAvg: ... }
};

// Returns the right config, or null if unranked
export function getScoreConfig(gameSlug, hasTimer) {
  if (hasTimer) return TIMER_SCORE_CONFIG;
  return SCORE_CONFIG[gameSlug] ?? null; // null → omit score card
}
```

`{content}` is `level.content` (e.g. `{ maxAttempts: 6 }` for `word-guess`) — the result screen already has the level record, so this is passed through without an extra fetch.

---

## 9. Component & File Structure

```
src/
├── App.jsx                           ← router state machine + AppContext
├── App.css
├── screens/
│   ├── HomeScreen.jsx                ← game catalog, resume badges
│   ├── GameScreen.jsx                ← timer + renderer + ping loop
│   └── ResultScreen.jsx              ← time card + stat cards
├── components/
│   ├── GameCard.jsx                  ← card on HomeScreen
│   ├── Timer.jsx                     ← MM:SS display (receives elapsed, running props)
│   ├── StatCard.jsx                  ← generic stat card (icon, label, value)
│   ├── PercentileCard.jsx            ← "Top X%" card (scope = 'global' | 'workspace')
│   ├── StreakCard.jsx                ← streak + freeze display
│   ├── renderers/
│   │   ├── index.js                  ← registry: gameSlug → renderer component (see §17.4)
│   │   └── <GameSlug>Renderer.jsx    ← one file per game type; see each game's plan document
└── lib/
    ├── context.js                    ← getContext(): reads window.__APP_CONTEXT__ or VITE_DEV_* fallback (see §0.3)
    ├── supabase.js                   ← db (app schema) + dbPublic (public schema) lazy-proxy clients (see §0.3)
    ├── members.js                    ← listMembers(workspaceId): dbPublic query on public.workspace_members (see §8.1)
    ├── app/
    │   ├── levels.js                 ← fetch today's levels for all games
    │   ├── session.js                ← call enter / ping / complete session (no direct DB writes — all via API)
    │   └── stats.js                  ← call workspace + global stats endpoints
    └── generators/
        ├── index.js                  ← registry: gameSlug → generator fn (see §17.3)
        ├── <game-slug>.js            ← one file per game type; see each game's plan document
        └── word-guess-constants.js   ← MIN_WORD_LENGTH / MAX_WORD_LENGTH; duplicate into level-editor and keep aligned

api/
├── _verify.js                        ← existing JWT verify helper
    ├── sessions/
    │   ├── enter.js                      ← POST: resolve today's level/session or carryover prompt
    │   ├── ping.js                       ← POST: checkpoint elapsed + game_state
    │   └── complete.js                   ← POST: finalize session, compute streak + freeze bank
├── stats/
│   ├── workspace.js                  ← GET: workspace percentile + avg
│   └── global.js                     ← GET: global percentile + avg (service role)

migrations/
├── 000_init_example.sql              ← preserved template example; do not submit as Mushy Game migration
└── 001_mushy_game_schema.sql         ← runtime schema only: player_sessions + RLS (no games/daily_levels)

scripts/
├── seed.js                           ← dev only: insert test game row into _dev schema (not a level creation path)
├── setup.js                          ← existing (unchanged)
├── refresh-token.js                  ← existing (unchanged)
└── generate-level.js                 ← dev helper: preview generated content for any date+game (same logic as the companion level-editor preview path)

vercel.json                           ← runtime miniapp deploy config; no daily-level cron here
mushy.config.json                     ← slug ("mushy-game"), Supabase URL + anon key; schema derived as app_mushy_game (prod) / app_mushy_game_dev (dev)

level-editor/                         ← sibling project, separate deploy, owns level authoring + service-token management
├── package.json
├── vercel.json                       ← Vercel Cron for level catalog publishing
├── migrations/
│   └── 001_level_catalog_schema.sql  ← games + daily_levels + editor_assets + level_asset_refs + editor_service_tokens
├── src/
│   ├── App.jsx                       ← calendar + editor UI + owner settings
│   ├── lib/
│   │   ├── levelCatalog.js           ← level-editor-only level catalog API helper
│   │   ├── editorAssets.js           ← level-editor-only R2 asset API helper; do not import or edit mushy-game/src/lib/storage.js
│   │   └── serviceTokens.js          ← owner-only service-token API helper
│   └── components/
│       ├── editors/
│       │   └── <GameSlug>LevelEditor.jsx
│       ├── fields/                   ← shared field primitives + JSON fallback
│       └── settings/
│           └── ServiceTokensPanel.jsx
└── api/
    ├── levels/                       ← preview / save / clear override / duplicate check
    ├── assets/                       ← R2 presign / complete / list / archive-delete for editor-owned image assets
    ├── service-tokens/               ← owner-only create/list/revoke read service tokens
    └── cron/
        └── generate-levels.js        ← auto-insert daily_levels into level catalog DB
```

---

## 10. API Endpoints

### `GET /api/games/home`
- Auth: `_verify.js`
- **Required header:** `x-workspace-id: <ctx.workspaceId>` — same workspace context as the rest of the app.
- Returns the current workspace's home summary for all active games, including today's level and the primary button state (`Start` or `See the result`).
- Server reads published game/level data from the level-editor HTTP APIs using `LEVEL_EDITOR_SERVICE_TOKEN`; Mushy Game does not have local `games` or `daily_levels` tables and does not connect directly to the editor-owned Supabase project.
- Read-only. No session rows are created or mutated here.

### `POST /api/sessions/enter?gameSlug=`
- Auth: `_verify.js`
- **Required headers:** `Authorization: Bearer <ctx.token>` and `x-workspace-id: <ctx.workspaceId>` — same as all other Mushy Game API calls. The server derives `workspace_id` for any INSERT from the `x-workspace-id` header, not from the JWT alone.
- Query param: `gameSlug` — the `slug` value from the level catalog `games` table (e.g. `word-guess`)
- Body: `{ intent: 'start' | 'see_result', decision?: 'continue' | 'skip' }`
- Server steps:
  1. Fetch `games` row for `gameSlug` from the level-editor HTTP APIs using `LEVEL_EDITOR_SERVICE_TOKEN` (must be `is_active = true`); return 404 if not found.
  2. Fetch `daily_levels` row from the level-editor HTTP APIs where `game_id = game.id AND puzzle_date = today`; return 503 if today's level has not been generated yet.
  3. Look up today's session.
  4. Look up the immediately previous unresolved session in the same workspace (`puzzle_date = yesterday UTC`, `status = 'in_progress'`).
  5. If `intent = 'see_result'` and today's session is completed, return `mode = 'show_result'`.
  6. If `intent = 'start'` and yesterday's unresolved session exists:
     - if `decision` is missing, return `mode = 'prompt_carryover'` with `freezeCount` + `skipLabel`
     - if `decision = 'continue'`, return `mode = 'resume_carryover'`
     - if `decision = 'skip'`, finalize that carryover session using §7, then continue
  7. If today's session is in_progress, return `mode = 'resume_today'`.
  8. If today's session is completed, return `mode = 'show_result'`.
  9. If no session exists for today, INSERT a `player_sessions` row with caller identity plus copied level-catalog identifiers (`game_id`, `game_slug`, `level_id`, `level_number`, `puzzle_date`, version snapshots), `status = 'in_progress'`, `elapsed_seconds = 0`, `game_state = null`, and `freeze_count` copied from the latest completed session in the same workspace/game/user, then return `mode = 'start_new'`.
- Carryover is only allowed for the immediately previous UTC day. Any unresolved session older than that is stale; the server finalizes it as a missed day before allowing a new start, and never shows `Skip (Activate Freeze)` for it.
- `skipLabel = 'Skip (Activate Freeze)'` only when the carryover session is the immediately previous UTC day, the game supports a loss path, and `freeze_count > 0`; otherwise `Skip`.
- Returns `{ mode, session, level, game, carryover? }`, where `carryover` includes `freezeCount` and the skip label when a prompt is needed.
- This is the **only** endpoint that writes to `player_sessions` for session creation or carryover resolution — no client-side INSERT.

### `POST /api/sessions/ping`
- Auth: `_verify.js`
- Body (interval ping): `{ levelId }` — no game state
- Body (game action ping): `{ levelId, gameState }`
- Checks session exists + `status = 'in_progress'` + belongs to caller in the active workspace (`session.workspace_id = caller.workspaceId` and `session.user_id = caller.userId`). RLS also enforces workspace- and caller-owned UPDATE on `player_sessions`.
- **Connection window check** (game action ping only): if `last_ping_at` is older than `PING_INTERVAL_MS`, reject immediately:
  - Returns: `{ ok: false, reason: 'disconnected', message: 'Server disconnected. Please reconnect again.' }`
- On success: atomically UPDATE the unified checkpoint object:
  - `elapsed_seconds = previous_elapsed_seconds + (now - last_ping_at)` — accumulates only confirmed connected time; offline gaps are excluded naturally (see §4.2)
  - `last_ping_at = now()`
  - `game_state` — updated only on game action pings; unchanged on interval pings
- Returns: `{ ok: true }` — intentionally minimal

### `POST /api/sessions/complete`
- Auth: `_verify.js`
- Body: `{ levelId, score }` — `score` is the value returned by the renderer's `onComplete(score)` call; `null` for timer games (elapsed is the metric) and for failure states in no-timer games; a positive integer for successful no-timer games
- Server computes final `elapsed_seconds` from its own timestamps (no client-reported elapsed)
- Computes streak + freeze bank from the immediately previous completed session in the same workspace/game/user, anchored to the session's `puzzle_date`
- UPDATE: `status = 'completed'`, `completed_at`, `elapsed_seconds` (server-computed), `score` (from body), `streak`, `freeze_count`, `streak_frozen` — **`game_state` is NOT updated/cleared**; it retains the last committed game action checkpoint so GameScreen can restore the completed board on re-entry (Case C in §4.4)
- Returns: `{ sessionId, streak, freezeCount, streakFrozen }`

### `GET /api/stats/workspace?levelId=&sessionId=`
- Auth: `_verify.js`
- Verifies `sessionId` belongs to caller + is completed. This endpoint may aggregate other visible rows for the same workspace/level, but the caller's own completed session is the authorization anchor.
- Returns: `{ avg, percentile, totalCompletions, workspaceName, workspaceMemberCount }`
- `avg` is `AVG(elapsed_seconds)` for timer games and `AVG(score)` for no-timer games — the caller uses `scoreConfig.formatAvg({ avg })` for display; the field name is generic to cover both cases

### `GET /api/stats/global?levelId=&sessionId=`
- Auth: `_verify.js` + service role for query
- Returns: `{ avg, percentile, totalCompletions }`
- `avg` follows the same timer/no-timer convention as the workspace endpoint
- Never returns individual rows or user-identifiable data

### Companion `level-editor` API and cron surface

Mushy Game intentionally does **not** expose level-authoring endpoints or daily-level publishing cron. The following routes belong to the separate `level-editor` deployment instead:
- `GET /api/catalog/games?slug=&active=`
- `GET /api/catalog/daily-level?gameSlug=&puzzleDate=`
- `GET /api/levels?gameId=&from=&to=`
- `GET /api/levels/preview?gameId=&puzzleDate=`
- `POST /api/levels`
- `DELETE /api/levels?gameId=&puzzleDate=`
- `GET /api/levels/check-duplicate?gameId=&answer=`
- `GET /api/assets?gameSlug=&q=&tag=`
- `POST /api/assets/view-url`
- `POST /api/assets/presign`
- `POST /api/assets/:id/complete`
- `DELETE /api/assets/:id`
- `GET /api/service-tokens`
- `POST /api/service-tokens`
- `POST /api/service-tokens/:id/revoke`
- `GET /api/cron/generate-levels`

Those routes own:
- service-token-authenticated published catalog reads for Mushy Game runtime APIs
- upcoming-level calendar queries
- previewing generator output for a date without writing
- saving / clearing `is_custom` overrides
- game-specific duplicate detection such as Wordle answer reuse checks
- editor-owned R2 image asset import, reuse, archive/delete, and ref-count tracking
- owner-only service-token creation/list/revocation
- daily level generation and catalog publishing

The contract is mirrored through duplicated generator logic (`generators[game.slug]`) and the editor-owned catalog schema's immutable `level_number` helper so the companion app stays consistent with Mushy Game publishing. Mushy Game only consumes persisted `level_number` values from published level rows.

Auth split:
- Runtime catalog reads (`/api/catalog/*` and published asset view-url reads) accept `Authorization: Bearer <LEVEL_EDITOR_SERVICE_TOKEN>` and require the relevant service-token scope. They return only active/published data that Mushy Game needs to start or resume gameplay.
- Editor management routes (`/api/levels/*`, upload/presign asset routes, duplicate checks, and asset library management) require a password-authenticated level-editor Supabase user session.
- Owner-only routes (`/api/service-tokens/*`) require a password-authenticated owner account in the level-editor app.
- Cron uses Vercel `CRON_SECRET`, not a user session and not a service token.

Mushy Game deployment env for catalog reads:
```text
LEVEL_EDITOR_API_BASE_URL=https://<level-editor-deployment>
LEVEL_EDITOR_SERVICE_TOKEN=le_read_...
```

Mushy Game sends that token only from server-side API functions:
```http
Authorization: Bearer <LEVEL_EDITOR_SERVICE_TOKEN>
```

The browser never receives level-editor credentials or service tokens.

Runtime catalog endpoint contract:
- `GET /api/catalog/games?slug=&active=` returns active game metadata needed by HomeScreen and session entry (`id`, `slug`, display metadata, timer/score/version fields). Requires `catalog:read`.
- `GET /api/catalog/daily-level?gameSlug=&puzzleDate=` returns the published daily level bundle for that game/date (`game`, `level`, `content`, version snapshots, persisted `level_number`). Requires `catalog:read`.
- Runtime catalog endpoints must not expose future draft/custom rows beyond the requested published date, editor-only audit metadata, pending assets, service-token metadata, or write capabilities.

Asset endpoint contract:
- `GET /api/assets?gameSlug=&q=&tag=` returns ready, non-archived assets visible to the editor user, including `id`, `objectKey`, a short-lived `publicUrl` for preview/rendering, `altText`, dimensions, tags, and `refCount`.
- `POST /api/assets/view-url` accepts `{ objectKey }`, verifies the caller can read the referenced asset, and returns `{ publicUrl, expiresAt }`. Editor sessions can use it for previews; service tokens can use it only with `asset:read` and only for object keys referenced by published levels.
- `POST /api/assets/presign` accepts `{ fileName, mimeType, sizeBytes, gameSlug?, altText?, tags? }`, validates the authenticated editor session + content type + size, creates an `editor_assets` row with a pending/ready marker, and returns `{ assetId, objectKey, uploadUrl, headers? }`. It does not return or persist a view URL.
- Preview/rendering code asks the editor-owned Supabase/storage helper for a short-lived view URL from `objectKey` only when display is needed, following the `mushy-game/src/lib/storage.js` pattern.
- The browser uploads the file directly to the returned R2 presigned URL. R2 credentials never reach the browser.
- `POST /api/assets/:id/complete` verifies/finalizes the asset after upload and makes it selectable. The endpoint may inspect image dimensions if the implementation supports it; otherwise dimensions can remain null.
- `DELETE /api/assets/:id` checks `level_asset_refs`. If referenced, set `archived_at` only. If unreferenced, delete the R2 object and then delete or archive the metadata row.
- `POST /api/levels` must update `level_asset_refs` from the saved content. Because `level-editor` and Mushy Game use separate Supabase projects, do not rely on cross-project foreign keys; store denormalized `{ asset_id, game_slug, puzzle_date, level_id?, content_path }` refs.

### Owner Service-Token UI and API

`level-editor` includes an owner-only Settings area for creating and managing service tokens used by backend consumers such as Mushy Game.

Owner account model:
- Owner accounts are normal level-editor Supabase Auth users.
- V1 owner bootstrap is server-side and manual, for example `LEVEL_EDITOR_OWNER_USER_IDS` or `LEVEL_EDITOR_OWNER_EMAILS` on the level-editor deployment.
- Do not use user-editable `user_metadata` for owner checks. If the project later moves owner state into Supabase Auth claims, use server-controlled `app_metadata` or a dedicated owner table.
- Non-owner editor users can author levels and assets, but cannot list, create, or revoke service tokens.

Settings UI:
- Add a `ServiceTokensPanel` visible only to owner accounts.
- The panel lists existing tokens by safe metadata only: `name`, `tokenPrefix`, `scopes`, `createdAt`, `lastUsedAt`, `expiresAt`, and `revokedAt`.
- The raw token is never shown after creation.
- Create form fields: `name`, fixed/read-only scopes (`catalog:read`, `asset:read`), optional expiry.
- On create, the API returns the raw token exactly once. The UI shows a one-time copy box with instructions to store it in the Mushy Game deployment env as `LEVEL_EDITOR_SERVICE_TOKEN`.
- Revoke action sets `revoked_at`; it does not delete the row, so audit/history remains visible.
- Rotation is create-new-token → update Mushy Game env/redeploy → revoke-old-token.

Service-token API contract:
- `GET /api/service-tokens` — owner-only; returns token metadata, never raw token or token hash.
- `POST /api/service-tokens` — owner-only; creates a random raw token with prefix such as `le_read_`, stores only `token_hash`, and returns `{ token, tokenMeta }` once.
- `POST /api/service-tokens/:id/revoke` — owner-only; sets `revoked_at`.

Service-token validation:
- Implement a level-editor server helper such as `requireServiceToken(scope)` for runtime catalog endpoints.
- Hash/HMAC the presented token and compare against `editor_service_tokens.token_hash` using constant-time comparison where available.
- Reject missing, revoked, expired, or insufficient-scope tokens.
- Update `last_used_at` after successful validation.
- Never use the level-editor Supabase `service_role` key in a browser and never store a Supabase Auth refresh token in Mushy Game env.

### `GET /api/cron/generate-levels`
- Auth: Vercel `CRON_SECRET` header (not JWT)
- Lives in the `level-editor` deployment and writes to the level catalog database.
- Uses level-editor server-side Supabase credentials, never a browser key.
- Per active game: generate content → derive `level_number` through the editor-owned catalog schema helper → copy version snapshots from `games` → INSERT ON CONFLICT (game_id, puzzle_date) DO NOTHING (skips dates already customised in the companion level-editor flow)
- Returns: `{ results: [{ game, levelNumber, date, skipped }] }`

---

## 11. Service Role Key Usage

The Mushy Game runtime deployment uses `SUPABASE_SERVICE_ROLE_KEY` in exactly **one** place — server-side only, never exposed to client:

| File | Why service role is needed | What it does |
|---|---|---|
| `api/stats/global.js` | Cross-workspace aggregate query bypasses per-workspace RLS | Returns COUNT + AVG only — no row-level data |

All other Mushy Game runtime API endpoints use the caller's JWT + standard RLS for Mushy Game data. When those endpoints need published catalog data, they call the level-editor HTTP API with `LEVEL_EDITOR_SERVICE_TOKEN`; they do not use the level-editor Supabase service role key, a Supabase Auth refresh token, or an editor email/password. Level catalog cron/write credentials belong to the separate `level-editor` deployment and are documented with `level-editor/migrations/001_level_catalog_schema.sql`.

---

## 12. Migration (`migrations/001_mushy_game_schema.sql`)

This is the real first Mushy Game migration. `migrations/000_init_example.sql` stays in the repo as a preserved template/example and must not be submitted as an app migration.

### RLS helpers — origin and availability

The two helper functions used in `player_sessions` RLS are **defined on the Mushy public database** (not in this mini-app's schema). They are created and maintained by the Mushy platform team in the canonical `public` schema migration:

| Function | Defined in | Purpose |
|---|---|---|
| `public.can_access_app_data(workspace_id, app_slug)` | Mushy public DB (superapp mig 049) | Returns TRUE if the calling user is a direct member of `workspace_id` OR a member of a follower workspace that has a share grant for `app_slug`. Falls back to direct-member-only if no grants exist. |
| `public.is_owner_workspace_member(workspace_id)` | Mushy public DB (superapp mig 049) | Returns TRUE if the calling user is a **direct** member of `workspace_id`. Follower-workspace members return FALSE. |

See `migrations/000_init_example.sql` for a working example of both helpers in action.

`migrations/001_mushy_game_schema.sql` only creates Mushy Game runtime/player tables. It must not create `games`, `daily_levels`, `editor_assets`, `level_asset_refs`, or `editor_service_tokens`; those live in `level-editor/migrations/001_level_catalog_schema.sql`.

### Player sessions — workspace-readable, caller-owned writes
`player_sessions` is both the player's mutable game state and the source for workspace leaderboard/history display. The RLS boundary is therefore intentionally asymmetric:

- **SELECT:** allow direct members and share-grant followers through `public.can_access_app_data(workspace_id, 'mushy-game')`. Members should be able to read other members' completed scores and in-progress/resume status for leaderboard and home-card display.
- **INSERT:** require `public.can_access_app_data(workspace_id, 'mushy-game')` **and** `user_id = auth.uid()`. Even though `POST /api/sessions/enter` sets `user_id` server-side, the database must reject attempts to create a session for another player.
- **UPDATE:** require `public.can_access_app_data(workspace_id, 'mushy-game')` **and** caller ownership on both sides of the update. In practice: the existing row must belong to `auth.uid()`, and the updated row must still have `user_id = auth.uid()`. This prevents one member from checkpointing, completing, or reassigning another member's session.
- **DELETE:** use `public.is_owner_workspace_member(workspace_id)` only. There is no client delete flow in V1; if any maintenance delete is added later, it must be a deliberate backend maintenance action.

Do not document or implement `player_sessions_insert` / `player_sessions_update` as workspace-only policies. API-level checks like "session belongs to caller" are required, but RLS is the final backstop.

> **Note:** §0.3 of this document describes the *raw inline subquery* pattern used by older miniapps that predate superapp mig 049. `mushy-game` is a new miniapp built after mig 049 and uses the helper functions above. `migrations/000_init_example.sql` is useful for generic helper usage, but `player_sessions` is stricter than the generic example because writes are additionally caller-owned (`user_id = auth.uid()`). The raw subquery in §0.3 is provided for reference on what the helpers do internally, not as the migration pattern to follow here.

### Realtime
No `-- @realtime` marker on any table. Results are fetched once on ResultScreen mount — no live updates needed.

### Seed script (`scripts/seed.js`)
Mushy Game's runtime seed script must not insert `games` or `daily_levels`; those tables are not in the Mushy Game database anymore. Dev catalog data belongs to the level-editor project and is created through `level-editor/migrations/001_level_catalog_schema.sql`, the level-editor seed path, or the level-editor cron.

Published levels are created via one of two level-editor-owned paths:
- **Cron** (`level-editor/api/cron/generate-levels.js`) — auto-generates at midnight UTC
- **Companion `level-editor` backend** — saves a custom level (optionally after editing the cron-generated preview)

> **Production `games` rows** are never inserted by Mushy Game runtime scripts. Any new game type added to production must be registered in the level catalog migration flow — not via the Mushy Game seed script and not via the Supabase dashboard.

---

## 13. State Flow Diagrams

### HomeScreen lifecycle
```
mount
  │
  └─ GET /api/games/home
       │   returns per-game home summary for the active workspace
       │
       ├─ button state = Start
       │     → click navigates to GameScreen with intent = 'start'
       │
       └─ button state = See the result
             → click navigates to GameScreen with intent = 'see_result'
```

### GameScreen lifecycle
```
mount
  │
  └─ POST /api/sessions/enter?gameSlug={gameSlug}
       body = { intent, decision? }
       │   returns mode = start_new | resume_today | resume_carryover | prompt_carryover | show_result
       │
       ├─ mode = prompt_carryover:
       │     → show dialog with carryoverSession + skipLabel + freezeCount
       │     → continue = resume_carryover
       │     → skip = POST /api/sessions/enter?gameSlug={gameSlug} body = { intent: 'start', decision: 'skip' }
       │     → after skip finalizes the old session, continue with current-day flow
       │
       ├─ mode = start_new | resume_today | resume_carryover:
       │     → restore renderer from session.game_state (null = empty state for new session)
       │     → if game.has_timer: start/resume timer from session.elapsed_seconds
       │     → show "Cách chơi" dialog if localStorage key absent (first visit for this game slug)
       │     → begin interval ping loop
       │
       ├─ mode = show_result:
       │     → render renderer with session.game_state (completed board) — no timer, no pings, no dialog
       │     → after one animation frame, navigate to ResultScreen with bundle
       │
       └─ puzzle interaction loop (in_progress only)
              ├─ every 5s: POST /api/sessions/ping { levelId: level.id }
              ├─ on game action: POST /api/sessions/ping { levelId: level.id, gameState }  ← rejected if interval missed
              └─ on solved: POST /api/sessions/complete { levelId: level.id, score }
                             score = null for timer games and failure states; integer for successful no-timer games
                             → merge { streak, freezeCount, streakFrozen, status:'completed' } into bundle
                             → navigate to ResultScreen with updated bundle
```

### ResultScreen lifecycle
```
mount (receives route.bundle = { session, level, game })
  │
  ├─ score card: render immediately from bundle
  │     → session.elapsed_seconds / session.score + level.content + game.has_timer / game.score_direction
  │     → scoreConfig = getScoreConfig(game.slug, game.has_timer)
  │     → if scoreConfig === null: omit score card (unranked game)
  │
  ├─ streak card: render immediately from bundle
  │     → session.streak + session.streakFrozen
  │
  ├─ GET /api/stats/workspace?levelId={level.id}&sessionId={session.id}
  │     → { avg, percentile, totalCompletions, workspaceName, workspaceMemberCount }
  │     → render workspace percentile card (or omit if < 10 members / < 2 completions / score_direction null)
  │
  ├─ GET /api/stats/global?levelId={level.id}&sessionId={session.id}
  │     → { avg, percentile, totalCompletions }
  │     → render global percentile card (or omit if outside top 50% / score_direction null)
  │
  └─ answer reveal (game-specific — see each game's plan document for whether this applies)
```

### Cron lifecycle
```
midnight UTC
  │
  └─ for each active game:
       ├─ derive level_number through the editor-owned catalog schema helper
       ├─ INSERT daily_level with game_version/content_schema_version/generator_version/rules_version snapshots
       │     ON CONFLICT (game_id, puzzle_date) DO NOTHING
       │     ├─ conflict (level-editor pre-inserted override) → log { skipped: true }
       │     └─ inserted → log { skipped: false, levelNumber }
       └─ log result
```

---

## 14. Design System Notes

Following Mushy v3.0 tokens per CLAUDE.md §6:
- Game cards: `.mushy-card--v3` with `.mushy-app-icon` (ion icon)
- Timer: `--font-display`, `--fs-xxl`, `var(--ink)` — large and prominent
- Stat cards: `.mushy-info-row` label/value layout
- Global percentile card: `--brand` / `--brand-soft` highlight for top-1% achievement
- Streak card: `#FF9500` (`--warn-v3`) for 🔥; `--info` blue for ❄️ freeze
- If the companion `level-editor` app is built with the same design system, it should reuse `Select` (no native `<select>`) and dialog patterns for confirmations — but that UI does not live inside Mushy Game itself
- All user-facing copy in Vietnamese; brand names ("Mushy") kept as-is

---

## 15. Out of Scope (V1)

- **Additional game renderers** beyond `WordGuessRenderer`. Architecture is plug-and-play; see §17 for the full guide on adding a new game type.
- **Streak freeze purchase/tokens** — freeze is a banked counter for loss-capable games only: wins add 1 freeze up to a cap of 2, and losses consume one if available (see §7). Timer-only games do not use the freeze bank. A future V2 mechanic could allow players to earn extra freeze days, but this has no V1 scope.
- **Push notifications** — "come back for today's puzzle!" via `mushyApi.push()`.
- **ScopeSwitcher / cross-workspace results** — all leaderboards are per-active-workspace.
- **Result animations** — staggered card entrance, confetti for top-1%.
- **In-app level authoring UI** — Mushy Game deliberately has no owner/editor page. Level authoring lives in the sibling `level-editor` app.

---

## 16. Implementation Phases

Build `level-editor` first. It owns the level catalog, cron publishing, editor assets, and service-token boundary that Mushy Game consumes later. Mushy Game runtime work should start only after the catalog can publish levels and serve them through service-token-authenticated HTTP APIs.

### Phase 1 — Level-Editor Foundation
1. Create the workspace-root `level-editor/` project, package scripts, Vercel config, and base app shell.
2. Configure editor-owned Supabase env vars and password-based Supabase Auth for human editor login.
3. Add owner bootstrap using server-only config such as `LEVEL_EDITOR_OWNER_USER_IDS` or `LEVEL_EDITOR_OWNER_EMAILS`.
4. Add shared server auth helpers for `requireEditorSession()`, `requireOwner()`, `requireServiceToken(scope)`, and server-only Supabase access.
5. Verification: owner can log in, non-owner editor can log in if manually provisioned, owner-only endpoints reject non-owner users, and unauthenticated requests are rejected.

### Phase 2 — Level Catalog Schema
1. Write `level-editor/migrations/001_level_catalog_schema.sql`.
2. Create `games`, `daily_levels`, `editor_assets`, `level_asset_refs`, and `editor_service_tokens`.
3. Add immutable catalog helper `compute_level_number(launched_at, puzzle_date)` and ensure all catalog writes use persisted `level_number`.
4. Seed the first `games` row for `word-guess` with version snapshots and `launched_at`.
5. Verification: migrations apply cleanly in the editor-owned Supabase project; `compute_level_number()` returns #1 on launch date and rejects dates before launch; `mushy-game/migrations/001_mushy_game_schema.sql` does not define any catalog/token/asset tables.

### Phase 3 — Word-Guess Generator Data In Level-Editor
1. Add `level-editor`'s local copy of the generator registry.
2. Add `word-guess` generator, constants, seeded RNG, and generated committed word lists needed for preview/cron.
3. Keep these copies aligned with the later Mushy Game generator copy; do not import generator files across the app boundary.
4. Add a dev preview helper or route that can generate `word-guess` content for any date without writing.
5. Verification: the same date seed always returns the same content; generated content passes the Wordle content invariants from `plan-wordle-v1.md`; changing generator output requires a `generator_version` bump.

### Phase 4 — Level-Editor Level APIs And UI
1. Implement calendar/upcoming-level UI in `level-editor/src/App.jsx`.
2. Implement `/api/levels?gameId=&from=&to=`, `/api/levels/preview?gameId=&puzzleDate=`, `POST /api/levels`, `DELETE /api/levels?gameId=&puzzleDate=`, and `/api/levels/check-duplicate?gameId=&answer=`.
3. Implement JSON fallback editing for any game type.
4. Implement `WordGuessLevelEditor.jsx` with word length, max attempts, answer autocomplete, live preview, validation, and duplicate detection.
5. Verification: editor can preview a generated future date, save a custom override, reload it, clear it, and see duplicate Wordle notices; invalid content blocks save.

### Phase 5 — Level-Editor Asset Workflow
1. Implement `editor_assets` and `level_asset_refs` access through `level-editor/src/lib/editorAssets.js`.
2. Implement `/api/assets`, `/api/assets/presign`, `/api/assets/:id/complete`, `/api/assets/:id`, and `/api/assets/view-url`.
3. Store `imageObjectKey` in level content; never persist `publicUrl` or `imageAssetId` in level content.
4. Resolve short-lived view URLs from `objectKey` only when preview/runtime display needs them.
5. Verification: editor can upload, complete, preview, reuse, clear, archive, and hard-delete only unreferenced assets; saved levels keep object keys stable and old published levels remain renderable.

### Phase 6 — Service Tokens And Runtime Catalog API
1. Implement owner-only `ServiceTokensPanel`.
2. Implement `GET /api/service-tokens`, `POST /api/service-tokens`, and `POST /api/service-tokens/:id/revoke`.
3. Store only hashed/HMACed tokens in `editor_service_tokens`; show raw token exactly once.
4. Implement service-token-authenticated runtime catalog endpoints: `GET /api/catalog/games?slug=&active=` and `GET /api/catalog/daily-level?gameSlug=&puzzleDate=`.
5. Allow `asset:read` service tokens to call `/api/assets/view-url` only for object keys referenced by published levels.
6. Verification: owner can create/revoke a token; raw token cannot be recovered after creation; revoked/expired/wrong-scope tokens fail; valid token can read active game metadata, today's published level bundle, and published asset view URLs.

### Phase 7 — Level Catalog Cron
1. Implement `level-editor/api/cron/generate-levels.js`.
2. Add `level-editor/vercel.json` cron config.
3. Cron iterates active games, calls the local generator copy, derives persisted `level_number` through the catalog helper, snapshots version fields, and uses `ON CONFLICT (game_id, puzzle_date) DO NOTHING`.
4. Verification: cron can be run manually with `CRON_SECRET`; it inserts missing levels, skips custom overrides, returns per-game results, and never rewrites old/custom level content.

### Phase 8 — Level-Editor End-To-End Acceptance
1. Run through the full owner/editor workflow: login, create service token, generate preview, save custom Wordle level, upload/reuse image asset if applicable, run cron, read catalog with service token.
2. Record the required Mushy Game env values: `LEVEL_EDITOR_API_BASE_URL` and `LEVEL_EDITOR_SERVICE_TOKEN`.
3. Freeze the HTTP response shapes for `GET /api/catalog/games` and `GET /api/catalog/daily-level`.
4. Verification: a standalone script or HTTP client can fetch the same catalog bundle Mushy Game will need, without any Mushy Game database or frontend code.

### Phase 9 — Mushy Game Runtime Schema And Catalog Client
1. Write `mushy-game/migrations/001_mushy_game_schema.sql` for `player_sessions` only.
2. Add Mushy Game server helper for calling level-editor with `LEVEL_EDITOR_API_BASE_URL` and `LEVEL_EDITOR_SERVICE_TOKEN`.
3. Implement `src/lib/app/levels.js` and `GET /api/games/home` using level-editor catalog APIs.
4. Verification: HomeScreen data can be fetched from a real level-editor deployment; Mushy Game never queries the editor-owned Supabase database directly.

### Phase 10 — Mushy Game Gameplay Runtime
1. Implement `Timer.jsx`.
2. Implement `api/sessions/enter.js`, `api/sessions/ping.js`, and `api/sessions/complete.js`.
3. Implement `src/lib/app/session.js`.
4. Implement `GameScreen.jsx` with ping loop, reconnect logic, and "How to play" dialog.
5. Implement the first runtime `WordGuessRenderer.jsx`.
6. Verification: player can start, resume, reconnect, complete, and reopen today's Wordle level using content fetched from level-editor.

### Phase 11 — Result, Stats, And Polish
1. Implement `api/stats/workspace.js`, `api/stats/global.js`, and `src/lib/app/stats.js`.
2. Implement `ResultScreen.jsx` with score card, percentile cards, streak/freeze card, and game-specific answer reveal where applicable.
3. Run end-to-end disconnect recovery, carryover, freeze-bank, stale-session, first-level, no-completion, and workspace-size edge cases.
4. Verification: no individual global rows are exposed, workspace stats respect visibility, and all user-facing Vietnamese copy/design-system polish is reviewed.

---

## 17. How to Add a New Game Type

The platform is designed so that adding a new game type touches **exactly 4 runtime files** and requires **1 level-catalog DB row**. No changes to shared infrastructure (GameScreen, ping system, cron, stats, leaderboard) are needed.

### 17.1 Checklist

| Step | What | Where |
|---|---|---|
| 1 | Insert a `games` row | `level-editor/migrations/00X_add_<slug>.sql` |
| 2 | Write the generator | `src/lib/generators/<slug>.js` + register |
| 3 | Write the renderer | `src/components/renderers/<Slug>Renderer.jsx` + register |
| 4 | Add score display config | `src/lib/app/scoreConfig.js` (no-timer ranked games only) |
| 5 | Optional: extend the companion level-editor UI | `level-editor/src/components/editors/<Slug>LevelEditor.jsx` + register _(omit to use JSON fallback in `level-editor`)_ |

The cron, companion level-editor preview flow, ping loop, reconnect flow, streak, and leaderboard all work automatically via the `slug` stored on the session/level rows.

---

### 17.2 Step 1 — Insert a `games` Row

Add an `INSERT` statement to a `level-editor` migration file. Game catalog rows live in the level catalog database, not in the Mushy Game runtime schema.

```sql
-- Add to a new level-editor migration file (e.g. level-editor/migrations/002_add_my_game.sql)
INSERT INTO games
  (
    slug, display_name, description, icon, is_active, has_timer, score_direction,
    game_version, content_schema_version, generator_version, rules_version
  )
VALUES
  (
    'my-game', 'Tên Trò Chơi', 'Mô tả trò chơi.', 'ion:game-controller-outline', true, false, 'asc',
    '1.0.0', 1, 1, 1
  );
```

| Column | Notes |
|---|---|
| `slug` | kebab-case, unique, used as the key everywhere — registries, seed, URLs |
| `display_name` | Vietnamese UI label shown on HomeScreen card |
| `icon` | Ion icon name (see §14 for design system) |
| `has_timer` | `true` = timer shown + elapsed ranked; `false` = no timer, ranked by `score` |
| `score_direction` | `'asc'` lower is better, `'desc'` higher is better, `null` = unranked (no percentile cards) |
| `game_version` | Start new puzzle types at `1.0.0`; bump only for this game type's renderer/generator/scoring/editor evolution |
| `content_schema_version` | Start at `1`; increment when this game's `daily_levels.content` shape changes |
| `generator_version` | Start at `1`; increment when this game's deterministic generator/source data changes materially |
| `rules_version` | Start at `1`; increment when this game's win/loss/scoring/fairness semantics change |

The new game appears on HomeScreen automatically once `is_active = true`. Adding a new game does **not** bump existing games' version columns. It bumps the Mushy Game platform version only if the game required platform/schema/API changes beyond the normal plug-in path.

---

### 17.3 Step 2 — Write the Generator

Create `src/lib/generators/<slug>.js`. Must export a single `generate(seed)` function that returns a `content` object matching the game's JSON convention (see §6.4).

```js
// src/lib/generators/my-game.js

export const gameMeta = {
  slug: 'my-game',
  gameVersion: '1.0.0',
  contentSchemaVersion: 1,
  generatorVersion: 1,
  rulesVersion: 1,
};

/**
 * Generates a puzzle deterministically from a seed string.
 * Same seed always produces the same puzzle.
 *
 * @param {string} seed  — format: "<slug>-<YYYY-MM-DD>", e.g. "my-game-2026-06-05"
 * @returns {object}     — content object stored in daily_levels.content
 */
export function generate(seed) {
  // Use seed to drive a deterministic RNG
  // Return a content object whose shape matches this game's content schema
  return {
    type: 'my-game',
    // ...game-specific fields
  };
}
```

Then register it in the generator index:

```js
// src/lib/generators/index.js
import { generate as existingGame, gameMeta as existingGameMeta } from './existing-game.js';
import { generate as myGame,       gameMeta as myGameMeta }       from './my-game.js';       // ← add this

export const generators = {
  'existing-game': existingGame,
  'my-game':       myGame,                                     // ← add this
};

export const generatorMetas = {
  'existing-game': existingGameMeta,
  'my-game':       myGameMeta,                                 // ← add this
};
```

The level catalog cron (`level-editor/api/cron/generate-levels.js`) and the companion level-editor preview endpoint both look up `generators[game.slug]` from the level-editor copy — no changes needed in that app once it is registered there. The migration values inserted into the level catalog `games` table must match the `gameMeta` values in code; `daily_levels` stores version snapshots from the `games` row when cron or level-editor writes a level.

---

### 17.4 Step 3 — Write the Renderer

Create `src/components/renderers/<Slug>Renderer.jsx`. The renderer receives the following props from `GameScreen`:

```ts
interface RendererProps {
  content:    object;       // daily_levels.content for today's level (read-only)
  gameState:  object|null;  // last committed checkpoint from player_sessions.game_state
                            // null on a brand-new session
  onAction:   (nextGameState: object) => void;
                            // call this on every player action (submits a guess, places a tile, etc.)
                            // GameScreen fires the game action ping and updates the checkpoint
  onComplete: (score: number|null) => void;
                            // call this when the puzzle is solved
                            // score = null for timer games (elapsed is the metric)
                            // score = integer for no-timer games (e.g. attempt count)
}
```

**Contract rules:**
- The renderer is **display + interaction only** — it never calls the API directly
- `onAction` must be called with the **full current game state** every time the player does something — not a delta. `onAction` is for **intermediate moves only**.
- **On the move that solves the puzzle, call `onComplete` only — do not also call `onAction` for that move.** `onComplete` is the terminal signal; `onAction` is for in-progress checkpoints. Calling both on the final move would fire a redundant game-action ping before the completion request.
- `onComplete` must be called exactly once when the puzzle is over (win or loss); never called twice
- The renderer must be able to **restore itself fully from `gameState` alone** — this is what powers disconnect recovery (§4.4) and the Case C completed-board display (§4.4)
- If `gameState` is `null`, render the initial empty puzzle state
- The renderer owns no timer state and no dialog state — both are owned by `GameScreen` (see §4.1)

**`HowToPlay` named export (required):**

Each renderer file must also export a `HowToPlay` React component. `GameScreen` imports it from the renderer file and renders it inside the "Cách chơi" dialog on first visit. The component receives `content` as a prop so it can reference game-specific values (e.g. `wordLength`, `maxAttempts`).

```js
// src/components/renderers/index.js — registry includes both default and named export
import MyGameRenderer, { HowToPlay as MyGameHowToPlay } from './MyGameRenderer.jsx';

export const renderers = { 'my-game': MyGameRenderer };
export const howToPlays = { 'my-game': MyGameHowToPlay };
```

`GameScreen` looks up `howToPlays[game.slug]` and renders it inside the dialog shell (an **×** close button in the top corner; no other controls). The localStorage key format for tracking first-visit state is `mushy-game:how-to-play:<game-slug>` — consistent across all game types.

```jsx
// src/components/renderers/MyGameRenderer.jsx
export default function MyGameRenderer({ content, gameState, onAction, onComplete }) {
  // Restore from last checkpoint or start fresh
  const [myState, setMyState] = useState(gameState?.myField ?? initialValue);

  function handlePlayerAction(input) {
    const next = { myField: computeNext(myState, input) };
    setMyState(next.myField);

    if (puzzleIsSolved(next)) {
      // Final move: call onComplete ONLY — do NOT call onAction first.
      // onComplete is the terminal signal; onAction is for intermediate checkpoints only.
      onComplete(computeScore(next)); // ← null for timer games or failure states
    } else {
      onAction(next); // ← intermediate move only; full state, not delta
    }
  }

  return ( /* render puzzle UI */ );
}
```

Then register it in the renderer index:

```js
// src/components/renderers/index.js
import ExistingRenderer from './ExistingRenderer.jsx';
import MyGameRenderer   from './MyGameRenderer.jsx';   // ← add this

export const renderers = {
  'existing-game': ExistingRenderer,
  'my-game':       MyGameRenderer,                     // ← add this
};
```

`GameScreen` looks up `renderers[game.slug]` and renders it — no changes needed in `GameScreen.jsx`.

---

### 17.5 Step 4 — Add Score Display Config (no-timer ranked games only)

Skip this step if:
- The game is a **timer game** (`has_timer = true`) — it automatically uses `TIMER_SCORE_CONFIG`
- The game is **unranked** (`score_direction = null`) — score card is omitted, no config needed

For a no-timer ranked game, add an entry to `scoreConfig.js` (see §8.6):

```js
// src/lib/app/scoreConfig.js
export const SCORE_CONFIG = {
  // existing entries ...
  'my-game': {
    formatScore: ({ score, content }) => `${score} điểm`,    // ← game-specific format
    formatAvg:   ({ avg })            => `Trung bình: ${avg.toFixed(1)} điểm`,
  },  // ← add this
};
```

---

### 17.6 Step 5 — Extend the Companion `level-editor` App _(optional)_

Level authoring no longer lives inside Mushy Game. Instead, the sibling `level-editor` project owns a **hybrid editor system**: it ships a set of standard field components that any game can compose, and each game can optionally register a custom `LevelEditor` component. If no editor is registered for a game, the companion app falls back to a raw JSON editor pre-populated with the generated content.

---

#### 17.6.1 Fallback Behaviour (no editor registered)

If a game has no custom `LevelEditor` registered, the companion app renders its JSON fallback with the full `content` object as editable raw JSON. This is always available and requires zero effort from game authors — it is the default for any new game until a custom editor is added.

---

#### 17.6.2 `LevelEditorProps` Contract

```ts
interface LevelEditorProps {
  content:     object;                    // current content — either from preview (auto-generated)
                                          // or the existing saved level; never null
  gameSlug:    string;                    // slug string, e.g. 'word-guess' — for conditional logic
  gameId:      string;                    // UUID of the game row — pass to companion API calls
                                          // (e.g. /api/levels/check-duplicate?gameId=)
  onChange:    (nextContent: object) => void;
                                          // call on every field change; parent holds the save state
  onValidate?: (errors: string[]) => void;
                                          // optional: call with [] when valid, or [errorMsg, ...] when not
                                          // parent disables the Save button if errors.length > 0
}
```

**Contract rules:**
- The editor is **editing UI only** — it never writes to the DB directly; the companion app page owns the save action
- `onChange` must always be called with the **full updated content object** — not a partial patch
- The editor must render correctly when `content` is the auto-generated preview (first open) and when it is a previously saved custom level (re-open)
- `onValidate` is optional but strongly recommended for any game with invariants (e.g. `answer.length === wordLength`) — the Save button is disabled while errors exist
- **`onValidate` must also be called once on initial mount** (e.g. in a `useEffect([], [])`) so the companion app reflects the correct validation state before any user interaction. If the pre-populated content is already invalid (e.g. empty answer from a fresh preview), the Save button must be disabled immediately — not only after the user touches a field. See §17.6.4 for the recommended `validate()` helper pattern.
- The editor must not manage its own save/cancel state — those are owned by the companion app page
- The editor may render a **live preview** of the level (e.g. an empty game grid) but this is optional

---

#### 17.6.3 Standard Field Components

All standard fields live in `level-editor/src/components/fields/`. Import and compose them freely.

| Component | Props | Use for |
|---|---|---|
| `<TextField />` | `label`, `value`, `onChange`, `placeholder?`, `maxLength?`, `validate?` | Short strings — answers, names, codes |
| `<NumberField />` | `label`, `value`, `onChange`, `min?`, `max?`, `step?` | Integers and decimals — lengths, counts, scores |
| `<BooleanField />` | `label`, `value`, `onChange`, `hint?` | True/false flags — feature toggles |
| `<ImageAssetField />` | `label`, `value`, `onChange`, `gameSlug?`, `accept?`, `maxBytes?`, `hint?` | Pick/reuse or upload an editor-owned R2 image asset; renders inline preview from a short-lived URL derived from `value.imageObjectKey` |
| JSON fallback | `label?`, `value`, `onChange`, `readOnly?` | Raw JSON — complex nested objects, escape hatch |

All fields:
- Accept a `label` string (rendered above the input)
- Accept an optional `hint` string (rendered as small text below the input)
- Accept an optional `validate` function `(value) => string | null` — return an error string or `null`; error is displayed inline below the field and bubbled up via `onValidate`
- Should follow the same token vocabulary (`var(--surface-2)`, `var(--ink)`, `var(--brand)`) when the companion app shares Mushy styling

`<ImageAssetField />` value shape:

```ts
type ImageAssetValue = {
  imageObjectKey: string | null;
  altText?: string | null;
};
```

Implementation notes:
- Use `level-editor/src/lib/editorAssets.js` as the only client helper for asset operations.
- `editorAssets.js` calls the companion `level-editor` API routes (`/api/assets/*`); it must not import or modify `mushy-game/src/lib/storage.js`.
- The field should offer both "Upload image" and "Choose existing" flows.
- Upload flow: request `/api/assets/presign`, PUT the file to R2 using the returned URL, call `/api/assets/:id/complete`, then call `onChange({ imageObjectKey, altText })`.
- Choose-existing flow: list assets via `/api/assets`, then call `onChange(...)` with the selected asset's object key. Use any returned `publicUrl` only for preview rendering.
- Clear flow: call `onChange({ imageObjectKey: null, altText: null })`; actual asset deletion/archive is managed by the asset library, not by the field.

---

#### 17.6.4 Writing a Custom `LevelEditor`

```jsx
// level-editor/src/components/editors/MyGameLevelEditor.jsx
import { useEffect } from 'react';
import TextField   from '../fields/TextField.jsx';
import NumberField from '../fields/NumberField.jsx';

export default function MyGameLevelEditor({ content, onChange, onValidate }) {

  // Pure validation — does NOT call onChange.
  // Called on mount (to reflect initial state) and after every field change.
  function validate(next) {
    const errors = [];
    if (!next.myRequiredField) errors.push('Required field is missing');
    onValidate?.(errors);
  }

  // Fire once on mount so the save button is disabled if content is already invalid
  // (e.g. empty answer from a fresh preview).
  useEffect(() => { validate(content); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function update(patch) {
    const next = { ...content, ...patch };
    onChange(next);   // ← full object, not a delta
    validate(next);   // ← validate is pure; no spurious writes
  }

  return (
    <div>
      <TextField
        label="My String Field"
        value={content.myStringField ?? ''}
        onChange={val => update({ myStringField: val })}
        validate={val => val.length === 0 ? 'Required' : null}
      />
      <NumberField
        label="My Number Field"
        value={content.myNumberField ?? 1}
        min={1} max={100}
        onChange={val => update({ myNumberField: val })}
        hint="Some helpful hint about this field"
      />
    </div>
  );
}
```

Then register it in the companion app editor index:

```js
// level-editor/src/components/editors/index.js
import MyGameLevelEditor from './MyGameLevelEditor.jsx';

export const levelEditors = {
  'my-game': MyGameLevelEditor,
  // games not listed here fall back to the JSON editor
};
```

The companion app looks up `levelEditors[game.slug]` and renders it, or falls back to the JSON editor if no entry exists.

---

#### 17.6.5 Validation Flow

```
level-editor opens a date
  ├─ Fetches content via GET /api/levels/preview (or loads saved custom level)
  ├─ Renders levelEditors[slug] ?? JSON fallback with content
  ├─ Save button starts enabled (parent has not yet received an onValidate call)
  │
  ├─ Editor mounts → calls validate(content) via useEffect on mount
  │     └─ onValidate(errors) fires immediately
  │           ├─ errors.length > 0 → Save button disabled + error banner shown
  │           └─ errors.length = 0 → Save button stays enabled
  │
  ├─ User edits a field
  │     ├─ LevelEditor calls onChange(nextContent)  → parent holds nextContent in state
  │     └─ LevelEditor calls validate(nextContent) → onValidate(errors)
  │           ├─ errors.length > 0 → Save button disabled + error banner shown
  │           └─ errors.length = 0 → Save button enabled
  │
  └─ User clicks Save (only if valid)
        └─ companion app calls POST /api/levels with nextContent
```

---

#### 17.6.6 Constraints Summary

| Rule | Reason |
|---|---|
| Never write to the DB from inside a `LevelEditor` | The companion app page owns the save action; editors stay pure UI |
| Always call `onChange` with the full content object | The parent cannot safely diff partial patches |
| Call `onValidate([])` when valid, not just on error | The parent needs to know when to re-enable Save after an error is fixed |
| Use shared field components for common inputs | Consistent UX across game authoring flows |
| JSON fallback is always acceptable | Do not block a game launch on a polished editor; add it later |
| Keep live previews optional and lightweight | The companion app is a management tool, not a full game simulator |

---

### 17.7 What You Get for Free

Once Steps 1–4 above are done (Step 5 is optional), the following work automatically with no further changes:

| Feature | How |
|---|---|
| Appears on HomeScreen | `is_active = true` in `games` row; `levels.js` fetches all active games |
| Daily level auto-generated | Cron iterates all active games, looks up `generators[slug]` |
| Companion level-editor preview + customise | The separate `level-editor` app calls its local copy of the generator with the date seed and uses the catalog schema helper for level numbering |
| Resume badge on HomeScreen | `in_progress` session detected by `levels.js` |
| Timer / no-timer header | `GameScreen` reads `game.has_timer` |
| Disconnect recovery | Renderer restores from `gameState`; ping system is game-agnostic |
| Streak tracking | Computed from session rows; game-agnostic |
| Leaderboard + percentile | Stats endpoints filter by `level_id`; direction from `game.score_direction` |
| "How to play" dialog | `GameScreen` shows on first visit per `game.slug` — content is a `HowToPlay` named export from the renderer file (see §17.4) |
| Optional custom authoring UI | The companion `level-editor` app can look up `levelEditors[slug]`; otherwise it uses JSON fallback (see §17.6) |

---

## 18. Resolved Questions

| # | Question | Resolution |
|---|---|---|
| 1 | "Same company" meaning? | **Global** — all players across all workspaces. Implemented via server-side aggregate in `api/stats/global.js`. |
| 2 | Should offline time count against player? | **No.** Server owns elapsed — computed from `(now - started_at) - total_offline_gaps`. On reconnect, game state restores to the last interval ping checkpoint; server elapsed already reflects real time with no client-side penalty added. |
| 3 | Who inserts daily levels? | **Vercel Cron** on the `level-editor` side auto-generates via date seed. `level_number` is derived by the editor-owned catalog schema helper — no counter column. The companion `level-editor` app can pre-insert custom levels for any date; cron skips those dates via `ON CONFLICT DO NOTHING`. |
| 4 | Multiple workspaces — which to compare? | Always use `ctx.workspaceId` (currently active workspace). "Most members" selection is not feasible — RLS and context only expose the current workspace. Card is omitted if workspace < 10 members or < 2 completions. Sessions are workspace-scoped with `UNIQUE (workspace_id, user_id, level_id)`, so switching active workspace mid-game can produce a separate session in that other workspace by design. |
| 5 | RLS helpers — defined where? | `public.can_access_app_data()` and `public.is_owner_workspace_member()` are defined on the **Mushy public database** (superapp mig 049), not in this miniapp. See §12 for the full function table and policy SQL. |
| 6 | Ping connection window threshold exact value? | `MISSED_PING_THRESHOLD_MS = 5000` — equal to `PING_INTERVAL_MS`. No grace buffer. See §4.2 for both constants. |
| 7 | Auto-reconnect behaviour on missed ping? | Client auto-retries up to 3 times (2 s apart) before showing a manual "Kết nối lại" button. See §4.3. |
| 8 | Streak freeze — token system or automatic? | **Automatic banked freeze** — no token system. Wins add one freeze up to a cap of 2. Loss-capable games consume one freeze on loss if available; otherwise the streak resets to 0. Timer-only games do not use the freeze bank. See §7. |
| 9 | Seeded RNG algorithm? | **mulberry32**, seeded via djb2 string hash. Implementation in `src/lib/utils/random.js`. See §5.3. |
| 10 | Word list build pipeline — when to run, committed or not? | `wordLists.js` is **generated once, committed**. Run `npm run build:wordlists` manually before first deploy and when source lists update. Source `.txt` files are gitignored. Ship all 5 lengths (4–8) at launch. See plan-wordle-v1.md §5.1. |
| 11 | Who owns the timer and the "Cách chơi" dialog — GameScreen or the renderer? | **GameScreen owns both.** Timer state (`elapsed`, `running`) lives in GameScreen; `<Timer />` is rendered in the header. The dialog shell (with **×** close button) is rendered by GameScreen around the `HowToPlay` named export from the renderer file. The renderer receives no timer or dialog props. See §4.1. |
| 12 | Should `onAction` be called on the final move before `onComplete`? | **No.** On the move that ends the puzzle, call `onComplete` only. `onAction` is for intermediate checkpoints; `onComplete` is the terminal signal. Calling both would fire a redundant game-action ping immediately before the completion request. See §17.4. |
| 13 | Does `POST /api/sessions/enter` need the `x-workspace-id` header? | **Yes** — same as all other API calls. The server reads `x-workspace-id` to derive `workspace_id` for the new session INSERT and any carryover resolution. See §10. |
| 14 | Should a custom `LevelEditor` call `onValidate` on mount? | **Yes.** Editors must call `validate(content)` once on mount via `useEffect([], [])` so the companion app can disable Save before any user interaction if the initial content is already invalid. Use the pure `validate()` helper pattern — call it from both the mount effect and `update()`. See §17.6.2 and §17.6.4. |
| 15 | Should `game_state` be cleared (`= null`) when a session is completed? | **No — it is preserved.** The completion endpoint does not touch `game_state`. The column retains the final puzzle state so that GameScreen (Case C in §4.4) can restore the completed board view and transition smoothly to ResultScreen. See §4.2, §4.4, §6.2, §10. |
| 16 | When adding a new puzzle game, which version should be bumped? | **Usually none of the existing version columns.** Insert the new `games` row with `game_version = '1.0.0'`, `content_schema_version = 1`, `generator_version = 1`, and `rules_version = 1`. Bump the Mushy Game platform version only if the new game required platform/schema/API changes outside the normal plug-in flow. See §6.2 Versioning model and §17.2. |
| 17 | How does Mushy Game read level-editor catalog data? | **Server-to-server HTTP with a custom service token.** `mushy-game/api/*` verifies the Mushy user/workspace normally, then calls `level-editor` runtime catalog endpoints using `LEVEL_EDITOR_SERVICE_TOKEN`. The token is created by a level-editor owner through the owner-only Service Tokens UI, stored only in Mushy Game backend env vars, and is not a Supabase Auth user/session token. See §6.2 and §10. |
