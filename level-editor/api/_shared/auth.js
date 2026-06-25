import { createSupabaseServerClient } from '../../src/lib/supabaseServer.js';

export async function requireEditorSession(req, options = {}) {
  const env = options.env || process.env;
  const createClient = options.createClient || createSupabaseServerClient;
  const token = getBearerToken(req);

  if (!token) {
    throw Object.assign(new Error('Missing bearer token.'), { statusCode: 401 });
  }

  const supabase = createClient(env);
  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;

  if (error || !user) {
    throw Object.assign(new Error('Invalid or expired editor session.'), { statusCode: 401 });
  }

  return { supabase, user };
}

export function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || '';
}
