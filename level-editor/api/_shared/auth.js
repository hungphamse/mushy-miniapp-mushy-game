import {
  createSupabaseServerClient,
  requireOwnerUser,
} from '../../src/lib/supabaseServer.js';

export const SESSION_COOKIE_NAMES = {
  accessToken: 'level_editor_access_token',
  refreshToken: 'level_editor_refresh_token',
};

export async function requireEditorSession(req, options = {}) {
  const env = options.env || process.env;
  const createClient = options.createClient || createSupabaseServerClient;
  const requireOwner = options.requireOwner !== false;
  const token = getEditorAccessToken(req);

  if (!token) {
    throw Object.assign(new Error('Missing editor session.'), { statusCode: 401 });
  }

  const supabase = createClient(env);
  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;

  if (error || !user) {
    throw Object.assign(new Error('Invalid or expired editor session.'), { statusCode: 401 });
  }

  if (requireOwner) {
    assertOwnerUser(user, env);
  }

  return { supabase, user, token };
}

export function assertOwnerUser(user, env = process.env) {
  try {
    return requireOwnerUser(user, env);
  } catch (error) {
    throw Object.assign(new Error(error.message || 'Owner authorization failed.'), {
      statusCode: 403,
    });
  }
}

export function getEditorAccessToken(req) {
  return getBearerToken(req) || getCookie(req, SESSION_COOKIE_NAMES.accessToken);
}

export function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || '';
}

export function getCookie(req, name) {
  const cookieHeader = req.headers?.cookie || req.headers?.Cookie || '';
  const cookies = parseCookieHeader(cookieHeader);

  return cookies[name] || '';
}

export function createSessionCookies(session, req, env = process.env) {
  const secure = isSecureRequest(req, env);
  const accessMaxAge = Number(session.expires_in || 3600);
  const refreshMaxAge = 60 * 60 * 24 * 30;

  return [
    serializeCookie(SESSION_COOKIE_NAMES.accessToken, session.access_token, {
      httpOnly: true,
      maxAge: accessMaxAge,
      sameSite: 'Lax',
      secure,
    }),
    serializeCookie(SESSION_COOKIE_NAMES.refreshToken, session.refresh_token, {
      httpOnly: true,
      maxAge: refreshMaxAge,
      sameSite: 'Lax',
      secure,
    }),
  ];
}

export function createClearSessionCookies(req, env = process.env) {
  const secure = isSecureRequest(req, env);

  return [
    serializeCookie(SESSION_COOKIE_NAMES.accessToken, '', {
      httpOnly: true,
      maxAge: 0,
      sameSite: 'Lax',
      secure,
    }),
    serializeCookie(SESSION_COOKIE_NAMES.refreshToken, '', {
      httpOnly: true,
      maxAge: 0,
      sameSite: 'Lax',
      secure,
    }),
  ];
}

export function getSessionSummary(session) {
  return {
    accessTokenExpiresAt: session.expires_at || decodeJwtExpiresAt(session.access_token),
    expires_at: session.expires_at || decodeJwtExpiresAt(session.access_token),
  };
}

function parseCookieHeader(cookieHeader) {
  return cookieHeader.split(';').reduce((cookies, item) => {
    const separatorIndex = item.indexOf('=');

    if (separatorIndex === -1) {
      return cookies;
    }

    const name = item.slice(0, separatorIndex).trim();
    const value = item.slice(separatorIndex + 1).trim();

    if (name) {
      cookies[name] = decodeURIComponent(value);
    }

    return cookies;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value || '')}`,
    'Path=/',
    `SameSite=${options.sameSite || 'Lax'}`,
  ];

  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (Number.isInteger(options.maxAge)) parts.push(`Max-Age=${options.maxAge}`);

  return parts.join('; ');
}

function isSecureRequest(req, env = process.env) {
  const forwardedProto = req.headers?.['x-forwarded-proto'] || req.headers?.['X-Forwarded-Proto'];

  return forwardedProto === 'https' ||
    env.VERCEL_ENV === 'production' ||
    env.VERCEL_ENV === 'preview' ||
    env.NODE_ENV === 'production';
}

function decodeJwtExpiresAt(token) {
  const payload = decodeJwtPayload(token);
  return typeof payload?.exp === 'number' ? payload.exp : null;
}

function decodeJwtPayload(token) {
  const [, encodedPayload] = String(token || '').split('.');

  if (!encodedPayload) {
    return null;
  }

  try {
    const padded = encodedPayload.padEnd(
      encodedPayload.length + ((4 - (encodedPayload.length % 4)) % 4),
      '=',
    );
    const json = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}
