import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Attendee } from '../types/index';
import type { SalesApi } from '../hooks/useSales';
import { ProposalSheet } from './ProposalSheet';
import { SALE_STATUS_LABELS, formatBRL, isClosedSale, type SaleStatus } from '../lib/sales';

const STATUS_DOT: Record<SaleStatus, string> = {
  CREATING: 'bg-slate-300',
  PENDING: 'bg-amber-400',
  ENTRY_PAID: 'bg-emerald-500',
  PAID: 'bg-emerald-700',
  CANCELLED: 'bg-slate-300',
  FAILED: 'bg-rose-500'
};

/** Painel de vendas do evento (admin): fechadas, aguardando e por closer, em tempo real. */
export const SalesPanel: React.FC<{ salesApi: SalesApi; closerName: string }> = ({ salesApi, closerName }) => {
  const { attendees } = useApp();
  const [openFor, setOpenFor] = useState<Attendee | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const byId = useMemo(() => new Map(attendees.map(a => [a.id, a])), [attendees]);

  const sales = salesApi.sales;
  const closed = sales.filter(s => isClosedSale(s.status));
  const pending = sales.filter(s => s.status === 'PENDING');
  const closedTotal = closed.reduce((acc, s) => acc + s.totalCents, 0);

  const byCloser = useMemo(() => {
    const map = new Map<string, { count: number; cents: number }>();
    for (const s of closed) {
      const cur = map.get(s.closerName) ?? { count: 0, cents: 0 };
      map.set(s.closerName, { count: cur.count + 1, cents: cur.cents + s.totalCents });
    }
    return [...map.entries()].sort((a, b) => b[1].cents - a[1].cents);
  }, [closed]);

  const visible = sales.filter(s => showCancelled || (s.status !== 'CANCELLED' && s.status !== 'FAILED'));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-semibold text-slate-500">Vendas fechadas</p>
          <p className="text-2xl font-extrabold text-emerald-700">{closed.length}</p>
          <p className="text-xs font-semibold text-slate-600">{formatBRL(closedTotal)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-semibold text-slate-500">Aguardando entrada</p>
          <p className="text-2xl font-extrabold text-amber-600">{pending.length}</p>
          <p className="text-xs font-semibold text-slate-600">{formatBRL(pending.reduce((acc, s) => acc + s.totalCents, 0))}</p>
        </div>
      </div>

      {byCloser.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Fechadas por closer</p>
          {byCloser.map(([name, v]) => (
            <div key={name} className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-800">{name}</span>
              <span className="text-slate-600">
                {v.count} · {formatBRL(v.cents)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <p className="text-xs font-bold text-slate-700">Propostas ({visible.length})</p>
          <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
            <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} />
            Mostrar canceladas
          </label>
        </div>
        <ul className="divide-y divide-slate-100">
          {visible.map(sale => {
            const person = byId.get(sale.attendeeId);
            return (
              <li key={sale.id}>
                <button
                  type="button"
                  onClick={() => person && setOpenFor(person)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[sale.status]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{person?.name ?? 'Participante removido'}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {sale.offerName} · {formatBRL(sale.totalCents)} · {sale.closerName}
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-slate-600 shrink-0 flex items-center gap-1">
                    {isClosedSale(sale.status) && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                    {SALE_STATUS_LABELS[sale.status]}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              </li>
            );
          })}
          {visible.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">Nenhuma proposta gerada ainda.</li>}
        </ul>
      </div>

      {openFor && <ProposalSheet attendee={openFor} salesApi={salesApi} closerName={closerName} onClose={() => setOpenFor(null)} />}
    </div>
  );
};
