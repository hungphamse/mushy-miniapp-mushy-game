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

## Security Notes

- The Vite owner allowlist is client-visible and only protects the UI.
- Future HTTP APIs must enforce owner checks on the server with server-only env vars.
- Do not use Supabase `user_metadata` for owner authorization.
- Runtime Mushy Game access will use custom service tokens, not editor user/password sessions.

## UI Notes

- The app title is `Mushy Game Level Editor`.
- The visual baseline follows the Mushy miniapp template: compact hero title, red/pink brand accents, rounded cards, and connected section navigation.
- Authenticated views use one compact top header with a single `Account management` block on the right; do not duplicate account/email cards above the interactive editor area.
- Local development and Vercel preview builds show a visible non-production mode badge.
- Production builds do not show a mode badge, user ID, or session expiry diagnostics.
- `VERCEL_ENV` is injected automatically on Vercel; local Vite runs fall back to `development`.
