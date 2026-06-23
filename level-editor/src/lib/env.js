const REQUIRED_BROWSER_ENV = [
  'VITE_LEVEL_EDITOR_SUPABASE_URL',
  'VITE_LEVEL_EDITOR_SUPABASE_ANON_KEY',
];

const browserEnv = import.meta.env;

export function getBrowserEnv() {
  return {
    supabaseUrl: browserEnv.VITE_LEVEL_EDITOR_SUPABASE_URL || '',
    supabaseAnonKey: browserEnv.VITE_LEVEL_EDITOR_SUPABASE_ANON_KEY || '',
    ownerUserIds: parseCsv(browserEnv.VITE_LEVEL_EDITOR_OWNER_USER_IDS),
    ownerEmails: parseCsv(browserEnv.VITE_LEVEL_EDITOR_OWNER_EMAILS).map((email) =>
      email.toLowerCase(),
    ),
  };
}

export function getConfigStatus() {
  const missing = REQUIRED_BROWSER_ENV.filter((name) => !browserEnv[name]);

  return {
    ready: missing.length === 0,
    missing,
  };
}

export function parseCsv(value = '') {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
