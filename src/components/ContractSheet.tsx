import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, FileSignature, X } from 'lucide-react';
import type { Attendee } from '../types/index';
import type { SalesApi } from '../hooks/useSales';
import { formatDateBR } from '../lib/format';
import { METHOD_LABELS, formatBRL, installmentText, isClosedSale } from '../lib/sales';

interface ContractSheetProps {
  attendee: Attendee;
  salesApi: SalesApi;
  onClose: () => void;
}

/**
 * Contrato da venda fechada (entrada paga). Mostra o que vai para o contrato e o que falta
 * na ficha. A geração automática na D4Sign entra quando a integração for ligada.
 */
export const ContractSheet: React.FC<ContractSheetProps> = ({ attendee, salesApi, onClose }) => {
  const { refreshBilling } = salesApi;
  useEffect(() => {
    refreshBilling();
  }, [refreshBilling]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const closed = salesApi.sales.filter(s => s.attendeeId === attendee.id && isClosedSale(s.status));
  const missing = salesApi.billing.get(attendee.id)?.missing ?? ['Ficha vazia'];

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label={`Contrato de ${attendee.name}`}>
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" />
      <div className="relative w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="md:hidden mx-auto mt-2.5 w-10 h-1.5 rounded-full bg-slate-200" />
        <header className="px-5 pt-3 pb-3 md:pt-5 flex items-start justify-between gap-3 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Contrato</p>
            <h2 className="text-base font-extrabold text-slate-900 truncate">{attendee.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2.5 -mr-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {closed.map(sale => (
            <div key={sale.id} className="rounded-2xl border border-slate-200 p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-extrabold text-slate-900">{sale.offerName}</p>
                  <p className="text-xs text-slate-500">
                    {formatBRL(sale.totalCents)} · vendido por {sale.closerName}
                  </p>
                </div>
                <span className="text-[11px] font-bold px-2 py-1 rounded-md border bg-emerald-50 text-emerald-800 border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Entrada paga
                </span>
              </div>
              <ul className="text-xs text-slate-700 space-y-0.5">
                {sale.parts.map(p => (
                  <li key={p.position}>
                    • {METHOD_LABELS[p.method]}: {installmentText(p)} (vence {formatDateBR(p.dueDate)})
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {missing.length > 0 ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p>
                Para o contrato falta: <strong>{missing.join(', ')}</strong>. Peça ao admin para completar na tela Cobrança.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800 flex gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <p>Ficha completa para o contrato.</p>
            </div>
          )}

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 flex gap-2">
            <FileSignature className="w-4 h-4 shrink-0 text-slate-400" />
            <p>A geração do contrato pela D4Sign entra assim que a integração for ligada. Por enquanto, gere o contrato direto na D4Sign.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
