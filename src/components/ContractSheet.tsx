import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSignature, Loader2, RefreshCw, Send, X } from 'lucide-react';
import type { Attendee } from '../types/index';
import type { SalesApi } from '../hooks/useSales';
import { formatDateBR } from '../lib/format';
import {
  CONTRACT_STATUS_LABELS,
  METHOD_LABELS,
  chargedCents,
  formatBRL,
  installmentText,
  isClosedSale,
  type ContractStatus,
  type Sale
} from '../lib/sales';

interface ContractSheetProps {
  attendee: Attendee;
  salesApi: SalesApi;
  onClose: () => void;
}

const STATUS_STYLE: Record<ContractStatus, string> = {
  NONE: 'bg-slate-100 text-slate-600 border-slate-200',
  CREATING: 'bg-slate-100 text-slate-600 border-slate-200',
  SENT: 'bg-amber-50 text-amber-800 border-amber-200',
  SIGNED: 'bg-emerald-600 text-white border-emerald-600',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
  FAILED: 'bg-rose-50 text-rose-700 border-rose-200'
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

const SaleContract: React.FC<{ sale: Sale; salesApi: SalesApi }> = ({ sale, salesApi }) => {
  const [busy, setBusy] = useState<'send' | 'sync' | null>(null);
  const [message, setMessage] = useState('');
  const status = sale.contractStatus;
  const canSend = status === 'NONE' || status === 'FAILED' || status === 'CANCELLED';

  const send = async () => {
    setBusy('send');
    setMessage((await salesApi.generateContract(sale.id)) ?? '');
    setBusy(null);
  };
  const sync = async () => {
    setBusy('sync');
    setMessage((await salesApi.syncContract(sale.id)) ?? '');
    setBusy(null);
  };

  return (
    <div className="rounded-2xl border border-slate-200 p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-extrabold text-slate-900">{sale.offerName}</p>
          <p className="text-xs text-slate-500">
            {formatBRL(chargedCents(sale))} · vendido por {sale.closerName}
          </p>
        </div>
        <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-md border flex items-center gap-1 ${STATUS_STYLE[status]}`}>
          {status === 'SIGNED' && <CheckCircle2 className="w-3.5 h-3.5" />}
          {status === 'CREATING' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {CONTRACT_STATUS_LABELS[status]}
        </span>
      </div>

      <ul className="text-xs text-slate-700 space-y-0.5">
        {sale.parts.map(p => (
          <li key={p.position}>
            • {METHOD_LABELS[p.method]}: {installmentText(p)} (vence {formatDateBR(p.dueDate)})
          </li>
        ))}
      </ul>

      {status === 'SENT' && sale.contractSentAt && (
        <p className="text-xs text-slate-600">Enviado em {when(sale.contractSentAt)} para o e-mail da ficha de cobrança. Aguardando a assinatura do cliente.</p>
      )}
      {status === 'SIGNED' && sale.contractSignedAt && <p className="text-xs font-semibold text-emerald-700">Assinado em {when(sale.contractSignedAt)}.</p>}
      {status === 'FAILED' && sale.contractError && <p className="text-xs font-semibold text-rose-700">{sale.contractError}</p>}

      <div className="flex flex-wrap gap-2">
        {canSend && (
          <button
            type="button"
            onClick={send}
            disabled={busy !== null}
            className="flex-1 min-w-[10rem] py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {busy === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {busy === 'send' ? 'Gerando e enviando…' : status === 'NONE' ? 'Gerar e enviar contrato' : 'Tentar de novo'}
          </button>
        )}
        {(status === 'SENT' || status === 'CREATING') && (
          <button
            type="button"
            onClick={sync}
            disabled={busy !== null}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        )}
      </div>
      {message && <p className="text-xs font-semibold text-rose-700">{message}</p>}
    </div>
  );
};

/**
 * Contrato da venda fechada (entrada paga): sai sozinho pela D4Sign para o e-mail do cliente;
 * aqui o closer acompanha se foi enviado e assinado, e pode tentar de novo se der erro.
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
          {missing.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p>
                Ficha de cobrança incompleta: falta <strong>{missing.join(', ')}</strong>. O contrato sai com lacunas nesses campos; peça ao
                admin para completar na tela Cobrança.
              </p>
            </div>
          )}

          {closed.map(sale => (
            <SaleContract key={sale.id} sale={sale} salesApi={salesApi} />
          ))}

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 flex gap-2">
            <FileSignature className="w-4 h-4 shrink-0 text-slate-400" />
            <p>
              O contrato é gerado sozinho quando a entrada é paga e vai pela D4Sign para o e-mail da ficha. A Ana e as testemunhas já vêm
              pré-assinadas; só o cliente assina.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
