import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeDollarSign, Check, FileSignature, Loader2, MessageCircle, RefreshCw, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useSales } from '../hooks/useSales';
import { useRiseParticipants } from '../hooks/useRiseParticipants';
import { useIcp } from '../hooks/useIcp';
import { ProposalSheet } from '../components/ProposalSheet';
import { ContractSheet } from '../components/ContractSheet';
import type { Attendee } from '../types/index';
import { CONTRACT_STATUS_LABELS, SALE_STATUS_LABELS, isClosedSale, isOpenSale, type Sale } from '../lib/sales';
import { RISERS_OFFER_ID } from '../lib/closerFilters';
import {
  ICP_NIVEL,
  PERFIS,
  PILLAR_LABELS,
  fromAttendee,
  icpColor,
  instagramDe,
  matchAttendees,
  norm,
  perfilDe,
  perfilNota,
  waLink,
  type PerfilKey,
  type RiseParticipant
} from '../lib/riseParticipants';

/**
 * Dashboard da Imersão: a mesma visão da aba "Participantes" do Rise (lista cruzada da recepção,
 * credenciamento e formulário, com ICP, perfil, Mastermind, WhatsApp e Instagram) e, em cada
 * pessoa, os dois botões do HELPER: gerar a cobrança (proposta no Asaas) e o contrato (D4Sign).
 */

type Row = RiseParticipant & {
  attendee?: Attendee;
  fromRise: boolean;
  d1: boolean;
  h1: string;
  d2: boolean;
  h2: string;
  insta: string[];
  perfil: PerfilKey | '';
  sales: Sale[];
};

type Option = [value: string, label: string, test: (r: Row) => boolean];
interface FilterDef {
  key: string;
  label: string;
  options: Option[];
}

const hora = (iso: string | null | undefined) => {
  if (!iso) return '';
  if (/^\d{2}:\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
};

const yesNo = (fn: (r: Row) => boolean, yes = 'sim', no = 'não'): Option[] => [
  ['sim', yes, r => fn(r)],
  ['nao', no, r => !fn(r)]
];

function distinct(rows: Row[], fn: (r: Row) => string): Option[] {
  return [...new Set(rows.map(fn).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map(v => [v, v, (r: Row) => fn(r) === v]);
}

const fat = (r: Row) => r.icp_detalhe?.faturamento?.r || '';
const dir = (r: Row) => (r.icp != null ? ICP_NIVEL[r.icp]?.[1] ?? '' : '');
const closedSale = (r: Row) => r.sales.find(s => isClosedSale(s.status));

function buildFilters(rows: Row[]): FilterDef[] {
  return [
    {
      key: 'ing',
      label: 'Ingresso',
      options: [
        ['VIP', 'VIP', r => r.ingresso === 'VIP'],
        ['SILVER', 'SILVER', r => r.ingresso === 'SILVER'],
        ['PATROCINADOR', 'Patrocinador', r => r.ingresso === 'PATROCINADOR'],
        ['sem', 'sem ingresso', r => !r.ingresso]
      ]
    },
    {
      key: 'perfil',
      label: 'Perfil',
      options: (Object.keys(PERFIS) as PerfilKey[])
        .map<Option>(k => [k, PERFIS[k].label, r => r.perfil === k])
        .concat([
          ['naoment', 'Não mentorado (todos os outros)', r => r.perfil !== 'mentorado'],
          ['sem', 'sem perfil', r => !r.perfil]
        ])
    },
    { key: 'mm', label: 'RISERS', options: yesNo(r => r.master_mind, '💎 é RISER', 'não é RISER') },
    {
      key: 'venda',
      label: 'Venda (HELPER)',
      options: [
        ['fechada', 'Entrada paga / quitada', r => !!closedSale(r)],
        ['aguardando', 'Aguardando entrada', r => !closedSale(r) && r.sales.some(s => s.status === 'PENDING' || s.status === 'CREATING')],
        ['sem', 'Sem proposta', r => r.sales.length === 0],
        ['contrato', 'Contrato enviado ou assinado', r => r.sales.some(s => s.contractStatus === 'SENT' || s.contractStatus === 'SIGNED')],
        ['forahelper', 'Não está no HELPER', r => !r.attendee],
        ['forarise', 'Não está no Rise', r => !r.fromRise]
      ]
    },
    { key: 'd1', label: 'Sábado (D1)', options: yesNo(r => r.d1, 'presente', 'ausente') },
    { key: 'd2', label: 'Domingo (D2)', options: yesNo(r => r.d2, 'presente', 'ausente') },
    { key: 'form', label: 'Formulário', options: yesNo(r => (r.respostas || []).length > 0, 'respondeu', 'não respondeu') },
    {
      key: 'icp',
      label: 'ICP',
      options: ([['elite', '1–3 (Elite)', r => r.icp != null && r.icp <= 3]] as Option[])
        .concat([1, 2, 3, 4, 5, 6, 7].map<Option>(n => [String(n), `ICP ${n} · ${ICP_NIVEL[n][0]}`, r => r.icp === n]))
        .concat([['sem', 'sem ICP', r => r.icp == null]])
    },
    { key: 'dir', label: 'Direção', options: distinct(rows, dir) },
    { key: 'fat', label: 'Faturamento', options: distinct(rows, fat) },
    { key: 'estilo', label: 'Estilo', options: distinct(rows, r => r.estilo || '') },
    { key: 'insta', label: 'Instagram', options: yesNo(r => r.insta.length > 0, 'tem Instagram', 'não informou') },
    { key: 'acomp', label: 'Acompanhante (não é professor)', options: yesNo(r => r.acompanhante) }
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
  n == null ? (
    <Pill className="bg-slate-100 border-slate-200 text-slate-500">sem formulário</Pill>
  ) : (
    <span className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: icpColor(n) }}>
      ICP {n}
    </span>
  );

const WaIcon: React.FC<{ whats: string }> = ({ whats }) =>
  whats ? (
    <a
      href={waLink(whats)}
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

const InstaIcons: React.FC<{ handles: string[] }> = ({ handles }) =>
  handles.length ? (
    <span className="inline-flex gap-1">
      {handles.map(h => (
        <a
          key={h}
          href={`https://www.instagram.com/${encodeURIComponent(h)}/`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title={`@${h}`}
          aria-label={`Instagram @${h}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-base no-underline"
          style={{ background: 'linear-gradient(45deg,#F58529,#DD2A7B 55%,#8134AF)' }}
        >
          📷
        </a>
      ))}
    </span>
  ) : (
    <span className="text-slate-400">—</span>
  );

const Presence: React.FC<{ on: boolean; h: string }> = ({ on, h }) =>
  on ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
      <Check className="h-3.5 w-3.5" />
      {h}
    </span>
  ) : (
    <span className="text-slate-400">—</span>
  );

const SaleCell: React.FC<{ row: Row }> = ({ row }) => {
  if (!row.attendee) return <span className="text-[11px] text-slate-400">não está no HELPER</span>;
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

export const DashboardPage: React.FC = () => {
  const { attendees, userSession } = useApp();
  const rise = useRiseParticipants();
  const salesApi = useSales();
  const icpMap = useIcp();
  const risers = salesApi.access.get(RISERS_OFFER_ID);
  const closerName = userSession.userName || (userSession.role === 'ADMIN' ? 'Admin' : 'Closer');

  const [f, setF] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [order, setOrder] = useState<'icp' | 'nome'>('icp');
  const [detail, setDetail] = useState<Row | null>(null);
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

  const rows = useMemo<Row[]>(() => {
    const matched = matchAttendees(rise.list, attendees);
    const inRise = new Set([...matched.values()].map(a => a.id));
    // Quem está no HELPER e não veio do Rise (ou o Rise não respondeu) entra com os dados do HELPER
    const list: [RiseParticipant, Attendee | undefined, boolean][] = [
      ...rise.list.map(p => [p, matched.get(p.id), true] as [RiseParticipant, Attendee | undefined, boolean]),
      ...attendees.filter(a => !inRise.has(a.id)).map(a => [fromAttendee(a, icpMap.get(a.id)), a, false] as [RiseParticipant, Attendee, boolean])
    ];
    return list.map(([p, a, fromRise]) => {
      const ci = a?.checkIns;
      const insta = instagramDe(p);
      return {
        ...p,
        // Coluna RISERS: convite marcado no Rise ou acesso à oferta RISERS no HELPER
        master_mind: p.master_mind || (!!a && !!risers?.has(a.id)),
        attendee: a,
        fromRise,
        d1: !!(p.presente_d1 || ci?.day1),
        h1: hora(ci?.day1) || (p.hora_d1 && p.hora_d1.length <= 5 ? p.hora_d1 : ''),
        d2: !!(p.presente_d2 || ci?.day2),
        h2: hora(ci?.day2) || (p.hora_d2 && p.hora_d2.length <= 5 ? p.hora_d2 : ''),
        insta: insta.length || !a?.instagram ? insta : instagramDe({ respostas: [{ p: 'Instagram', r: a.instagram }] }),
        perfil: perfilDe(p),
        sales: a ? salesByAttendee.get(a.id) ?? [] : []
      };
    });
  }, [rise.list, attendees, salesByAttendee, icpMap, risers]);

  // Mantém o detalhe aberto em dia com as vendas/presença
  useEffect(() => {
    if (detail) setDetail(rows.find(r => r.id === detail.id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const defs = useMemo(() => buildFilters(rows), [rows]);
  const nq = norm(q);
  const search = (r: Row) => !nq || norm(r.nome).includes(nq) || norm(r.referencia).includes(nq);
  const visible = rows
    .filter(r => search(r) && passes(r, defs, f))
    .sort((a, b) =>
      order === 'nome'
        ? norm(a.nome).localeCompare(norm(b.nome))
        : Number(a.icp == null) - Number(b.icp == null) || (a.icp ?? 9) - (b.icp ?? 9) || norm(a.nome).localeCompare(norm(b.nome))
    );
  const active = Object.values(f).filter(Boolean).length + (q ? 1 : 0);
  const count = (fn: (r: Row) => boolean) => rows.filter(fn).length;

  const setFilter = (key: string, value: string) =>
    setF(cur => {
      const next = { ...cur };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });

  const kpis: [string, string | number, string][] = [
    ['Participantes', rows.length, `${count(r => r.ingresso === 'VIP')} VIP · ${count(r => r.ingresso === 'SILVER')} SILVER · ${count(r => r.master_mind)} 💎 RISERS`],
    ['Presentes no sábado', count(r => r.d1), `${count(r => r.d2)} no domingo`],
    ['Responderam o formulário', count(r => r.icp != null), `${count(r => r.icp == null)} sem formulário`],
    ['ICP 1–3 (perfil Elite)', count(r => r.icp != null && r.icp <= 3), `${count(r => r.icp != null && r.icp <= 3 && r.perfil === 'mentorado')} mentorados`],
    ['Vendas (HELPER)', count(r => !!closedSale(r)), `${count(r => !closedSale(r) && r.sales.length > 0)} aguardando entrada`]
  ];

  const actionButtons = (row: Row, full = false) => {
    const a = row.attendee;
    const canContract = !!closedSale(row);
    const base = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition disabled:opacity-40';
    return (
      <div className={`flex gap-1.5 ${full ? '' : 'justify-end'}`} onClick={e => e.stopPropagation()}>
        <button
          type="button"
          disabled={!a}
          onClick={() => a && setProposalFor(a)}
          title={a ? 'Gerar cobrança (proposta no Asaas)' : 'Esta pessoa não está no cadastro do HELPER'}
          className={`${base} bg-slate-900 text-white hover:bg-slate-800 disabled:hover:bg-slate-900`}
        >
          <BadgeDollarSign className="h-4 w-4" />
          <span>Cobrança</span>
        </button>
        <button
          type="button"
          disabled={!a || !canContract}
          onClick={() => a && setContractFor(a)}
          title={!a ? 'Esta pessoa não está no cadastro do HELPER' : canContract ? 'Contrato da venda (D4Sign)' : 'Disponível depois que a entrada for paga'}
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Imersão Rise · dados do Rise 360</p>
          <h1 className="text-2xl font-extrabold text-slate-900">Dashboard dos participantes</h1>
          <p className="text-sm text-slate-600">
            ICP (1 = escola estruturada … 7 = aspirante), perfil, presença e respostas do formulário. Toque na pessoa para ler as respostas.
          </p>
        </div>
        <button
          type="button"
          onClick={rise.reload}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${rise.loading ? 'animate-spin' : ''}`} />
          Atualizar{rise.readAt ? ` · ${new Date(rise.readAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </button>
      </div>

      {!rise.configured ? (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            A lista do Rise ainda não está ligada (falta o <b>RISE_LINK_TOKEN</b> no Vercel). Por enquanto aparece o cadastro do HELPER, com o ICP do
            HELPER; Cobrança e Contrato funcionam normalmente.
          </span>
        </div>
      ) : (
        rise.error && (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{rise.error} Mostrando o cadastro do HELPER enquanto isso.</span>
          </div>
        )
      )}

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
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
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
              placeholder="buscar nome"
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
        {rise.loading && !rise.readAt && !rise.error ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Lendo o Rise…
          </div>
        ) : visible.length ? (
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
                const nv = r.icp != null ? ICP_NIVEL[r.icp] : null;
                return (
                  <tr key={r.id} onClick={() => setDetail(r)} className="cursor-pointer border-b border-slate-100 align-top hover:bg-slate-50" data-row={r.id}>
                    <td className="min-w-[190px] px-3 py-2.5 font-bold text-slate-900">{r.nome}</td>
                    <td className="px-3 py-2.5">
                      <WaIcon whats={r.whats} />
                    </td>
                    <td className="px-3 py-2.5">
                      <InstaIcons handles={r.insta} />
                    </td>
                    <td className="px-3 py-2.5">
                      {r.ingresso ? (
                        <Pill className={r.ingresso === 'VIP' ? 'bg-[#B5542B] border-[#B5542B] text-white' : r.ingresso === 'PATROCINADOR' ? 'bg-[#DDEBF7] border-[#9DC3E6] text-[#1F4E79]' : 'bg-slate-100 border-slate-200 text-slate-700'}>
                          {r.ingresso}
                        </Pill>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.perfil ? <Pill className={PERFIS[r.perfil].className}>{PERFIS[r.perfil].label}</Pill> : <span className="text-slate-400">—</span>}
                      {perfilNota(r) && <div className="mt-1 text-[11px] text-slate-500">{perfilNota(r)}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.master_mind ? <Pill className="bg-violet-600 border-violet-600 text-white">💎 RISER</Pill> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Presence on={r.d1} h={r.h1} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Presence on={r.d2} h={r.h2} />
                    </td>
                    <td className="px-3 py-2.5">
                      <IcpTag n={r.icp} />
                      {nv && <div className="mt-1 text-[11px] text-slate-500">{nv[0]}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{r.estilo || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{fat(r) || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{nv ? nv[1] : '—'}</td>
                    <td className="px-3 py-2.5">
                      <SaleCell row={r} />
                    </td>
                    <td className="px-3 py-2.5">
                      {actionButtons(r)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="p-10 text-center text-sm text-slate-500">{rows.length ? 'Ninguém com esses filtros.' : 'Nenhum participante lido do Rise.'}</p>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-3 sm:p-6" onClick={() => setDetail(null)}>
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()} role="dialog" aria-label={detail.nome}>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h2 className="text-xl font-extrabold text-slate-900">{detail.nome}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {[detail.ingresso, detail.referencia].filter(Boolean).join(' · ')}
                  {detail.perfil === 'mentorado' && (detail.fromRise ? ' · mentorado no Rise' : ' · mentorado')}
                  {detail.master_mind && ' · 💎 convidado para o RISERS'}
                  {!detail.fromRise && ' · não está na lista do Rise'}
                </p>
                <p className="text-xs text-slate-500">
                  Sábado: {detail.d1 ? `✓ ${detail.h1}` : 'ausente'} · Domingo: {detail.d2 ? `✓ ${detail.h2}` : '—'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {detail.whats && (
                    <a href={waLink(detail.whats)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-[#25D366] px-3 py-1 text-xs font-bold text-white">
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  )}
                  {detail.insta.map(h => (
                    <a
                      key={h}
                      href={`https://www.instagram.com/${encodeURIComponent(h)}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full px-3 py-1 text-xs font-bold text-white"
                      style={{ background: 'linear-gradient(45deg,#F58529,#DD2A7B 55%,#8134AF)' }}
                    >
                      📷 @{h}
                    </a>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700">
                Fechar
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Venda no HELPER</p>
                  <SaleCell row={detail} />
                </div>
                {actionButtons(detail, true)}
              </div>
            </div>

            {detail.icp != null ? (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">ICP</p>
                    <p className="text-3xl font-extrabold" style={{ color: icpColor(detail.icp) }}>
                      {detail.icp}
                    </p>
                    <p className="text-xs text-slate-500">{ICP_NIVEL[detail.icp]?.[0]}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Direção</p>
                    <p className="mt-1.5 text-base font-bold">{ICP_NIVEL[detail.icp]?.[1] ?? '—'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Estilo</p>
                    <p className="mt-1.5 text-base font-bold">{detail.estilo || '—'}</p>
                  </div>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-bold text-slate-500">Por que essa nota</summary>
                  <table className="mt-2 w-full text-xs">
                    <tbody>
                      {Object.keys(PILLAR_LABELS).map(k => (
                        <tr key={k} className="border-b border-slate-100">
                          <td className="py-1.5 pr-2">{PILLAR_LABELS[k]}</td>
                          <td className="py-1.5 pr-2 text-slate-500">{detail.icp_detalhe?.[k]?.r || '—'}</td>
                          <td className="py-1.5 text-right font-bold">{detail.icp_detalhe?.[k]?.score ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </>
            ) : (
              <p className="mt-4 rounded-2xl border border-slate-200 p-3 text-sm text-slate-500">Esta pessoa ainda não respondeu o formulário.</p>
            )}

            {detail.respostas?.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Respostas do formulário{detail.respondido_em ? ` · ${detail.respondido_em}` : ''}
                </p>
                {detail.respostas.map((e, i) => (
                  <div key={i} className="border-b border-slate-100 py-2">
                    <p className="text-[11px] text-slate-500">
                      {i + 1}. {String(e.p).replace(/\s+/g, ' ').trim()}
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-slate-900">
                      {String(e.r || '').trim()
                        ? String(e.r)
                            .split(';')
                            .map(s => s.trim())
                            .filter(Boolean)
                            .join(' · ')
                        : '—'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {proposalFor && <ProposalSheet attendee={proposalFor} salesApi={salesApi} closerName={closerName} onClose={closeProposal} />}
      {contractFor && <ContractSheet attendee={contractFor} salesApi={salesApi} onClose={closeContract} />}
    </div>
  );
};
