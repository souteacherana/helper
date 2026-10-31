import React, { useCallback, useMemo, useState } from 'react';
import { BadgeDollarSign, Check, FileSignature, MessageCircle, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useSales } from '../hooks/useSales';
import { useIcp } from '../hooks/useIcp';
import { ProposalSheet } from '../components/ProposalSheet';
import { ContractSheet } from '../components/ContractSheet';
import type { Attendee } from '../types/index';
import { CONTRACT_STATUS_LABELS, SALE_STATUS_LABELS, isClosedSale, isOpenSale, type Sale } from '../lib/sales';
import { RISERS_OFFER_ID } from '../lib/closerFilters';
import { ANSWER_GROUPS, levelStyle } from '../lib/icp';
import { buildWhatsAppUrl, formatCheckInTime, matchesQuery, normalizeText } from '../lib/format';
import { ICP_NIVEL, PERFIS, buildDashboardRows, type DashboardRow as Row, type PerfilKey } from '../lib/dashboard';

/**
 * Dashboard da Imersão: todos os participantes do HELPER numa tabela, com ICP do formulário,
 * perfil, RISERS, presença e venda, filtros combináveis e, em cada pessoa, os botões de
 * Cobrança (proposta no Asaas) e Contrato (D4Sign).
 */

type Option = [value: string, label: string, test: (r: Row) => boolean];
interface FilterDef {
  key: string;
  label: string;
  options: Option[];
}

const yesNo = (fn: (r: Row) => boolean, yes = 'sim', no = 'não'): Option[] => [
  ['sim', yes, r => fn(r)],
  ['nao', no, r => !fn(r)]
];

function distinct(rows: Row[], fn: (r: Row) => string): Option[] {
  return [...new Set(rows.map(fn).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(v => [v, v, (r: Row) => fn(r) === v]);
}

const level = (r: Row) => r.icp?.level ?? null;
const fat = (r: Row) => r.icp?.answers.Faturamento || '';
const day1 = (r: Row) => r.attendee.checkIns?.day1 ?? null;
const day2 = (r: Row) => r.attendee.checkIns?.day2 ?? null;
const insta = (r: Row) => r.attendee.instagram.replace(/^@/, '').trim();
const closedSale = (r: Row) => r.sales.find(s => isClosedSale(s.status));
const byName = (a: Row, b: Row) => normalizeText(a.attendee.name).localeCompare(normalizeText(b.attendee.name), 'pt-BR');

function buildFilters(rows: Row[]): FilterDef[] {
  return [
    {
      key: 'ing',
      label: 'Ingresso',
      options: [
        ['VIP', 'VIP', r => r.ingresso === 'VIP'],
        ['SILVER', 'SILVER', r => r.ingresso === 'SILVER'],
        ['PATROCINADOR', 'Patrocinador', r => r.ingresso === 'PATROCINADOR']
      ]
    },
    { key: 'perfil', label: 'Perfil', options: (Object.keys(PERFIS) as PerfilKey[]).map<Option>(k => [k, PERFIS[k].label, r => r.perfil === k]) },
    { key: 'riser', label: 'RISERS', options: yesNo(r => r.riser, '💎 é RISER', 'não é RISER') },
    {
      key: 'venda',
      label: 'Venda',
      options: [
        ['fechada', 'Entrada paga / quitada', r => !!closedSale(r)],
        ['aguardando', 'Aguardando entrada', r => !closedSale(r) && r.sales.some(s => s.status === 'PENDING' || s.status === 'CREATING')],
        ['sem', 'Sem proposta', r => r.sales.length === 0],
        ['contrato', 'Contrato enviado ou assinado', r => r.sales.some(s => s.contractStatus === 'SENT' || s.contractStatus === 'SIGNED')]
      ]
    },
    { key: 'd1', label: 'Sábado (D1)', options: yesNo(r => !!day1(r), 'presente', 'ausente') },
    { key: 'd2', label: 'Domingo (D2)', options: yesNo(r => !!day2(r), 'presente', 'ausente') },
    { key: 'form', label: 'Formulário', options: yesNo(r => !!r.icp, 'respondeu', 'não respondeu') },
    {
      key: 'icp',
      label: 'ICP',
      options: ([['elite', '1–3 (Elite)', r => level(r) != null && level(r)! <= 3]] as Option[])
        .concat([1, 2, 3, 4, 5, 6, 7].map<Option>(n => [String(n), `ICP ${n} · ${ICP_NIVEL[n]}`, r => level(r) === n]))
        .concat([['sem', 'sem ICP', r => level(r) == null]])
    },
    { key: 'dir', label: 'Direção', options: distinct(rows, r => r.icp?.direction ?? '') },
    { key: 'fat', label: 'Faturamento', options: distinct(rows, fat) },
    { key: 'estilo', label: 'Estilo (DISC)', options: distinct(rows, r => r.icp?.disc ?? '') },
    { key: 'insta', label: 'Instagram', options: yesNo(r => !!insta(r), 'tem Instagram', 'não informou') }
  ];
}

const passes = (r: Row, defs: FilterDef[], f: Record<string, string>, except?: string) =>
  defs.every(d => {
    if (d.key === except || !f[d.key]) return true;
    const o = d.options.find(x => x[0] === f[d.key]);
    return !o || o[2](r);
  });

const Pill: React.FC<{ className: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>
);

const IcpTag: React.FC<{ n: number | null }> = ({ n }) =>
  n == null ? <Pill className="bg-slate-100 border-slate-200 text-slate-500">sem formulário</Pill> : <Pill className={`font-bold ${levelStyle(n)}`}>ICP {n}</Pill>;

const WaIcon: React.FC<{ phone: string }> = ({ phone }) => {
  const url = buildWhatsAppUrl(phone, '');
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title="WhatsApp"
      aria-label="WhatsApp"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366] text-base no-underline"
    >
      💬
    </a>
  ) : (
    <span className="text-slate-400">—</span>
  );
};

const InstaIcon: React.FC<{ handle: string }> = ({ handle }) =>
  handle ? (
    <a
      href={`https://instagram.com/${encodeURIComponent(handle)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title={`@${handle}`}
      aria-label={`Instagram @${handle}`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-base no-underline"
      style={{ background: 'linear-gradient(45deg,#F58529,#DD2A7B 55%,#8134AF)' }}
    >
      📷
    </a>
  ) : (
    <span className="text-slate-400">—</span>
  );

const Presence: React.FC<{ at: string | null }> = ({ at }) =>
  at ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
      <Check className="h-3.5 w-3.5" />
      {formatCheckInTime(at)}
    </span>
  ) : (
    <span className="text-slate-400">—</span>
  );

const SaleCell: React.FC<{ row: Row }> = ({ row }) => {
  const s = closedSale(row) ?? row.sales[0];
  if (!s) return <span className="text-slate-400">—</span>;
  const closed = isClosedSale(s.status);
  return (
    <div className="space-y-0.5">
      <Pill className={closed ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-amber-50 border-amber-200 text-amber-800'}>{SALE_STATUS_LABELS[s.status]}</Pill>
      <div className="text-[11px] text-slate-500">{s.offerName}</div>
      {closed && s.contractStatus !== 'NONE' && <div className="text-[11px] text-slate-500">{CONTRACT_STATUS_LABELS[s.contractStatus]}</div>}
    </div>
  );
};

/** Respostas do formulário na ordem do closer; o que não está nos grupos vai no fim */
function answerList(answers: Record<string, string>): [string, string][] {
  const known = ANSWER_GROUPS.flatMap(g => g.keys);
  const keys = [...known.filter(k => k in answers), ...Object.keys(answers).filter(k => !known.includes(k))];
  return keys.map(k => [k, answers[k]] as [string, string]).filter(([, v]) => String(v ?? '').trim());
}

export const DashboardPage: React.FC = () => {
  const { attendees, userSession } = useApp();
  const salesApi = useSales();
  const icpMap = useIcp();
  const risers = salesApi.access.get(RISERS_OFFER_ID);
  const closerName = userSession.userName || (userSession.role === 'ADMIN' ? 'Admin' : 'Closer');

  const [f, setF] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [order, setOrder] = useState<'icp' | 'nome'>('icp');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [proposalFor, setProposalFor] = useState<Attendee | null>(null);
  const [contractFor, setContractFor] = useState<Attendee | null>(null);
  const closeProposal = useCallback(() => setProposalFor(null), []);
  const closeContract = useCallback(() => setContractFor(null), []);

  const salesByAttendee = useMemo(() => {
    const map = new Map<string, Sale[]>();
    for (const s of salesApi.sales) {
      if (!isOpenSale(s.status)) continue;
      map.set(s.attendeeId, [...(map.get(s.attendeeId) ?? []), s]);
    }
    return map;
  }, [salesApi.sales]);

  const rows = useMemo(() => buildDashboardRows(attendees, icpMap, salesByAttendee, risers), [attendees, icpMap, salesByAttendee, risers]);
  const detail = detailId ? rows.find(r => r.attendee.id === detailId) ?? null : null;

  const defs = useMemo(() => buildFilters(rows), [rows]);
  const search = (r: Row) => matchesQuery(q, [r.attendee.name, r.perfilNota, r.attendee.companionName], r.attendee.phone);
  const visible = rows
    .filter(r => search(r) && passes(r, defs, f))
    .sort((a, b) =>
      order === 'nome' ? byName(a, b) : Number(level(a) == null) - Number(level(b) == null) || (level(a) ?? 9) - (level(b) ?? 9) || byName(a, b)
    );
  const active = Object.values(f).filter(Boolean).length + (q ? 1 : 0);
  const count = (fn: (r: Row) => boolean) => rows.filter(fn).length;
  const elite = (r: Row) => level(r) != null && level(r)! <= 3;

  const setFilter = (key: string, value: string) =>
    setF(cur => {
      const next = { ...cur };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });

  const kpis: [string, string | number, string][] = [
    ['Participantes', rows.length, `${count(r => r.ingresso === 'VIP')} VIP · ${count(r => r.ingresso === 'SILVER')} SILVER · ${count(r => r.riser)} 💎 RISERS`],
    ['Presentes no sábado', count(r => !!day1(r)), `${count(r => !!day2(r))} no domingo`],
    ['Responderam o formulário', count(r => !!r.icp), `${count(r => !r.icp)} sem formulário`],
    ['ICP 1–3 (perfil Elite)', count(elite), `${count(r => elite(r) && r.perfil === 'mentorado')} mentorados`],
    ['Vendas', count(r => !!closedSale(r)), `${count(r => !closedSale(r) && r.sales.length > 0)} aguardando entrada`]
  ];

  const actionButtons = (row: Row, full = false) => {
    const canContract = !!closedSale(row);
    const base = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition disabled:opacity-40';
    return (
      <div className={`flex gap-1.5 ${full ? '' : 'justify-end'}`} onClick={e => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setProposalFor(row.attendee)}
          title="Gerar cobrança (proposta no Asaas)"
          className={`${base} bg-slate-900 text-white hover:bg-slate-800`}
        >
          <BadgeDollarSign className="h-4 w-4" />
          <span>Cobrança</span>
        </button>
        <button
          type="button"
          disabled={!canContract}
          onClick={() => setContractFor(row.attendee)}
          title={canContract ? 'Contrato da venda (D4Sign)' : 'Disponível depois que a entrada for paga'}
          className={`${base} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:hover:bg-white`}
        >
          <FileSignature className="h-4 w-4" />
          <span>Contrato</span>
        </button>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-3 py-5 sm:px-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Imersão Rise · participantes</p>
        <h1 className="text-2xl font-extrabold text-slate-900">Dashboard dos participantes</h1>
        <p className="text-sm text-slate-600">
          ICP (1 = escola estruturada … 7 = aspirante), perfil, presença e respostas do formulário. Toque na pessoa para ler as respostas.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpis.map(([label, value, sub]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="text-2xl font-extrabold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500">{sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {defs.map(d => {
            const base = rows.filter(r => search(r) && passes(r, defs, f, d.key));
            return (
              <label key={d.key} className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-semibold text-slate-500">{d.label}</span>
                <select
                  value={f[d.key] ?? ''}
                  onChange={e => setFilter(d.key, e.target.value)}
                  className={`w-full rounded-lg border px-2 py-1.5 text-sm ${f[d.key] ? 'border-[#B5542B] bg-[#FBEFE9] font-bold' : 'border-slate-200 bg-slate-50'}`}
                >
                  <option value="">todos ({base.length})</option>
                  {d.options.map(o => (
                    <option key={o[0]} value={o[0]}>
                      {o[1]} ({base.filter(o[2]).length})
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="buscar nome ou telefone"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm"
            />
          </div>
          {active > 0 && (
            <button
              type="button"
              onClick={() => {
                setF({});
                setQ('');
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700"
            >
              <X className="h-3.5 w-3.5" /> limpar filtros ({active})
            </button>
          )}
          <span className="ml-auto text-xs text-slate-500">
            {visible.length} de {rows.length} pessoa(s) · ordenar por{' '}
            <button type="button" onClick={() => setOrder('icp')} className={order === 'icp' ? 'font-bold text-slate-900 underline' : 'underline'}>
              ICP
            </button>{' '}
            ·{' '}
            <button type="button" onClick={() => setOrder('nome')} className={order === 'nome' ? 'font-bold text-slate-900 underline' : 'underline'}>
              nome
            </button>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {visible.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
                {['Nome', 'WhatsApp', 'Instagram', 'Ingresso', 'Perfil', 'RISERS', 'D1 sáb', 'D2 dom', 'ICP', 'Estilo', 'Faturamento', 'Direção', 'Venda', ''].map(h => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(r => {
                const n = level(r);
                return (
                  <tr key={r.attendee.id} onClick={() => setDetailId(r.attendee.id)} className="cursor-pointer border-b border-slate-100 align-top hover:bg-slate-50">
                    <td className="min-w-[190px] px-3 py-2.5 font-bold text-slate-900">{r.attendee.name}</td>
                    <td className="px-3 py-2.5">
                      <WaIcon phone={r.attendee.phone} />
                    </td>
                    <td className="px-3 py-2.5">
                      <InstaIcon handle={insta(r)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Pill className={r.ingresso === 'VIP' ? 'bg-[#B5542B] border-[#B5542B] text-white' : r.ingresso === 'PATROCINADOR' ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-slate-100 border-slate-200 text-slate-700'}>
                        {r.ingresso}
                      </Pill>
                    </td>
                    <td className="px-3 py-2.5">
                      <Pill className={PERFIS[r.perfil].className}>{PERFIS[r.perfil].label}</Pill>
                      {r.perfilNota && <div className="mt-1 text-[11px] text-slate-500">{r.perfilNota}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.riser ? <Pill className="bg-violet-600 border-violet-600 text-white">💎 RISER</Pill> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Presence at={day1(r)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Presence at={day2(r)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <IcpTag n={n} />
                      {n != null && <div className="mt-1 text-[11px] text-slate-500">{r.icp?.profile || ICP_NIVEL[n]}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{r.icp?.disc || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{fat(r) || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{r.icp?.direction || '—'}</td>
                    <td className="px-3 py-2.5">
                      <SaleCell row={r} />
                    </td>
                    <td className="px-3 py-2.5">{actionButtons(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="p-10 text-center text-sm text-slate-500">{rows.length ? 'Ninguém com esses filtros.' : 'Nenhum participante cadastrado.'}</p>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-3 sm:p-6" onClick={() => setDetailId(null)}>
          <div
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label={detail.attendee.name}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h2 className="text-xl font-extrabold text-slate-900">{detail.attendee.name}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {[detail.ingresso, PERFIS[detail.perfil].label, detail.perfilNota].filter(Boolean).join(' · ')}
                  {detail.riser && ' · 💎 convidado para o RISERS'}
                </p>
                <p className="text-xs text-slate-500">
                  Sábado: {day1(detail) ? `✓ ${formatCheckInTime(day1(detail))}` : 'ausente'} · Domingo: {day2(detail) ? `✓ ${formatCheckInTime(day2(detail))}` : '—'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {buildWhatsAppUrl(detail.attendee.phone, '') && (
                    <a
                      href={buildWhatsAppUrl(detail.attendee.phone, '')!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-[#25D366] px-3 py-1 text-xs font-bold text-white"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  )}
                  {insta(detail) && (
                    <a
                      href={`https://instagram.com/${encodeURIComponent(insta(detail))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full px-3 py-1 text-xs font-bold text-white"
                      style={{ background: 'linear-gradient(45deg,#F58529,#DD2A7B 55%,#8134AF)' }}
                    >
                      📷 @{insta(detail)}
                    </a>
                  )}
                </div>
              </div>
              <button type="button" onClick={() => setDetailId(null)} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700">
                Fechar
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Venda</p>
                  <SaleCell row={detail} />
                </div>
                {actionButtons(detail, true)}
              </div>
            </div>

            {detail.icp ? (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">ICP</p>
                    <p className="text-3xl font-extrabold text-slate-900">{detail.icp.level ?? '—'}</p>
                    <p className="text-xs text-slate-500">{detail.icp.profile || (detail.icp.level != null ? ICP_NIVEL[detail.icp.level] : '')}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Direção</p>
                    <p className="mt-1.5 text-base font-bold">{detail.icp.direction || '—'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Estilo (DISC)</p>
                    <p className="mt-1.5 text-base font-bold">{detail.icp.disc || '—'}</p>
                  </div>
                </div>
                {answerList(detail.icp.answers).length > 0 && (
                  <div className="mt-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Respostas do formulário</p>
                    {answerList(detail.icp.answers).map(([p, r]) => (
                      <div key={p} className="border-b border-slate-100 py-2">
                        <p className="text-[11px] text-slate-500">{p}</p>
                        <p className="whitespace-pre-wrap text-sm text-slate-900">
                          {String(r)
                            .split(';')
                            .map(s => s.trim())
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-4 rounded-2xl border border-slate-200 p-3 text-sm text-slate-500">Esta pessoa ainda não respondeu o formulário.</p>
            )}
          </div>
        </div>
      )}

      {proposalFor && <ProposalSheet attendee={proposalFor} salesApi={salesApi} closerName={closerName} onClose={closeProposal} />}
      {contractFor && <ContractSheet attendee={contractFor} salesApi={salesApi} onClose={closeContract} />}
    </div>
  );
};
