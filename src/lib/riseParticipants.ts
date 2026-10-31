/**
 * Participantes vindos do Rise 360 (ver api/rise/participants.ts) e as mesmas regras da aba
 * "Participantes" do Rise: perfil, Instagram, WhatsApp, filtros e níveis de ICP.
 */
import type { Attendee } from '../types/index';
import type { Icp } from './icp';

export interface RiseIcpPillar {
  r?: string;
  score?: number | null;
  peso?: number;
}

export interface RiseParticipant {
  id: string;
  nome: string;
  ingresso: string; // VIP | SILVER | PATROCINADOR | ''
  referencia: string;
  presente_d1: boolean;
  hora_d1: string | null;
  presente_d2: boolean;
  hora_d2: string | null;
  master_mind: boolean;
  acompanhante: boolean;
  icp: number | null;
  estilo: string;
  respondido_em: string | null;
  whats: string;
  mentorado: boolean;
  icp_detalhe: Record<string, RiseIcpPillar>;
  respostas: { p: string; r: string }[];
}

export const ICP_NIVEL: Record<number, [string, string]> = {
  1: ['Escola Estruturada', 'Elite'],
  2: ['Escola em Formação', 'Elite'],
  3: ['Estruturando Escala', 'Elite'],
  4: ['Professor Sobrecarregado', 'Partiu 10K ou Elite'],
  5: ['Professor Operacional', 'Partiu 10K'],
  6: ['Iniciante', 'Partiu 10K'],
  7: ['Aspirante', 'Workshop / Trilha']
};

export const PILLAR_LABELS: Record<string, string> = {
  faturamento: 'Faturamento',
  vendas: 'Vende hoje?',
  frustracao: 'Frustração mais avançada',
  meta: 'Meta 6–12 meses',
  tempo: 'Tempo na área',
  disciplina: 'Disciplina'
};

export const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Cor do ICP, igual ao Rise: 1–3 verde, 4 terracota, 5 dourado, 6–7 vermelho */
export const icpColor = (n: number | null) =>
  n == null ? '#94A3B8' : n <= 3 ? '#4C7A50' : n <= 4 ? '#B5542B' : n <= 5 ? '#B0893E' : '#B94B4B';

// ---------- Perfil ----------

export type PerfilKey = 'mentorado' | 'ex' | 'acompanhante' | 'comprador' | 'patrocinador' | 'convidado' | 'outro';

export const PERFIS: Record<PerfilKey, { label: string; className: string }> = {
  mentorado: { label: 'Mentorado', className: 'bg-[#4C7A50] border-[#4C7A50] text-white' },
  ex: { label: 'Ex-mentorado', className: 'bg-[#E4EEE4] border-[#B9CFB9] text-[#2F5A33]' },
  acompanhante: { label: 'Acompanhante', className: 'bg-[#EEE9E3] border-[#D8CFC4] text-[#5E564C]' },
  comprador: { label: 'Comprador', className: 'bg-[#F6EAD0] border-[#E2C98F] text-[#7A5A12]' },
  patrocinador: { label: 'Patrocinador', className: 'bg-[#DDEBF7] border-[#9DC3E6] text-[#1F4E79]' },
  convidado: { label: 'Convidado', className: 'bg-[#EEE5F5] border-[#CDB8E0] text-[#5B3B7A]' },
  outro: { label: 'Outro', className: 'bg-[#F4EEE6] border-[#E2D8CC] text-[#5E564C]' }
};

type RefCat = 'sem' | 'ex' | 'mentorado' | 'comprador' | 'patrocinador' | 'familia' | 'convidado' | 'outros';

export function refCat(p: Pick<RiseParticipant, 'referencia'>): RefCat {
  const r = norm(p.referencia);
  if (!r) return 'sem';
  if (/^ex ?-?mentorad/.test(r)) return 'ex';
  if (/^mentorad/.test(r)) return 'mentorado';
  if (/^comprador/.test(r)) return 'comprador';
  if (/^patrocin/.test(r)) return 'patrocinador';
  if (/^(espos|filh|irm|acompanhante|marido|namorad|mae|pai)/.test(r)) return 'familia';
  if (/^convidad/.test(r)) return 'convidado';
  return 'outros';
}

/** Prioridade: ex (credenciamento) → mentorado → acompanhante → comprador/patrocinador/convidado → outro */
export function perfilDe(p: RiseParticipant): PerfilKey | '' {
  const c = refCat(p);
  if (c === 'ex') return 'ex';
  if (c === 'mentorado' || p.mentorado) return 'mentorado';
  if (c === 'familia' || p.acompanhante) return 'acompanhante';
  if (c === 'comprador' || c === 'patrocinador' || c === 'convidado') return c;
  return c === 'outros' ? 'outro' : '';
}

/** Mostra a referência embaixo do perfil quando ela explica algo (ex: "Esposo da Manuela") */
export const perfilNota = (p: RiseParticipant) => (['familia', 'outros', 'convidado'].includes(refCat(p)) ? p.referencia : '');

// ---------- Instagram ----------

/** @ do Instagram a partir da resposta do formulário (aceita vários perfis, link, "a e b", "a / b") */
export function instagramDe(p: Pick<RiseParticipant, 'respostas'>): string[] {
  const e = (p.respostas || []).find(x => x && /instagram/i.test(x.p || ''));
  if (!e) return [];
  const r = String(e.r || '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ');
  const url = [...r.matchAll(/instagram\.com\/([A-Za-z0-9._]{1,30})/gi)].map(m => m[1]);
  let hs = url.length ? url : [...r.matchAll(/@([A-Za-z0-9._]{1,30})/g)].map(m => m[1]);
  if (!hs.length) hs = r.split(/\s*(?:\/|\||,|;|\s+e\s+)\s*/i).map(s => s.trim()).filter(s => /^[A-Za-z0-9._]{2,30}$/.test(s));
  const limpos = hs.map(h => h.replace(/^\.+|\.+$/g, '')).filter(h => h.length >= 2 && !/^(nao|nenhum|nenhuma|sem|nt|na|x)$/i.test(h));
  return [...new Set(limpos)].slice(0, 3);
}

// ---------- Cruzamento com o cadastro do HELPER ----------

/** Chave do telefone (DDD + 8 dígitos), igual ao foneChave do Rise */
export function phoneKey(raw: string | null | undefined): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  d = d.replace(/^0+/, '');
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  return d.length === 10 ? d : String(raw ?? '').replace(/\D/g, '');
}

/** Link do WhatsApp: só dígitos e com o 55 na frente quando o número veio só com DDD */
export function waLink(raw: string): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  return `https://wa.me/${d.length === 10 || d.length === 11 ? '55' + d : d}`;
}

/**
 * Pessoa que está no HELPER e não veio do Rise (ou o Rise ainda não está ligado): monta a linha
 * com o cadastro e o ICP do próprio HELPER, para os botões de Cobrança e Contrato continuarem à mão.
 */
export function fromAttendee(a: Attendee, icp?: Icp): RiseParticipant {
  const answers = icp ? Object.entries(icp.answers).filter(([, r]) => String(r ?? '').trim()) : [];
  return {
    id: `helper:${a.id}`,
    nome: a.name,
    ingresso: a.isSponsor ? 'PATROCINADOR' : a.level,
    referencia: a.isSponsor ? 'Patrocinador' : '',
    presente_d1: false,
    hora_d1: null,
    presente_d2: false,
    hora_d2: null,
    master_mind: false,
    acompanhante: false,
    icp: icp?.level ?? null,
    estilo: icp?.disc ?? '',
    respondido_em: null,
    whats: a.phone,
    mentorado: a.isMentee,
    icp_detalhe: icp?.answers.Faturamento ? { faturamento: { r: icp.answers.Faturamento } } : {},
    respostas: answers.map(([p, r]) => ({ p, r }))
  };
}

/**
 * Liga cada pessoa do Rise ao cadastro do HELPER (o que tem as propostas e os contratos):
 * WhatsApp; se o número for de um casal, o mesmo primeiro nome; senão o nome igual;
 * senão primeiro nome + outro nome que só uma pessoa tem.
 */
export function matchAttendees(rise: RiseParticipant[], attendees: Attendee[]): Map<string, Attendee> {
  const out = new Map<string, Attendee>();
  const byPhone = new Map<string, Attendee[]>();
  for (const a of attendees) {
    const k = phoneKey(a.phone);
    if (!k) continue;
    byPhone.set(k, [...(byPhone.get(k) ?? []), a]);
  }
  const first = (s: string) => norm(s).split(' ')[0] ?? '';
  for (const p of rise) {
    let hit: Attendee | undefined;
    const same = p.whats ? byPhone.get(phoneKey(p.whats)) ?? [] : [];
    if (same.length === 1) hit = same[0];
    else if (same.length > 1) hit = same.find(a => first(a.name) === first(p.nome));
    if (!hit) hit = attendees.find(a => norm(a.name) === norm(p.nome));
    if (!hit) {
      const tk = norm(p.nome).split(' ');
      const cands = attendees.filter(a => {
        const at = norm(a.name).split(' ');
        return at[0] === tk[0] && tk.slice(1).some(t => t.length > 2 && at.includes(t));
      });
      if (cands.length === 1) hit = cands[0];
    }
    if (hit) out.set(p.id, hit);
  }
  return out;
}
