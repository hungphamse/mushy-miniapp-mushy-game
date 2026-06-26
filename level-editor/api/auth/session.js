import {
  assertOwnerUser,
  createClearSessionCookies,
  createSessionCookies,
  getCookie,
  getSessionSummary,
  SESSION_COOKIE_NAMES,
} from '../_shared/auth.js';
import { methodNotAllowed, sendError, sendJson } from '../_shared/http.js';
import {
  createSupabaseAuthClient,
  createSupabaseServerClient,
} from '../../src/lib/supabaseServer.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      methodNotAllowed(res, ['GET']);
      return;
    }

    const session = await resolveSession(req, res);

    if (!session) {
      res.setHeader?.('set-cookie', createClearSessionCookies(req));
      sendJson(res, 200, { user: null, owner: false, session: null });
      return;
    }

    assertOwnerUser(session.user);
    sendJson(res, 200, {
      user: publicUser(session.user),
      owner: true,
      session: session.summary,
    });
  } catch (error) {
    res.setHeader?.('set-cookie', createClearSessionCookies(req));
    sendError(res, error.statusCode || 500, error.message || 'Unable to load session.');
  }
}

async function resolveSession(req, res) {
  const accessToken = getCookie(req, SESSION_COOKIE_NAMES.accessToken);

  if (accessToken) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (!error && data?.user) {
      return {
        user: data.user,
        summary: getSessionSummary({ access_token: accessToken }),
      };
    }
  }

  const refreshToken = getCookie(req, SESSION_COOKIE_NAMES.refreshToken);

  if (!refreshToken) {
    return null;
  }

  const supabase = createSupabaseAuthClient();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  const { session, user } = data || {};

  if (error || !session || !user) {
    return null;
  }

  res.setHeader?.('set-cookie', createSessionCookies(session, req));

  return {
    user,
    summary: getSessionSummary(session),
  };
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email || '',
  };
}
