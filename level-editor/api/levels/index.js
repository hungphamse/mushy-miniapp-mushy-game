import { requireEditorSession } from '../_shared/auth.js';
import {
  getQueryParam,
  methodNotAllowed,
  readJsonBody,
  sendError,
  sendJson,
} from '../_shared/http.js';
import { clearCustomLevel, listLevels, saveCustomLevel } from '../_shared/levelService.js';

export default async function handler(req, res) {
  try {
    const { supabase, user } = await requireEditorSession(req);

    if (req.method === 'GET') {
      const result = await listLevels({
        supabase,
        gameId: getQueryParam(req, 'gameId'),
        from: getQueryParam(req, 'from'),
        to: getQueryParam(req, 'to'),
      });

      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const result = await saveCustomLevel({ supabase, user, body });

      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'DELETE') {
      const result = await clearCustomLevel({
        supabase,
        gameId: getQueryParam(req, 'gameId'),
        puzzleDate: getQueryParam(req, 'puzzleDate'),
      });

      sendJson(res, 200, result);
      return;
    }

    methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
  } catch (error) {
    sendError(res, error.statusCode || 500, error.message || 'Unexpected error.');
  }
}
