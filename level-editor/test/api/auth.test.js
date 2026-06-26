import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createClearSessionCookies,
  createSessionCookies,
  getBearerToken,
  getCookie,
  requireEditorSession,
  SESSION_COOKIE_NAMES,
} from '../../api/_shared/auth.js';

describe('editor API auth', () => {
  it('extracts bearer tokens', () => {
    assert.equal(getBearerToken({ headers: { authorization: 'Bearer abc123' } }), 'abc123');
    assert.equal(getBearerToken({ headers: { authorization: 'bearer token-value' } }), 'token-value');
    assert.equal(getBearerToken({ headers: { authorization: 'Basic abc123' } }), '');
  });

  it('extracts cookie values', () => {
    assert.equal(
      getCookie(
        { headers: { cookie: 'one=1; level_editor_access_token=cookie-token; two=2' } },
        SESSION_COOKIE_NAMES.accessToken,
      ),
      'cookie-token',
    );
  });

  it('creates and clears HTTP-only session cookies', () => {
    const sessionCookies = createSessionCookies(
      {
        access_token: 'access',
        refresh_token: 'refresh',
        expires_in: 3600,
      },
      { headers: {} },
      { NODE_ENV: 'test' },
    );
    const clearCookies = createClearSessionCookies({ headers: {} }, { NODE_ENV: 'test' });

    assert.equal(sessionCookies.length, 2);
    assert.match(sessionCookies[0], /level_editor_access_token=access/);
    assert.match(sessionCookies[0], /HttpOnly/);
    assert.match(clearCookies[0], /Max-Age=0/);
  });

  it('rejects missing editor sessions', async () => {
    await assert.rejects(
      () => requireEditorSession({ headers: {} }, { createClient: createFakeClient }),
      /Missing editor session/,
    );
  });

  it('verifies bearer tokens server-side and enforces owner allowlist', async () => {
    const user = { id: 'user-1', email: 'owner@example.com' };
    const result = await requireEditorSession(
      { headers: { authorization: 'Bearer valid-token' } },
      {
        createClient: () => createFakeClient({ user }),
        env: { LEVEL_EDITOR_OWNER_USER_IDS: 'user-1' },
      },
    );

    assert.equal(result.user, user);
    assert.equal(result.supabase.auth.seenToken, 'valid-token');
  });

  it('verifies session cookies server-side', async () => {
    const user = { id: 'user-1', email: 'owner@example.com' };
    const result = await requireEditorSession(
      { headers: { cookie: 'level_editor_access_token=cookie-token' } },
      {
        createClient: () => createFakeClient({ user }),
        env: { LEVEL_EDITOR_OWNER_EMAILS: 'owner@example.com' },
      },
    );

    assert.equal(result.user, user);
    assert.equal(result.supabase.auth.seenToken, 'cookie-token');
  });

  it('rejects non-owner Supabase users server-side', async () => {
    const user = { id: 'user-2', email: 'editor@example.com' };

    await assert.rejects(
      () => requireEditorSession(
        { headers: { authorization: 'Bearer valid-token' } },
        {
          createClient: () => createFakeClient({ user }),
          env: { LEVEL_EDITOR_OWNER_USER_IDS: 'user-1' },
        },
      ),
      /Owner authorization failed|not in the owner allowlist/i,
    );
  });

  it('rejects invalid Supabase sessions', async () => {
    await assert.rejects(
      () => requireEditorSession(
        { headers: { authorization: 'Bearer bad-token' } },
        { createClient: () => createFakeClient({ error: new Error('bad jwt') }) },
      ),
      /Invalid or expired editor session/,
    );
  });
});

function createFakeClient({ user = null, error = null } = {}) {
  return {
    auth: {
      seenToken: null,
      async getUser(token) {
        this.seenToken = token;
        return { data: { user }, error };
      },
    },
  };
}
