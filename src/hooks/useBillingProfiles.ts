import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { billingFromRow, billingToRow, type BillingProfile, type BillingRow } from '../lib/billing';

/** Fichas de cobrança (tabela billing_profiles). Só o admin lê e grava; a RLS garante isso no banco. */
export function useBillingProfiles() {
  const { userSession, authReady, reportError } = useApp();
  const isAdmin = userSession.role === 'ADMIN';
  const [profiles, setProfiles] = useState<Map<string, BillingProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  /** A seção 9 do SQL ainda não foi rodada no banco */
  const [tableMissing, setTableMissing] = useState(false);

  const fetchProfiles = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.from('billing_profiles').select('*');
    setLoading(false);
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        setTableMissing(true);
        return;
      }
      reportError('Não foi possível carregar os dados de cobrança. Verifique a conexão e tente novamente.', error);
      return;
    }
    setTableMissing(false);
    setProfiles(new Map((data as BillingRow[]).map(row => [row.attendee_id, billingFromRow(row)])));
  }, [reportError]);

  useEffect(() => {
    if (!authReady || !isAdmin) return;
    fetchProfiles();
  }, [authReady, isAdmin, fetchProfiles]);

  /** Salva a ficha (cria ou atualiza). Retorna true se gravou. */
  const saveProfile = async (profile: BillingProfile): Promise<boolean> => {
    // Modo demonstração (sem Supabase): a ficha fica só na memória
    if (!supabase) {
      setProfiles(prev => new Map(prev).set(profile.attendeeId, profile));
      return true;
    }
    const row = { ...billingToRow(profile), updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('billing_profiles').upsert(row).select('*').single();
    if (error || !data) {
      reportError('Não foi possível salvar os dados de cobrança. Verifique a conexão e tente novamente.', error);
      return false;
    }
    setProfiles(prev => new Map(prev).set(profile.attendeeId, billingFromRow(data as BillingRow)));
    return true;
  };

  return { profiles, loading, tableMissing, saveProfile, refresh: fetchProfiles };
}
