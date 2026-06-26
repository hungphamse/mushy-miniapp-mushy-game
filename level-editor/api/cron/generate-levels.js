import { requireCronSecret } from '../_shared/cronAuth.js';
import { getQueryParam, methodNotAllowed, sendError, sendJson } from '../_shared/http.js';
import { generateDailyLevels, parseDryRun } from '../_shared/cronService.js';
import { createSupabaseServerClient } from '../../src/lib/supabaseServer.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      methodNotAllowed(res, ['GET', 'POST']);
      return;
    }

    requireCronSecret(req);

    const result = await generateDailyLevels({
      supabase: createSupabaseServerClient(),
      requestedDate: getQueryParam(req, 'date'),
      dryRun: parseDryRun(getQueryParam(req, 'dryRun') || getQueryParam(req, 'dry_run')),
      now: new Date(),
      logger: console,
    });

    sendJson(res, result.ok ? 200 : 500, result);
  } catch (error) {
    sendError(res, error.statusCode || 500, error.message || 'Unexpected cron error.');
  }
}
