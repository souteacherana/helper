import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { icpFromRow, type Icp, type IcpRow } from '../lib/icp';

/** ICP de cada participante (tabela attendee_icp), para a equipe, em tempo real. */
export function useIcp() {
  const { userSession, authReady, attendees } = useApp();
  const isTeam = userSession.role === 'CLOSER' || userSession.role === 'ADMIN';
  const [icp, setIcp] = useState<Map<string, Icp>>(new Map());

  // Modo demonstração (sem Supabase): classificações de exemplo
  useEffect(() => {
    if (supabase) return;
    const samples: Omit<Icp, 'attendeeId'>[] = [
      { level: 3, profile: 'Estruturando Escala', direction: 'Elite', readiness: 'A', readinessScore: 2, disc: 'Influente', answers: { Faturamento: 'De R$ 20.001 a R$ 30.000', 'Meta 6–12m': 'R$ 50.001 a R$ 100.000', Impede: 'Falta de estratégia clara', 'Espera do evento': 'Clareza sobre meu próximo passo' } },
      { level: 4, profile: 'Professor Sobrecarregado', direction: 'Partiu 10K ou Elite', readiness: 'B', readinessScore: 3, disc: 'Conforme', answers: { Faturamento: 'De R$ 5.001 a R$ 10.000', Sente: 'Ansioso(a) para acelerar' } },
      { level: 6, profile: 'Iniciante', direction: 'Partiu 10K', readiness: 'C', readinessScore: 5, disc: 'Estável', answers: { Faturamento: 'Até R$ 2.000' } }
    ];
    setIcp(new Map(attendees.map((a, i) => [a.id, { ...samples[i % samples.length], attendeeId: a.id }])));
  }, [attendees]);

  const fetchIcp = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('attendee_icp').select('*');
    if (error) {
      console.warn('Supabase ICP fetch error:', error);
      return;
    }
    setIcp(new Map((data as IcpRow[]).map(r => [r.attendee_id, icpFromRow(r)])));
  }, []);

  useEffect(() => {
    if (!supabase || !authReady || !isTeam) return;
    const client = supabase;
    fetchIcp();
    const channel = client
      .channel('helper-icp')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendee_icp' }, () => fetchIcp())
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [authReady, isTeam, fetchIcp]);

  return icp;
}
