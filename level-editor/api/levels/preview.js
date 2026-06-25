import { requireEditorSession } from '../_shared/auth.js';
import { getQueryParam, methodNotAllowed, sendError, sendJson } from '../_shared/http.js';
import { previewLevel } from '../_shared/levelService.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  try {
    const { supabase } = await requireEditorSession(req);
    const result = await previewLevel({
      supabase,
      gameId: getQueryParam(req, 'gameId'),
      puzzleDate: getQueryParam(req, 'puzzleDate'),
    });

    sendJson(res, 200, result);
  } catch (error) {
    sendError(res, error.statusCode || 500, error.message || 'Unexpected error.');
  }
}
