import { createClient } from '@supabase/supabase-js';
import { getBrowserEnv, getConfigStatus } from './env.js';

let client;

export function getSupabaseClient() {
  if (client) return client;

  const status = getConfigStatus();
  if (!status.ready) {
    throw new Error(`Missing level-editor env vars: ${status.missing.join(', ')}`);
  }

  const { supabaseUrl, supabaseAnonKey } = getBrowserEnv();
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}

export async function signInWithPassword(email, password) {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}
