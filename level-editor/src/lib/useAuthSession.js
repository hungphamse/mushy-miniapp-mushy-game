import { useEffect, useState } from 'react';
import { getSupabaseClient } from './supabaseClient.js';

export function useAuthSession(enabled = true) {
  const [state, setState] = useState({
    session: null,
    user: null,
    loading: enabled,
    error: '',
  });

  useEffect(() => {
    if (!enabled) {
      setState({ session: null, user: null, loading: false, error: '' });
      return undefined;
    }

    let active = true;
    const supabase = getSupabaseClient();

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setState({ session: null, user: null, loading: false, error: error.message });
          return;
        }
        setState({
          session: data.session,
          user: data.session?.user || null,
          loading: false,
          error: '',
        });
      })
      .catch((error) => {
        if (!active) return;
        setState({ session: null, user: null, loading: false, error: error.message });
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        session,
        user: session?.user || null,
        loading: false,
        error: '',
      });
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [enabled]);

  return state;
}
