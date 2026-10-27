import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { DEFAULT_HALL, type HallSettings } from '../lib/eventMap';

const STORAGE_KEY_HALL = 'helper_rise_hall_v1';

interface HallRow {
  vip_width_m: number;
  table_diameter_m: number;
}

const fromRow = (r: HallRow): HallSettings => ({
  vipWidthM: Number(r.vip_width_m),
  tableDiameterM: Number(r.table_diameter_m)
});

function readCached(): HallSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_HALL);
    if (stored) return { ...DEFAULT_HALL, ...(JSON.parse(stored) as Partial<HallSettings>) };
  } catch {
    // cache inválido: usa o padrão
  }
  return DEFAULT_HALL;
}

/** Área VIP e tamanho das mesas (tabela event_settings; o salão vem da planta): carrega, acompanha em tempo real e salva (admin). */
export function useHallSettings() {
  const { userSession, authReady, reportError } = useApp();
  const isTeam = userSession.role === 'CLOSER' || userSession.role === 'ADMIN';
  const [hall, setHall] = useState<HallSettings>(readCached);

  const fetchHall = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('event_settings')
      .select('vip_width_m, table_diameter_m')
      .eq('id', 1)
      .maybeSingle();
    if (error) {
      console.warn('Supabase hall settings fetch error, keeping cached/default:', error);
      return;
    }
    if (data) setHall(fromRow(data as HallRow));
  }, []);

  useEffect(() => {
    if (!supabase || !authReady || !isTeam) return;
    const client = supabase;
    fetchHall();
    const channel = client
      .channel('helper-hall')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_settings' }, () => fetchHall())
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [authReady, isTeam, fetchHall]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_HALL, JSON.stringify(hall));
    } catch {
      // armazenamento indisponível
    }
  }, [hall]);

  const saveHall = async (next: HallSettings) => {
    setHall(next);
    if (!supabase) return;
    const { error } = await supabase
      .from('event_settings')
      .update({
        vip_width_m: next.vipWidthM,
        table_diameter_m: next.tableDiameterM,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);
    if (error) {
      reportError('Não foi possível salvar as medidas do salão. Verifique a conexão e tente novamente.', error);
      fetchHall();
    }
  };

  return { hall, saveHall };
}
