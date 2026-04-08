import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function usePersistentState<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const { user } = useAuth();
  const [state, setState] = useState<T>(initialValue);
  const loaded = useRef(false);

  // Carrega do Supabase quando o usuário está disponível
  useEffect(() => {
    if (!user) {
      setState(initialValue);
      loaded.current = false;
      return;
    }
    loaded.current = false;
    supabase
      .from('app_state')
      .select('value')
      .eq('key', key)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value !== undefined && data.value !== null) {
          setState(data.value as T);
        }
        loaded.current = true;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key]);

  // Persiste no Supabase sempre que o estado mudar (debounced 500ms)
  useEffect(() => {
    if (!user || !loaded.current) return;
    const timer = setTimeout(() => {
      supabase
        .from('app_state')
        .upsert({ user_id: user.id, key, value: state }, { onConflict: 'user_id,key' });
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, user?.id, key]);

  return [state, setState];
}
