export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader?.('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export function sendError(res, statusCode, message, details = undefined) {
  sendJson(res, statusCode, {
    error: {
      message,
      ...(details ? { details } : {}),
    },
  });
}

export function methodNotAllowed(res, allowedMethods) {
  res.setHeader?.('allow', allowedMethods.join(', '));
  sendError(res, 405, 'Method not allowed.');
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 });
  }
}

export function getQueryParam(req, name) {
  const host = req.headers?.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);
  return url.searchParams.get(name) || '';
}

export function getQueryParams(req) {
  const host = req.headers?.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);
  return url.searchParams;
}
