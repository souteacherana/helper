import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import {
  addDays,
  MAX_DUE_DAYS,
  offerFromRow,
  partFromRow,
  saleFromRow,
  todaySaoPaulo,
  type Offer,
  type OfferRow,
  type PartDraft,
  type Sale,
  type SalePart,
  type SalePartRow,
  type SaleRow
} from '../lib/sales';

export interface BillingStatus {
  personType: 'PF' | 'PJ';
  /** Falta para o contrato (ficha completa) */
  missing: string[];
  /** Falta para cobrar no Asaas */
  missingForCharge: string[];
}

export interface CreateSaleInput {
  attendeeId: string;
  offerId: string;
  closerName: string;
  parts: PartDraft[];
}

// Modo demonstração (sem Supabase): produtos de exemplo e vendas só na memória
const DEMO_OFFERS: Offer[] = [
  { id: 'partiu10k', name: 'Partiu 10K', totalCents: 479640, condition: 'Exemplo: condição especial da Imersão', restricted: false, active: true, sortOrder: 1, contractTemplateUrl: '' },
  { id: 'elite', name: 'Professores de Elite', totalCents: 1200000, condition: 'Exemplo: 12 meses de mentoria', restricted: false, active: true, sortOrder: 2, contractTemplateUrl: '' },
  { id: 'mastermind', name: 'Mastermind', totalCents: null, condition: '', restricted: true, active: true, sortOrder: 3, contractTemplateUrl: '' }
];

/** Propostas e vendas da equipe: produtos, vendas com as partes e situação das fichas de cobrança. */
export function useSales() {
  const { userSession, authReady, reportError, attendees } = useApp();
  const isTeam = userSession.role === 'CLOSER' || userSession.role === 'ADMIN';
  const [offers, setOffers] = useState<Offer[]>(supabase ? [] : DEMO_OFFERS);
  const [access, setAccess] = useState<Map<string, Set<string>>>(new Map());
  const [sales, setSales] = useState<Sale[]>([]);
  const [billing, setBilling] = useState<Map<string, BillingStatus>>(new Map());
  /** A seção 10 do SQL ainda não foi rodada */
  const [tablesMissing, setTablesMissing] = useState(false);

  const fetchSales = useCallback(async () => {
    if (!supabase) return;
    const [offersRes, accessRes, salesRes, partsRes] = await Promise.all([
      supabase.from('offers').select('*').order('sort_order'),
      supabase.from('offer_access').select('*'),
      supabase.from('sales').select('*').order('created_at', { ascending: false }),
      supabase.from('sale_parts').select('*')
    ]);
    const error = offersRes.error || accessRes.error || salesRes.error || partsRes.error;
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') setTablesMissing(true);
      else console.warn('Supabase sales fetch error:', error);
      return;
    }
    setTablesMissing(false);
    setOffers((offersRes.data as OfferRow[]).map(offerFromRow));

    const accessMap = new Map<string, Set<string>>();
    for (const row of accessRes.data as { offer_id: string; attendee_id: string }[]) {
      const set = accessMap.get(row.offer_id) ?? new Set<string>();
      set.add(row.attendee_id);
      accessMap.set(row.offer_id, set);
    }
    setAccess(accessMap);

    const partsBySale = new Map<string, SalePart[]>();
    for (const row of partsRes.data as SalePartRow[]) {
      const list = partsBySale.get(row.sale_id) ?? [];
      list.push(partFromRow(row));
      partsBySale.set(row.sale_id, list);
    }
    setSales((salesRes.data as SaleRow[]).map(row => saleFromRow(row, partsBySale.get(row.id) ?? [])));
  }, []);

  const fetchBilling = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('billing_status');
    if (error) {
      console.warn('Supabase billing_status error:', error);
      return;
    }
    const rows = data as { attendee_id: string; person_type: 'PF' | 'PJ'; missing: string[]; missing_for_charge?: string[] }[];
    setBilling(
      new Map(
        rows.map(r => [
          r.attendee_id,
          { personType: r.person_type, missing: r.missing, missingForCharge: r.missing_for_charge ?? r.missing }
        ])
      )
    );
  }, []);

  // Modo demonstração: todas as fichas prontas para cobrança e contrato
  useEffect(() => {
    if (supabase) return;
    const demo: BillingStatus = { personType: 'PF', missing: [], missingForCharge: [] };
    setBilling(new Map(attendees.map(a => [a.id, demo])));
  }, [attendees]);

  // Busca inicial + tempo real (várias mudanças seguidas disparam uma busca só)
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!supabase || !authReady || !isTeam) return;
    const client = supabase;
    fetchSales();
    fetchBilling();
    const schedule = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(fetchSales, 250);
    };
    const channel = client
      .channel('helper-sales')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offer_access' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_parts' }, schedule)
      .subscribe();
    return () => {
      window.clearTimeout(timer.current);
      client.removeChannel(channel);
    };
  }, [authReady, isTeam, fetchSales, fetchBilling]);

  /** Chama uma rota /api/sales/* com a sessão. Retorna o corpo, ou { error } com a mensagem. */
  const callApi = async (route: string, body: unknown): Promise<Record<string, unknown>> => {
    if (!supabase) return { error: 'Sem conexão com o servidor.' };
    const { data } = await supabase.auth.getSession();
    try {
      const res = await fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify(body)
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) return { error: typeof json.error === 'string' ? json.error : 'Não foi possível concluir. Tente novamente.' };
      return json;
    } catch {
      return { error: 'Sem conexão. Verifique a internet e tente novamente.' };
    }
  };

  /** Gera a proposta e as cobranças. Retorna o id da venda, ou a mensagem de erro. */
  const createSale = async (input: CreateSaleInput): Promise<{ saleId?: string; error?: string }> => {
    if (!supabase) {
      const offer = offers.find(o => o.id === input.offerId)!;
      const saleId = `venda-demo${Date.now().toString(36)}`;
      const demo: Sale = {
        id: saleId,
        attendeeId: input.attendeeId,
        offerId: offer.id,
        offerName: offer.name,
        totalCents: offer.totalCents ?? 0,
        closerName: input.closerName,
        status: 'PENDING',
        error: '',
        createdAt: new Date().toISOString(),
        entryPaidAt: null,
        contractStatus: 'NONE',
        contractError: '',
        contractSentAt: null,
        contractSignedAt: null,
        parts: input.parts.map((p, position) => ({
          ...p,
          position,
          status: 'PENDING',
          paidInstallments: 0,
          invoiceUrl: `https://www.asaas.com/i/demonstracao-${position + 1}`,
          asaasPaymentId: '',
          asaasInstallmentId: ''
        }))
      };
      setSales(prev => [demo, ...prev]);
      return { saleId };
    }
    const result = await callApi('/api/sales/create', input);
    await fetchSales();
    return typeof result.error === 'string' ? { error: result.error } : { saleId: String(result.saleId) };
  };

  const cancelSale = async (saleId: string): Promise<string | null> => {
    if (!supabase) {
      setSales(prev => prev.map(s => (s.id === saleId ? { ...s, status: 'CANCELLED' } : s)));
      return null;
    }
    const result = await callApi('/api/sales/cancel', { saleId });
    await fetchSales();
    return typeof result.error === 'string' ? result.error : null;
  };

  const syncSale = async (saleId: string): Promise<string | null> => {
    if (!supabase) return null;
    const result = await callApi('/api/sales/sync', { saleId });
    await fetchSales();
    return typeof result.error === 'string' ? result.error : null;
  };

  /** Gera e envia o contrato (normalmente já sai sozinho quando a entrada é paga) */
  const generateContract = async (saleId: string): Promise<string | null> => {
    if (!supabase) return 'No modo demonstração não há D4Sign.';
    const result = await callApi('/api/contracts/create', { saleId });
    await fetchSales();
    return typeof result.error === 'string' ? result.error : null;
  };

  /** Confere na D4Sign se o cliente já assinou */
  const syncContract = async (saleId: string): Promise<string | null> => {
    if (!supabase) return null;
    const result = await callApi('/api/contracts/sync', { saleId });
    await fetchSales();
    return typeof result.error === 'string' ? result.error : null;
  };

  // ---------- Admin: produtos ----------

  const saveOffer = async (offer: Offer): Promise<boolean> => {
    if (!supabase) {
      setOffers(prev => prev.map(o => (o.id === offer.id ? offer : o)));
      return true;
    }
    const { error } = await supabase
      .from('offers')
      .update({
        name: offer.name.trim(),
        total_value: offer.totalCents === null ? null : offer.totalCents / 100,
        condition: offer.condition.trim() || null,
        restricted: offer.restricted,
        active: offer.active,
        contract_template_url: offer.contractTemplateUrl.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', offer.id);
    if (error) {
      reportError('Não foi possível salvar a proposta. Verifique a conexão e tente novamente.', error);
      return false;
    }
    await fetchSales();
    return true;
  };

  const setOfferAccess = async (offerId: string, attendeeId: string, allowed: boolean) => {
    setAccess(prev => {
      const next = new Map(prev);
      const set = new Set(next.get(offerId) ?? []);
      if (allowed) set.add(attendeeId);
      else set.delete(attendeeId);
      next.set(offerId, set);
      return next;
    });
    if (!supabase) return;
    const { error } = allowed
      ? await supabase.from('offer_access').upsert({ offer_id: offerId, attendee_id: attendeeId })
      : await supabase.from('offer_access').delete().eq('offer_id', offerId).eq('attendee_id', attendeeId);
    if (error) {
      reportError('Não foi possível alterar quem recebe esta proposta. Tente novamente.', error);
      fetchSales();
    }
  };

  /** Propostas que o closer pode oferecer para esta pessoa (ativas, com valor e liberadas). */
  const offersFor = (attendeeId: string) =>
    offers.filter(o => o.active && o.totalCents !== null && (!o.restricted || access.get(o.id)?.has(attendeeId)));

  return {
    offers,
    access,
    sales,
    billing,
    tablesMissing,
    offersFor,
    createSale,
    cancelSale,
    syncSale,
    generateContract,
    syncContract,
    saveOffer,
    setOfferAccess,
    refreshBilling: fetchBilling,
    /** Data padrão de vencimento para uma parte nova */
    defaultDueDate: () => todaySaoPaulo(),
    maxDueDate: () => addDays(todaySaoPaulo(), MAX_DUE_DAYS)
  };
}

export type SalesApi = ReturnType<typeof useSales>;
