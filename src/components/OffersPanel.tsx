import React, { useMemo, useState } from 'react';
import { Save, Search, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { SalesApi } from '../hooks/useSales';
import { formatCurrencyInput, matchesQuery } from '../lib/format';
import { formatBRL, parseBRL, pixCashCents, pixCashDiscount, type Offer } from '../lib/sales';

const OfferEditor: React.FC<{ offer: Offer; salesApi: SalesApi }> = ({ offer, salesApi }) => {
  const { attendees } = useApp();
  const [form, setForm] = useState({
    name: offer.name,
    total: offer.totalCents === null ? '' : formatBRL(offer.totalCents),
    condition: offer.condition,
    active: offer.active,
    restricted: offer.restricted,
    contractTemplateUrl: offer.contractTemplateUrl
  });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const totalCents = form.total.trim() ? parseBRL(form.total) : null;
  const invalidTotal = totalCents !== null && (!Number.isFinite(totalCents) || totalCents <= 0);
  const dirty =
    form.name !== offer.name ||
    totalCents !== offer.totalCents ||
    form.condition !== offer.condition ||
    form.active !== offer.active ||
    form.restricted !== offer.restricted ||
    form.contractTemplateUrl !== offer.contractTemplateUrl;

  const allowed = useMemo(() => salesApi.access.get(offer.id) ?? new Set<string>(), [salesApi.access, offer.id]);
  const listed = useMemo(
    () =>
      attendees.filter(a => (search.trim() ? matchesQuery(search, [a.name], a.phone) : allowed.has(a.id))),
    [attendees, search, allowed]
  );

  const save = async () => {
    if (invalidTotal || !form.name.trim()) return;
    setSaving(true);
    await salesApi.saveOffer({
      ...offer,
      name: form.name,
      totalCents,
      condition: form.condition,
      active: form.active,
      restricted: form.restricted,
      contractTemplateUrl: form.contractTemplateUrl
    });
    setSaving(false);
  };

  const input = 'w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-normal text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-slate-900">{offer.name}</h3>
        {offer.totalCents === null || !offer.active ? (
          <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">Não aparece para os closers</span>
        ) : (
          <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">No ar</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
          Nome (aparece na cobrança do cliente)
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
          Valor total (fixo)
          <input
            inputMode="numeric"
            placeholder="Ainda sem valor"
            value={form.total}
            onChange={e => setForm({ ...form, total: formatCurrencyInput(e.target.value) })}
            className={`${input} ${invalidTotal ? 'border-rose-400' : ''}`}
          />
          {totalCents !== null && !invalidTotal && (
            <span className="font-semibold text-emerald-700">
              Pix à vista ({Math.round(pixCashDiscount(offer.id) * 100)}% de desconto): {formatBRL(pixCashCents(totalCents, offer.id))}
            </span>
          )}
        </label>
        <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-bold text-slate-600">
          Condição do evento (o closer vê ao montar a proposta)
          <textarea
            rows={2}
            value={form.condition}
            onChange={e => setForm({ ...form, condition: e.target.value })}
            placeholder="Ex: 12 meses de mentoria pelo preço de 10"
            className={input}
          />
        </label>
        <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-bold text-slate-600">
          <span>
            Modelo do contrato (.docx com campos [[...]]){' '}
            {offer.contractTemplateUrl ? <span className="text-emerald-700">· configurado</span> : <span className="text-amber-700">· sem modelo, o contrato não é gerado</span>}
          </span>
          <input
            type="url"
            placeholder="Link do modelo no Blob"
            value={form.contractTemplateUrl}
            onChange={e => setForm({ ...form, contractTemplateUrl: e.target.value })}
            className={input}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-2 py-1 font-semibold text-slate-700">
          <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
          Ativa
        </label>
        <label className="flex items-center gap-2 py-1 font-semibold text-slate-700">
          <input type="checkbox" checked={form.restricted} onChange={e => setForm({ ...form, restricted: e.target.checked })} />
          Só para uma lista de pessoas
        </label>
      </div>

      {dirty && (
        <button
          type="button"
          onClick={save}
          disabled={saving || invalidTotal || !form.name.trim()}
          className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold text-xs py-2.5 px-5 rounded-xl flex items-center gap-1.5"
        >
          <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Salvar proposta'}
        </button>
      )}

      {offer.restricted && (
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-slate-400" /> Quem pode receber ({allowed.size})
          </p>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              placeholder="Buscar participante para liberar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
            {listed.map(a => (
              <li key={a.id}>
                <label className="px-3 py-2.5 flex items-center gap-2.5 text-sm text-slate-800 cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" checked={allowed.has(a.id)} onChange={e => salesApi.setOfferAccess(offer.id, a.id, e.target.checked)} />
                  <span className="truncate">{a.name}</span>
                </label>
              </li>
            ))}
            {listed.length === 0 && (
              <li className="px-3 py-4 text-xs text-slate-500 text-center">{search.trim() ? 'Ninguém encontrado.' : 'Ninguém liberado ainda. Busque acima.'}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

/** Produtos que os closers oferecem: valor fixo, condição do evento e quem pode receber. */
export const OffersPanel: React.FC<{ salesApi: SalesApi }> = ({ salesApi }) => (
  <div className="space-y-3">
    <p className="text-xs text-slate-500 px-1">
      Sem valor ou desativada, a proposta não aparece para os closers. Mudanças valem na hora para quem estiver com o HELPER aberto.
    </p>
    {salesApi.offers.map(offer => (
      <OfferEditor key={`${offer.id}-${offer.totalCents}-${offer.active}-${offer.restricted}`} offer={offer} salesApi={salesApi} />
    ))}
  </div>
);
