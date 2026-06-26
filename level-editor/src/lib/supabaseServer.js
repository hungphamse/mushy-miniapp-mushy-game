import { createClient } from '@supabase/supabase-js';

export function createSupabaseServerClient(env = process.env) {
  if (typeof window !== 'undefined') {
    throw new Error('createSupabaseServerClient must not be used in browser code.');
  }

  const url = env.LEVEL_EDITOR_SUPABASE_URL;
  const serviceRoleKey = env.LEVEL_EDITOR_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing server env vars: LEVEL_EDITOR_SUPABASE_URL and LEVEL_EDITOR_SUPABASE_SERVICE_ROLE_KEY',
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createSupabaseAuthClient(env = process.env) {
  if (typeof window !== 'undefined') {
    throw new Error('createSupabaseAuthClient must not be used in browser code.');
  }

  const url = env.LEVEL_EDITOR_SUPABASE_URL;
  const anonKey = env.LEVEL_EDITOR_SUPABASE_ANON_KEY || env.LEVEL_EDITOR_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing server env vars: LEVEL_EDITOR_SUPABASE_URL and LEVEL_EDITOR_SUPABASE_ANON_KEY',
    );
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getOwnerAllowlist(env = process.env) {
  return {
    userIds: parseServerCsv(env.LEVEL_EDITOR_OWNER_USER_IDS),
    emails: parseServerCsv(env.LEVEL_EDITOR_OWNER_EMAILS).map((email) => email.toLowerCase()),
  };
}

export function requireOwnerUser(user, env = process.env) {
  const { userIds, emails } = getOwnerAllowlist(env);

  if (!user) {
    throw new Error('Owner authorization requires an authenticated user.');
  }

  if (userIds.includes(user.id)) {
    return user;
  }

  const email = (user.email || '').toLowerCase();
  if (email && emails.includes(email)) {
    return user;
  }

  throw new Error('Owner authorization failed.');
}

function parseServerCsv(value = '') {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
