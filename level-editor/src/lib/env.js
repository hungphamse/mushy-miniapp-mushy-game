// Vercel sets VERCEL_ENV for deployed production/preview builds. Local Vite
// development falls back to "development" so the UI can clearly label itself.
// eslint-disable-next-line no-undef
const vercelEnv = typeof __VERCEL_ENV__ !== 'undefined' ? __VERCEL_ENV__ : 'development';

export function getConfigStatus() {
  return {
    ready: true,
    missing: [],
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
