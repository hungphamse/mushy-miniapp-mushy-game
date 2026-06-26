import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getBearerToken, requireEditorSession } from '../../api/_shared/auth.js';

describe('editor API auth', () => {
  it('extracts bearer tokens', () => {
    assert.equal(getBearerToken({ headers: { authorization: 'Bearer abc123' } }), 'abc123');
    assert.equal(getBearerToken({ headers: { authorization: 'bearer token-value' } }), 'token-value');
    assert.equal(getBearerToken({ headers: { authorization: 'Basic abc123' } }), '');
  });

  it('rejects missing bearer tokens', async () => {
    await assert.rejects(
      () => requireEditorSession({ headers: {} }, { createClient: createFakeClient }),
      /Missing bearer token/,
    );
  });

  it('verifies the Supabase access token server-side', async () => {
    const user = { id: 'user-1', email: 'owner@example.com' };
    const result = await requireEditorSession(
      { headers: { authorization: 'Bearer valid-token' } },
      { createClient: () => createFakeClient({ user }) },
    );

    assert.equal(result.user, user);
    assert.equal(result.supabase.auth.seenToken, 'valid-token');
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
