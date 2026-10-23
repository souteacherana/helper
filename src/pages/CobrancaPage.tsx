import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Search, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getBadgeLevel, type Attendee } from '../types/index';
import { Avatar } from '../components/Avatar';
import { BadgePill } from '../components/BadgePill';
import { BillingEditor } from '../components/BillingEditor';
import { OffersPanel } from '../components/OffersPanel';
import { SalesPanel } from '../components/SalesPanel';
import { useBillingProfiles } from '../hooks/useBillingProfiles';
import { useSales } from '../hooks/useSales';
import { missingBillingFields, newBillingProfile, type BillingProfile } from '../lib/billing';
import { matchesQuery } from '../lib/format';

type StatusFilter = 'ALL' | 'INCOMPLETE' | 'COMPLETE';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'INCOMPLETE', label: 'Incompletas' },
  { value: 'COMPLETE', label: 'Completas' }
];

const EMPTY_PROFILE = 'Ficha vazia';

type Tab = 'FICHAS' | 'PROPOSTAS' | 'VENDAS';
const TABS: { value: Tab; label: string }[] = [
  { value: 'FICHAS', label: 'Fichas' },
  { value: 'PROPOSTAS', label: 'Propostas' },
  { value: 'VENDAS', label: 'Vendas' }
];

/** Dados de cobrança e contrato, produtos oferecidos e painel de vendas (só admin). */
export const CobrancaPage: React.FC = () => {
  const { attendees, userSession } = useApp();
  const { profiles, loading, tableMissing, saveProfile } = useBillingProfiles();
  const salesApi = useSales();
  const [tab, setTab] = useState<Tab>('FICHAS');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('INCOMPLETE');
  const [editing, setEditing] = useState<{ attendee: Attendee; profile: BillingProfile } | null>(null);

  const rows = useMemo(
    () =>
      [...attendees]
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map(attendee => {
          const profile = profiles.get(attendee.id);
          return { attendee, profile, missing: profile ? missingBillingFields(profile) : [EMPTY_PROFILE] };
        }),
    [attendees, profiles]
  );

  const completeCount = rows.filter(r => r.missing.length === 0).length;

  // Quantas fichas não têm cada campo (mostra onde a equipe precisa focar)
  const missingTally = useMemo(() => {
    const tally = new Map<string, number>();
    for (const r of rows) for (const m of r.missing) tally.set(m, (tally.get(m) ?? 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const visible = rows.filter(
    r =>
      (status === 'ALL' || (status === 'COMPLETE') === (r.missing.length === 0)) &&
      matchesQuery(search, [r.attendee.name, r.profile?.email, r.profile?.cpf], r.attendee.phone)
  );

  const percent = rows.length ? Math.round((completeCount / rows.length) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 pb-24">
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">Cobrança</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Fichas com CPF e endereço (só o admin vê), propostas que os closers oferecem e as vendas do evento.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-200/60">
        {TABS.map(t => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            aria-pressed={tab === t.value}
            className={`py-2.5 rounded-lg text-xs font-bold transition ${
              tab === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'FICHAS' && salesApi.tablesMissing ? (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl p-4 text-sm flex gap-2.5">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p>
            O banco ainda não tem as tabelas de propostas. Rode a <strong>seção 10</strong> do <code>supabase_schema.sql</code> no
            SQL Editor do Supabase e recarregue a página.
          </p>
        </div>
      ) : tab === 'PROPOSTAS' ? (
        <OffersPanel salesApi={salesApi} />
      ) : tab === 'VENDAS' ? (
        <SalesPanel salesApi={salesApi} closerName={userSession.userName || 'Admin'} />
      ) : tableMissing ? (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl p-4 text-sm flex gap-2.5">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p>
            O banco ainda não tem a tabela de cobrança. Rode a <strong>seção 9</strong> do <code>supabase_schema.sql</code> no SQL
            Editor do Supabase e recarregue a página.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
            <div className="flex items-end justify-between gap-3">
              <p className="text-sm text-slate-700">
                <strong className="text-2xl font-extrabold text-slate-900">{loading ? '…' : completeCount}</strong>
                <span className="text-slate-500"> de {rows.length} fichas completas</span>
              </p>
              <span className="text-xs font-bold text-slate-500">{percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
            </div>
            {!loading && missingTally.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {missingTally.map(([label, count]) => (
                  <span key={label} className="text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200 rounded-md px-2 py-0.5">
                    {label}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-3 sm:px-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por nome, e-mail, CPF ou telefone..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-200/60 sm:w-80 shrink-0">
                {STATUS_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setStatus(o.value)}
                    aria-pressed={status === o.value}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition ${
                      status === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <ul className="divide-y divide-slate-100">
              {visible.map(({ attendee, profile, missing }) => (
                <li key={attendee.id}>
                  <button
                    type="button"
                    onClick={() => setEditing({ attendee, profile: profile ?? newBillingProfile(attendee) })}
                    className="w-full text-left px-3 sm:px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition"
                  >
                    <Avatar name={attendee.name} photoUrl={attendee.photoUrl} className="w-10 h-10 rounded-lg" textClassName="text-xs" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-slate-900 truncate">{attendee.name}</span>
                        <BadgePill level={getBadgeLevel(attendee)} size="sm" />
                        {profile?.personType === 'PJ' && (
                          <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">CNPJ</span>
                        )}
                      </div>
                      {missing.length === 0 ? (
                        <p className="mt-0.5 text-xs font-semibold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Completa
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-amber-800 truncate">
                          {missing[0] === EMPTY_PROFILE ? EMPTY_PROFILE : `Falta: ${missing.join(', ')}`}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </button>
                </li>
              ))}
              {visible.length === 0 && (
                <li className="px-5 py-10 text-center text-sm text-slate-500">
                  {loading ? 'Carregando...' : 'Nenhuma ficha neste filtro.'}
                </li>
              )}
            </ul>
          </div>
        </>
      )}

      {editing && (
        <BillingEditor
          attendee={editing.attendee}
          initial={editing.profile}
          onSave={saveProfile}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};
