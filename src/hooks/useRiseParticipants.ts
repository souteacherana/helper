import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import type { RiseParticipant } from '../lib/riseParticipants';

/** Lista do Rise (via /api/rise/participants), atualizada a cada minuto e pelo botão "Atualizar". */
export function useRiseParticipants() {
  const { userSession, authReady } = useApp();
  const isTeam = userSession.role === 'CLOSER' || userSession.role === 'ADMIN';
  const [list, setList] = useState<RiseParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [readAt, setReadAt] = useState<string | null>(null);
  // false quando o servidor ainda não tem o RISE_LINK_TOKEN (a tela mostra só o cadastro do HELPER)
  const [configured, setConfigured] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Modo demonstração (sem Supabase): chama a rota sem sessão (só funciona com a rota simulada)
      const data = supabase ? (await supabase.auth.getSession()).data : { session: null };
      const res = await fetch('/api/rise/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: '{}'
      });
      const body = (await res.json().catch(() => ({}))) as { participantes?: RiseParticipant[]; lidoEm?: string; error?: string };
      setConfigured(res.status !== 503);
      if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
      setList(body.participantes ?? []);
      setReadAt(body.lidoEm ?? new Date().toISOString());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui ler o Rise.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authReady || !isTeam) return;
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [authReady, isTeam, load]);

  return { list, loading, error, readAt, configured, reload: load };
}
