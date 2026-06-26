function getHeader(req, name) {
  const headers = req.headers || {};
  const lowerName = name.toLowerCase();

  return headers[name] || headers[lowerName] || headers[name.toUpperCase()] || '';
}

export function requireCronSecret(req, env = process.env) {
  const cronSecret = env.CRON_SECRET;

  if (!cronSecret) {
    throw Object.assign(new Error('CRON_SECRET is not configured.'), { statusCode: 500 });
  }

  if (getHeader(req, 'authorization') !== `Bearer ${cronSecret}`) {
    throw Object.assign(new Error('Unauthorized cron request.'), { statusCode: 401 });
  }

  return true;
}
