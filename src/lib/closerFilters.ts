import type { Attendee, BadgeLevel } from '../types/index';
import { getBadgeLevel } from '../types/index';
import type { Icp, Readiness } from './icp';

export type TriState = 'ALL' | 'YES' | 'NO';
export const MENTORSHIP_PROGRAMS = ['Mentoria Partiu 10K', 'Professores de Elite'] as const;
export type MentorshipProgram = (typeof MENTORSHIP_PROGRAMS)[number];

/** Faixas de ICP (a direção de venda de cada nível) */
export type IcpBand = 'ELITE' | 'MIXED' | 'PARTIU' | 'WORKSHOP' | 'NONE';
export const ICP_BAND_OPTIONS: { value: IcpBand; label: string; hint: string }[] = [
  { value: 'ELITE', label: 'ICP 1–3', hint: 'Elite' },
  { value: 'MIXED', label: 'ICP 4', hint: 'Partiu 10K ou Elite' },
  { value: 'PARTIU', label: 'ICP 5–6', hint: 'Partiu 10K' },
  { value: 'WORKSHOP', label: 'ICP 7', hint: 'Workshop' },
  { value: 'NONE', label: 'Sem ICP', hint: 'Não respondeu' }
];
export const READINESS_OPTIONS: Readiness[] = ['A', 'B', 'C'];

export function icpBand(icp: Icp | undefined): IcpBand {
  const level = icp?.level;
  if (!level) return 'NONE';
  if (level <= 3) return 'ELITE';
  if (level === 4) return 'MIXED';
  if (level <= 6) return 'PARTIU';
  return 'WORKSHOP';
}

/** Filtros da tela dos closers. Lista vazia / 'ALL' = sem filtro naquele grupo. */
export interface CloserFilters {
  badges: BadgeLevel[];
  mentee: TriState;
  program: 'ALL' | MentorshipProgram;
  presence: TriState; // presença no dia de hoje do evento
  approached: TriState; // já tem anotação de algum closer?
  renewal: boolean;
  accompanied: boolean;
  icp: IcpBand[];
  readiness: Readiness[];
}

export const EMPTY_FILTERS: CloserFilters = {
  badges: [],
  mentee: 'ALL',
  program: 'ALL',
  presence: 'ALL',
  approached: 'ALL',
  renewal: false,
  accompanied: false,
  icp: [],
  readiness: []
};

export const BADGE_OPTIONS: { value: BadgeLevel; label: string }[] = [
  { value: 'VIP', label: 'VIP' },
  { value: 'SILVER', label: 'Silver' },
  { value: 'PATROCINADOR', label: 'Patrocinador' }
];

/** Atalhos de venda prontos. */
export const FILTER_PRESETS: { id: string; label: string; filters: CloserFilters }[] = [
  { id: 'prontidao-a', label: '⭐ Prontidão A', filters: { ...EMPTY_FILTERS, readiness: ['A'] } },
  { id: 'vip-nao-mentorado', label: '🔥 VIPs não mentorados', filters: { ...EMPTY_FILTERS, badges: ['VIP'], mentee: 'NO' } },
  { id: 'presentes-nao-abordados', label: 'Presentes ainda não abordados', filters: { ...EMPTY_FILTERS, presence: 'YES', approached: 'NO' } },
  { id: 'renovacao', label: 'Renovação próxima', filters: { ...EMPTY_FILTERS, renewal: true } }
];

export function matchesFilters(a: Attendee, f: CloserFilters, icp?: Icp): boolean {
  if (f.icp.length && !f.icp.includes(icpBand(icp))) return false;
  if (f.readiness.length && !(icp?.readiness && f.readiness.includes(icp.readiness))) return false;
  if (f.badges.length && !f.badges.includes(getBadgeLevel(a))) return false;
  if (f.mentee === 'YES' && !a.isMentee) return false;
  if (f.mentee === 'NO' && a.isMentee) return false;
  if (f.program !== 'ALL' && a.currentMentorship !== f.program) return false;
  if (f.presence === 'YES' && !a.isPresent) return false;
  if (f.presence === 'NO' && a.isPresent) return false;
  const approached = (a.closerNotes?.length ?? 0) > 0;
  if (f.approached === 'YES' && !approached) return false;
  if (f.approached === 'NO' && approached) return false;
  if (f.renewal && !a.nearRenewal) return false;
  if (f.accompanied && !a.isAccompanied) return false;
  return true;
}

/** Etiquetas dos filtros ativos, cada uma com a forma de removê-la. */
export function activeFilterChips(f: CloserFilters): { key: string; label: string; remove: (f: CloserFilters) => CloserFilters }[] {
  const chips: { key: string; label: string; remove: (f: CloserFilters) => CloserFilters }[] = [];
  for (const b of f.badges) {
    const label = BADGE_OPTIONS.find(o => o.value === b)?.label ?? b;
    chips.push({ key: `badge-${b}`, label: `Crachá ${label}`, remove: x => ({ ...x, badges: x.badges.filter(v => v !== b) }) });
  }
  if (f.mentee !== 'ALL')
    chips.push({ key: 'mentee', label: f.mentee === 'YES' ? 'Mentorados' : 'Não mentorados', remove: x => ({ ...x, mentee: 'ALL', program: 'ALL' }) });
  if (f.program !== 'ALL') chips.push({ key: 'program', label: f.program, remove: x => ({ ...x, program: 'ALL' }) });
  if (f.presence !== 'ALL')
    chips.push({ key: 'presence', label: f.presence === 'YES' ? 'Presentes hoje' : 'Ausentes hoje', remove: x => ({ ...x, presence: 'ALL' }) });
  if (f.approached !== 'ALL')
    chips.push({ key: 'approached', label: f.approached === 'YES' ? 'Já abordados' : 'Não abordados', remove: x => ({ ...x, approached: 'ALL' }) });
  if (f.renewal) chips.push({ key: 'renewal', label: 'Renovação próxima', remove: x => ({ ...x, renewal: false }) });
  if (f.accompanied) chips.push({ key: 'accompanied', label: 'Acompanhados', remove: x => ({ ...x, accompanied: false }) });
  for (const band of f.icp) {
    const label = ICP_BAND_OPTIONS.find(o => o.value === band)?.label ?? band;
    chips.push({ key: `icp-${band}`, label, remove: x => ({ ...x, icp: x.icp.filter(v => v !== band) }) });
  }
  for (const r of f.readiness) {
    chips.push({ key: `readiness-${r}`, label: `Prontidão ${r}`, remove: x => ({ ...x, readiness: x.readiness.filter(v => v !== r) }) });
  }
  return chips;
}

// ---------- Lembrar os filtros neste aparelho ----------

const STORAGE_KEY = 'helper_rise_closer_filters_v1';

export function loadFilters(): CloserFilters {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...EMPTY_FILTERS, ...(JSON.parse(stored) as Partial<CloserFilters>) };
  } catch {
    // armazenamento indisponível ou inválido
  }
  return EMPTY_FILTERS;
}

export function saveFilters(f: CloserFilters) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    // armazenamento indisponível
  }
}
