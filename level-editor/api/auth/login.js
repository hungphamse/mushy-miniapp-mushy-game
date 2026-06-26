import {
  assertOwnerUser,
  createClearSessionCookies,
  createSessionCookies,
  getSessionSummary,
} from '../_shared/auth.js';
import { methodNotAllowed, readJsonBody, sendError, sendJson } from '../_shared/http.js';
import { createSupabaseAuthClient } from '../../src/lib/supabaseServer.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      methodNotAllowed(res, ['POST']);
      return;
    }

    const body = await readJsonBody(req);
    const email = String(body.email || '').trim();
    const password = String(body.password || '');

    if (!email || !password) {
      throw Object.assign(new Error('Email and password are required.'), { statusCode: 400 });
    }

    const supabase = createSupabaseAuthClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    const { session, user } = data || {};

    if (error || !session || !user) {
      res.setHeader?.('set-cookie', createClearSessionCookies(req));
      throw Object.assign(new Error('Invalid email or password.'), { statusCode: 401 });
    }

    assertOwnerUser(user);

    res.setHeader?.('set-cookie', createSessionCookies(session, req));
    sendJson(res, 200, {
      user: publicUser(user),
      owner: true,
      session: getSessionSummary(session),
    });
  } catch (error) {
    if (error.statusCode === 403) {
      res.setHeader?.('set-cookie', createClearSessionCookies(req));
    }

    sendError(res, error.statusCode || 500, error.message || 'Unable to sign in.');
  }
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email || '',
  };
}
