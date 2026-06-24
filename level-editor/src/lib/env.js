const REQUIRED_BROWSER_ENV = [
  'VITE_LEVEL_EDITOR_SUPABASE_URL',
  'VITE_LEVEL_EDITOR_SUPABASE_ANON_KEY',
];

const browserEnv = import.meta.env;
// Vercel sets VERCEL_ENV for deployed production/preview builds. Local Vite
// development falls back to "development" so the UI can clearly label itself.
// eslint-disable-next-line no-undef
const vercelEnv = typeof __VERCEL_ENV__ !== 'undefined' ? __VERCEL_ENV__ : 'development';

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

export function getRuntimeMode() {
  const normalized = vercelEnv === 'production' || vercelEnv === 'preview'
    ? vercelEnv
    : 'development';

  return {
    name: normalized,
    label: normalized === 'production'
      ? 'Production'
      : normalized === 'preview'
        ? 'Preview editor'
        : 'Development editor',
    isProduction: normalized === 'production',
    isNonProduction: normalized !== 'production',
  };
}

export function parseCsv(value = '') {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
