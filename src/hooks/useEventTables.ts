import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { DEFAULT_TABLE_COUNTS, arrangeAll, areaAt, type MapAreaKey, type MapGeometry, newTableId } from '../lib/eventMap';
import type { EventTable } from '../types/index';

const STORAGE_KEY_TABLES = 'helper_rise_tables_v1';

const sortTables = (list: EventTable[]) =>
  [...list].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true }));

function readCachedTables(): EventTable[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_TABLES);
    if (stored) return JSON.parse(stored) as EventTable[];
  } catch {
    // cache inválido: começa vazio
  }
  return [];
}

/**
 * Mesas do mapa do evento: carrega, acompanha em tempo real e expõe as ações do admin.
 * As alterações aparecem na hora na tela e depois são confirmadas no banco; em caso de
 * erro, o aviso aparece e as mesas são recarregadas do banco.
 */
export function useEventTables() {
  const { userSession, authReady, reportError } = useApp();
  const isTeam = userSession.role === 'CLOSER' || userSession.role === 'ADMIN';

  const [tables, setTables] = useState<EventTable[]>(readCachedTables);
  const [loading, setLoading] = useState(Boolean(supabase));

  const fetchTables = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('event_tables').select('id, label, x, y, seats');
    setLoading(false);
    if (error) {
      console.warn('Supabase tables fetch error, keeping cached map:', error);
      return;
    }
    setTables(sortTables(data as EventTable[]));
  }, []);

  useEffect(() => {
    if (!supabase || !authReady || !isTeam) return;
    const client = supabase;
    fetchTables();
    const channel = client
      .channel('helper-map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_tables' }, () => fetchTables())
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [authReady, isTeam, fetchTables]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TABLES, JSON.stringify(tables));
    } catch {
      // armazenamento indisponível: o mapa só não fica em cache
    }
  }, [tables]);

  const run = async (action: string, op: () => PromiseLike<{ error: unknown }>) => {
    if (!supabase) return true;
    const { error } = await op();
    if (error) {
      reportError(`Não foi possível ${action}. Verifique a conexão e tente novamente.`, error);
      fetchTables();
      return false;
    }
    return true;
  };

  const addTable = (table: Omit<EventTable, 'id'>): EventTable => {
    const created = { ...table, id: newTableId() };
    setTables(prev => sortTables([...prev, created]));
    if (supabase) run('criar a mesa', () => supabase!.from('event_tables').insert(created));
    return created;
  };

  const updateTable = (id: string, changes: Partial<Omit<EventTable, 'id'>>) => {
    setTables(prev => sortTables(prev.map(t => (t.id === id ? { ...t, ...changes } : t))));
    if (!supabase) return;
    const client = supabase;

    run('salvar a mesa', () => client.from('event_tables').update(changes).eq('id', id));
  };

  // Excluir a mesa libera os lugares de quem estava nela (ON DELETE SET NULL no banco)
  const deleteTable = (id: string) => {
    setTables(prev => prev.filter(t => t.id !== id));
    if (supabase) run('excluir a mesa', () => supabase!.from('event_tables').delete().eq('id', id));
  };

  /** Salva o resultado de uma reorganização: mesas novas/movidas/renumeradas e as que saíram. */
  const applyArrangement = (action: string, arranged: EventTable[], removed: EventTable[]) => {
    setTables(sortTables(arranged));
    if (!supabase) return;
    const client = supabase;
    run(action, async () => {
      const saved = await client.from('event_tables').upsert(arranged);
      if (saved.error || removed.length === 0) return saved;
      return client.from('event_tables').delete().in('id', removed.map(t => t.id));
    });
  };

  const countsByArea = (geo: MapGeometry): Record<MapAreaKey, number> => {
    const counts = { SILVER_LEFT: 0, VIP: 0, SILVER_RIGHT: 0 };
    for (const t of tables) counts[areaAt(geo, t.x).key]++;
    return counts;
  };

  /**
   * Define quantas mesas a área tem. As mesas são reorganizadas em fileiras; as que sobram
   * são as últimas (fundo, à direita) e quem estava nelas fica sem lugar. Todas as mesas
   * são renumeradas na ordem do mapa.
   */
  const setAreaTableCount = (geo: MapGeometry, areaKey: MapAreaKey, count: number, seatsForNew: number) => {
    const { arranged, removed } = arrangeAll(geo, { ...countsByArea(geo), [areaKey]: count }, tables, seatsForNew);
    applyArrangement('alterar a quantidade de mesas', arranged, removed);
  };

  /** Reorganiza todas as mesas na escala atual do salão (ex: depois de mudar as medidas). */
  const rearrangeAll = (geo: MapGeometry, seatsForNew: number) => {
    const { arranged, removed } = arrangeAll(geo, countsByArea(geo), tables, seatsForNew);
    applyArrangement('reorganizar as mesas', arranged, removed);
  };

  /** Mesmo número de lugares em todas as mesas (quem perde o lugar é tratado por releaseSeatsAbove). */
  const setAllSeats = (seats: number) => {
    setTables(prev => prev.map(t => ({ ...t, seats })));
    if (!supabase) return;
    const client = supabase;
    run('alterar os lugares das mesas', () => client.from('event_tables').update({ seats }).in('id', tables.map(t => t.id)));
  };

  const createDefaultLayout = async (geo: MapGeometry) => {
    const { arranged } = arrangeAll(geo, DEFAULT_TABLE_COUNTS, [], 7);
    setTables(sortTables(arranged));
    if (supabase) await run('criar o mapa', () => supabase!.from('event_tables').insert(arranged));
  };

  return {
    tables,
    loading: loading && tables.length === 0,
    addTable,
    updateTable,
    deleteTable,
    createDefaultLayout,
    setAreaTableCount,
    rearrangeAll,
    setAllSeats
  };
}
