import {
  createClearSessionCookies,
  getCookie,
  SESSION_COOKIE_NAMES,
} from '../_shared/auth.js';
import { methodNotAllowed, sendError, sendJson } from '../_shared/http.js';
import { createSupabaseAuthClient } from '../../src/lib/supabaseServer.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      methodNotAllowed(res, ['POST']);
      return;
    }

    await signOutSupabaseSession(req);
    res.setHeader?.('set-cookie', createClearSessionCookies(req));
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendError(res, error.statusCode || 500, error.message || 'Unable to sign out.');
  }
}

async function signOutSupabaseSession(req) {
  const accessToken = getCookie(req, SESSION_COOKIE_NAMES.accessToken);
  const refreshToken = getCookie(req, SESSION_COOKIE_NAMES.refreshToken);

  if (!accessToken || !refreshToken) {
    return;
  }

  try {
    const supabase = createSupabaseAuthClient();
    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (!setSessionError) {
      await supabase.auth.signOut();
    }
  } catch {
    // Clearing the HTTP-only cookies is still the local source of truth.
  }
}
