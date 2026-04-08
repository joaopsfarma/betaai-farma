import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function usePersistentState<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const { user } = useAuth();
  const [state, setState] = useState<T>(initialValue);
  const loaded = useRef(false);

  // Carrega do Supabase (com fallback para localStorage)
  useEffect(() => {
    if (!user) {
      const stored = localStorage.getItem(key);
      if (stored) {
        try { setState(JSON.parse(stored) as T); } catch {}
      } else {
        setState(initialValue);
      }
      loaded.current = true;
      return;
    }
    loaded.current = false;
    supabase
      .from('app_state')
      .select('value')
      .eq('key', key)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.warn('[usePersistentState] Supabase load error:', key, error.message);
          const stored = localStorage.getItem(key);
          if (stored) {
            try { setState(JSON.parse(stored) as T); } catch {}
          }
        } else if (data?.value !== undefined && data.value !== null) {
          setState(data.value as T);
        }
        loaded.current = true;
      })
      .catch((err) => {
        console.warn('[usePersistentState] Supabase load exception:', key, err);
        const stored = localStorage.getItem(key);
        if (stored) {
          try { setState(JSON.parse(stored) as T); } catch {}
        }
        loaded.current = true;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key]);

  // Persiste (localStorage sempre + Supabase se disponível)
  useEffect(() => {
    if (!loaded.current) return;
    const timer = setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
      if (user) {
        supabase
          .from('app_state')
          .upsert({ user_id: user.id, key, value: state }, { onConflict: 'user_id,key' })
          .then(({ error }) => {
            if (error) console.warn('[usePersistentState] Supabase save error:', key, error.message);
          });
      }
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, user?.id, key]);

  return [state, setState];
}
