import { useEffect, useState } from 'react';
import { fetchAuthSession } from './authClient.js';

export function useAuthSession(enabled = true) {
  const [refreshId, setRefreshId] = useState(0);
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

    fetchAuthSession()
      .then((data) => {
        if (!active) return;
        setState({
          session: data.session || null,
          user: data.user || null,
          loading: false,
          error: '',
        });
      })
      .catch((error) => {
        if (!active) return;
        setState({ session: null, user: null, loading: false, error: error.message });
      });

    return () => {
      active = false;
    };
  }, [enabled, refreshId]);

  return {
    ...state,
    refresh: () => setRefreshId((current) => current + 1),
  };
}
