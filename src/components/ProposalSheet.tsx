import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  Plus,
  QrCode,
  RefreshCw,
  Trash2,
  X,
  XCircle
} from 'lucide-react';
import type { Attendee } from '../types/index';
import { getBadgeLevel } from '../types/index';
import { BadgePill } from './BadgePill';
import type { SalesApi } from '../hooks/useSales';
import { buildWhatsAppUrl, formatCurrencyInput, formatDateBR } from '../lib/format';
import {
  MAX_INSTALLMENTS,
  MAX_PARTS,
  METHOD_LABELS,
  PART_STATUS_LABELS,
  PAY_METHODS,
  SALE_STATUS_LABELS,
  formatBRL,
  installmentText,
  isClosedSale,
  isOpenSale,
  parseBRL,
  validateParts,
  type Offer,
  type PartDraft,
  type PayMethod,
  type Sale,
  type SalePart,
  type SaleStatus
} from '../lib/sales';

interface ProposalSheetProps {
  attendee: Attendee;
  salesApi: SalesApi;
  closerName: string;
  onClose: () => void;
}

interface PartForm {
  method: PayMethod;
  amount: string;
  installments: number;
  dueDate: string;
}

const partLabel = (index: number, count: number) => (count === 1 ? 'Pagamento' : index === 0 ? 'Entrada' : `Parte ${index + 1}`);

const SALE_STATUS_STYLE: Record<SaleStatus, string> = {
  CREATING: 'bg-slate-100 text-slate-600 border-slate-200',
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
  ENTRY_PAID: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  PAID: 'bg-emerald-600 text-white border-emerald-600',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
  FAILED: 'bg-rose-50 text-rose-700 border-rose-200'
};

const toDraft = (p: PartForm): PartDraft => ({
  method: p.method,
  amountCents: parseBRL(p.amount),
  installments: p.method === 'PIX' ? 1 : p.installments,
  dueDate: p.dueDate
});

/** QR do link de pagamento, para o cliente escanear com o celular dele. */
const QrImage: React.FC<{ text: string }> = ({ text }) => {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: 240 }).then(setSrc).catch(() => setSrc(''));
  }, [text]);
  return src ? <img src={src} alt="QR Code do link de pagamento" className="w-48 h-48 mx-auto" /> : null;
};

const PartLine: React.FC<{ part: SalePart; count: number; canAct: boolean }> = ({ part, count, canAct }) => {
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(part.invoiceUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copie o link:', part.invoiceUrl);
    }
  };
  const paid = part.status === 'PAID';
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900">
            {partLabel(part.position, count)} · {METHOD_LABELS[part.method]}
          </p>
          <p className="text-xs text-slate-600">
            {installmentText(part)} · vence {formatDateBR(part.dueDate)}
          </p>
        </div>
        <span
          className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-md border ${
            paid ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : part.status === 'OVERDUE' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-white text-slate-600 border-slate-200'
          }`}
        >
          {PART_STATUS_LABELS[part.status]}
          {part.installments > 1 && part.paidInstallments > 0 && !paid ? ` ${part.paidInstallments}/${part.installments}` : ''}
        </span>
      </div>
      {canAct && part.invoiceUrl && !paid && (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" onClick={copy} className="py-2 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700 flex items-center justify-center gap-1">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button
              type="button"
              onClick={() => setShowQr(v => !v)}
              aria-pressed={showQr}
              className={`py-2 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1 ${
                showQr ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" /> QR
            </button>
            <a href={part.invoiceUrl} target="_blank" rel="noopener noreferrer" className="py-2 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700 flex items-center justify-center gap-1">
              <ExternalLink className="w-3.5 h-3.5" /> Abrir
            </a>
          </div>
          {showQr && (
            <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
              <QrImage text={part.invoiceUrl} />
              <p className="text-[11px] text-slate-500 mt-1">O cliente aponta a câmera e paga no celular dele.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const SaleCard: React.FC<{ sale: Sale; attendee: Attendee; salesApi: SalesApi; highlight: boolean }> = ({ sale, attendee, salesApi, highlight }) => {
  const [busy, setBusy] = useState<'sync' | 'cancel' | null>(null);
  const [message, setMessage] = useState('');
  const open = sale.status === 'PENDING' || sale.status === 'ENTRY_PAID';
  const hasPayment = sale.parts.some(p => p.paidInstallments > 0);
  const pendingParts = sale.parts.filter(p => p.status !== 'PAID' && p.invoiceUrl);

  const whatsappUrl = useMemo(() => {
    if (!pendingParts.length) return null;
    const first = attendee.name.split(' ')[0];
    const lines = pendingParts.map(
      p => `• ${partLabel(p.position, sale.parts.length)} (${METHOD_LABELS[p.method]}, ${installmentText(p)}): ${p.invoiceUrl}`
    );
    return buildWhatsAppUrl(
      attendee.phone,
      `Olá, ${first}! Seguem os links de pagamento (${sale.offerName}):\n\n${lines.join('\n')}\n\nQualquer dúvida, estou aqui!`
    );
  }, [attendee, sale, pendingParts]);

  const sync = async () => {
    setBusy('sync');
    setMessage((await salesApi.syncSale(sale.id)) ?? '');
    setBusy(null);
  };
  const cancel = async () => {
    if (!window.confirm(`Cancelar a proposta de ${sale.offerName}? Os links de pagamento deixam de funcionar.`)) return;
    setBusy('cancel');
    setMessage((await salesApi.cancelSale(sale.id)) ?? '');
    setBusy(null);
  };

  return (
    <div className={`rounded-2xl border p-3.5 space-y-3 ${highlight ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-slate-900">{sale.offerName}</p>
          <p className="text-xs text-slate-500">
            {formatBRL(sale.totalCents)} · {sale.closerName} · {new Date(sale.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-md border flex items-center gap-1 ${SALE_STATUS_STYLE[sale.status]}`}>
          {(sale.status === 'ENTRY_PAID' || sale.status === 'PAID') && <CheckCircle2 className="w-3.5 h-3.5" />}
          {SALE_STATUS_LABELS[sale.status]}
        </span>
      </div>

      {sale.status === 'FAILED' && sale.error && <p className="text-xs font-semibold text-rose-700">O Asaas recusou: {sale.error}</p>}

      {sale.status !== 'FAILED' && (
        <div className="space-y-2">
          {sale.parts.map(p => (
            <PartLine key={p.position} part={p} count={sale.parts.length} canAct={open} />
          ))}
        </div>
      )}

      {open && (
        <div className="flex flex-wrap gap-2">
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-[10rem] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <MessageCircle className="w-4 h-4" /> Enviar links no WhatsApp
            </a>
          )}
          <button type="button" onClick={sync} disabled={busy !== null} className="px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {!hasPayment && (
            <button type="button" onClick={cancel} disabled={busy !== null} className="px-3 py-2.5 rounded-xl border border-rose-200 text-xs font-bold text-rose-700 flex items-center gap-1.5 disabled:opacity-50">
              <XCircle className="w-3.5 h-3.5" /> Cancelar
            </button>
          )}
        </div>
      )}
      {message && <p className="text-xs font-semibold text-rose-700">{message}</p>}
    </div>
  );
};

const Composer: React.FC<{
  offer: Offer;
  attendee: Attendee;
  salesApi: SalesApi;
  closerName: string;
  blocked: boolean;
  onBack: () => void;
  onCreated: (saleId: string) => void;
}> = ({ offer, attendee, salesApi, closerName, blocked, onBack, onCreated }) => {
  const total = offer.totalCents ?? 0;
  const today = salesApi.defaultDueDate();
  const [parts, setParts] = useState<PartForm[]>([{ method: 'PIX', amount: '', installments: 1, dueDate: today }]);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState('');

  const drafts = parts.map(toDraft);
  const used = drafts.reduce((acc, p) => acc + (Number.isFinite(p.amountCents) ? p.amountCents : 0), 0);
  const remaining = total - used;
  const errors = validateParts(total, drafts.map(d => ({ ...d, amountCents: Number.isFinite(d.amountCents) ? d.amountCents : 0 })), today);

  const update = (i: number, patch: Partial<PartForm>) =>
    setParts(prev =>
      prev.map((p, idx) => {
        if (idx !== i) return p;
        const next = { ...p, ...patch };
        next.installments = Math.min(Math.max(1, next.installments), MAX_INSTALLMENTS[next.method]);
        return next;
      })
    );

  const addPart = () =>
    setParts(prev => [
      ...prev,
      { method: 'CREDIT_CARD', amount: remaining > 0 ? formatBRL(remaining) : '', installments: MAX_INSTALLMENTS.CREDIT_CARD, dueDate: today }
    ]);

  const submit = async () => {
    setTried(true);
    setServerError('');
    if (errors.length || blocked) return;
    setSending(true);
    const result = await salesApi.createSale({ attendeeId: attendee.id, offerId: offer.id, closerName, parts: drafts });
    setSending(false);
    if (result.error) setServerError(result.error);
    else if (result.saleId) onCreated(result.saleId);
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Propostas
      </button>

      <div className="rounded-2xl bg-slate-900 text-white p-4">
        <p className="text-xs font-semibold text-slate-300">{offer.name}</p>
        <p className="text-2xl font-extrabold tracking-tight">{formatBRL(total)}</p>
        {offer.condition && <p className="text-xs text-slate-300 mt-1">{offer.condition}</p>}
      </div>

      <div className="space-y-3">
        {parts.map((part, i) => {
          const max = MAX_INSTALLMENTS[part.method];
          const draft = drafts[i];
          return (
            <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{partLabel(i, parts.length)}</p>
                {parts.length > 1 && (
                  <button type="button" onClick={() => setParts(prev => prev.filter((_, idx) => idx !== i))} className="p-1.5 -m-1.5 text-slate-400 hover:text-rose-600" aria-label="Remover esta parte">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100">
                {PAY_METHODS.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => update(i, { method: m, installments: m === part.method ? part.installments : MAX_INSTALLMENTS[m] })}
                    aria-pressed={part.method === m}
                    className={`py-2 rounded-lg text-xs font-bold transition ${part.method === m ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500'}`}
                  >
                    {METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
                  Valor
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    value={part.amount}
                    onChange={e => update(i, { amount: formatCurrencyInput(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </label>
                {part.method === 'PIX' ? (
                  <div className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
                    Parcelas
                    <span className="px-3 py-2.5 text-sm font-semibold text-slate-500">À vista</span>
                  </div>
                ) : (
                  <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
                    Parcelas
                    <select
                      value={part.installments}
                      onChange={e => update(i, { installments: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
                    >
                      {Array.from({ length: max }, (_, n) => n + 1).map(n => (
                        <option key={n} value={n}>
                          {n}x{Number.isFinite(draft.amountCents) && draft.amountCents > 0 ? ` de ${formatBRL(Math.round(draft.amountCents / n))}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="col-span-2 flex flex-col gap-1 text-[11px] font-bold text-slate-600">
                  Vencimento{part.installments > 1 ? ' da 1ª parcela' : ''}
                  <input
                    type="date"
                    min={today}
                    max={salesApi.maxDueDate()}
                    value={part.dueDate}
                    onChange={e => update(i, { dueDate: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </label>
              </div>
              {part.method === 'BOLETO' && <p className="text-[11px] text-slate-500">Boleto pago depois do vencimento tem multa de R$ 40.</p>}
            </div>
          );
        })}

        {parts.length < MAX_PARTS && (
          <button
            type="button"
            onClick={addPart}
            className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {remaining > 0 ? `Adicionar forma de pagamento para o restante (${formatBRL(remaining)})` : 'Adicionar forma de pagamento'}
          </button>
        )}
      </div>

      <div
        className={`rounded-xl px-3 py-2.5 text-xs font-bold flex items-center justify-between ${
          remaining === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'
        }`}
      >
        <span>{remaining === 0 ? 'Total fechado' : remaining > 0 ? 'Falta distribuir' : 'Passou do total'}</span>
        <span>{formatBRL(Math.abs(remaining))}</span>
      </div>

      {tried && errors.length > 0 && (
        <ul className="text-xs font-semibold text-rose-700 space-y-0.5">
          {errors.map(e => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}
      {serverError && <p className="text-xs font-semibold text-rose-700">{serverError}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={sending || blocked}
        className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2"
      >
        {sending && <Loader2 className="w-4 h-4 animate-spin" />}
        {sending ? 'Gerando no Asaas…' : 'Gerar links de pagamento'}
      </button>
      <p className="text-[11px] text-slate-400 text-center">Vendedor: {closerName}</p>
    </div>
  );
};

/** Propostas da pessoa: produtos para oferecer, montagem do pagamento e links gerados. */
export const ProposalSheet: React.FC<ProposalSheetProps> = ({ attendee, salesApi, closerName, onClose }) => {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
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

  const status = salesApi.billing.get(attendee.id);
  const missingCharge = status?.missingForCharge ?? ['Ficha vazia'];
  const blocked = missingCharge.length > 0;
  const sales = salesApi.sales.filter(s => s.attendeeId === attendee.id && s.status !== 'CANCELLED');
  const cancelledCount = salesApi.sales.filter(s => s.attendeeId === attendee.id && s.status === 'CANCELLED').length;
  const offers = salesApi.offersFor(attendee.id);
  const openByOffer = new Map(sales.filter(s => isOpenSale(s.status)).map(s => [s.offerId, s.status]));

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label={`Propostas para ${attendee.name}`}>
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" />
      <div className="relative w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="md:hidden mx-auto mt-2.5 w-10 h-1.5 rounded-full bg-slate-200" />
        <header className="px-5 pt-3 pb-3 md:pt-5 flex items-start justify-between gap-3 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Propostas</p>
            <h2 className="text-base font-extrabold text-slate-900 truncate">{attendee.name}</h2>
            <div className="mt-1 flex items-center gap-2">
              <BadgePill level={getBadgeLevel(attendee)} size="sm" />
              {blocked ? (
                <span className="text-[11px] font-bold text-amber-800">Ficha de cobrança incompleta</span>
              ) : (
                <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Pronta para cobrança
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2.5 -mr-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {blocked && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p>
                Para gerar a cobrança falta: <strong>{missingCharge.join(', ')}</strong>. Peça ao admin para completar na tela Cobrança.
              </p>
            </div>
          )}

          {offer ? (
            <Composer
              offer={offer}
              attendee={attendee}
              salesApi={salesApi}
              closerName={closerName}
              blocked={blocked}
              onBack={() => setOffer(null)}
              onCreated={saleId => {
                setHighlightId(saleId);
                setOffer(null);
              }}
            />
          ) : (
            <>
              {sales.length > 0 && (
                <section className="space-y-2.5">
                  {sales.map(sale => (
                    <SaleCard key={sale.id} sale={sale} attendee={attendee} salesApi={salesApi} highlight={sale.id === highlightId} />
                  ))}
                  {cancelledCount > 0 && <p className="text-[11px] text-slate-400">{cancelledCount} proposta(s) cancelada(s) não aparecem aqui.</p>}
                </section>
              )}

              <section className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Nova proposta</h3>
                {offers.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhuma proposta disponível ainda. O admin precisa cadastrar os valores na tela Cobrança.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {offers.map(o => {
                      const openStatus = openByOffer.get(o.id);
                      const already = openStatus !== undefined;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          disabled={already || blocked}
                          onClick={() => setOffer(o)}
                          className="text-left rounded-xl border border-slate-200 hover:border-slate-900 p-3.5 transition disabled:opacity-50 disabled:hover:border-slate-200"
                        >
                          <p className="text-sm font-extrabold text-slate-900">{o.name}</p>
                          <p className="text-xs font-semibold text-slate-600">{formatBRL(o.totalCents ?? 0)}</p>
                          {already && (
                            <p className="text-[11px] font-bold text-amber-700 mt-1">
                              {openStatus && isClosedSale(openStatus) ? 'Já vendido' : 'Já tem proposta aberta'}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
