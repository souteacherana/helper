import type { Attendee, BadgeLevel } from '../types/index';
import { getBadgeLevel } from '../types/index';

export type TriState = 'ALL' | 'YES' | 'NO';
export const MENTORSHIP_PROGRAMS = ['Mentoria Partiu 10K', 'Professores de Elite'] as const;
export type MentorshipProgram = (typeof MENTORSHIP_PROGRAMS)[number];

/** Filtros da tela dos closers. Lista vazia / 'ALL' = sem filtro naquele grupo. */
export interface CloserFilters {
  badges: BadgeLevel[];
  mentee: TriState;
  program: 'ALL' | MentorshipProgram;
  presence: TriState; // presença no dia de hoje do evento
  approached: TriState; // já tem anotação de algum closer?
  renewal: boolean;
  accompanied: boolean;
}

export const EMPTY_FILTERS: CloserFilters = {
  badges: [],
  mentee: 'ALL',
  program: 'ALL',
  presence: 'ALL',
  approached: 'ALL',
  renewal: false,
  accompanied: false
};

export const BADGE_OPTIONS: { value: BadgeLevel; label: string }[] = [
  { value: 'VIP', label: 'VIP' },
  { value: 'SILVER', label: 'Silver' },
  { value: 'PATROCINADOR', label: 'Patrocinador' }
];

/** Atalhos de venda prontos. */
export const FILTER_PRESETS: { id: string; label: string; filters: CloserFilters }[] = [
  { id: 'vip-nao-mentorado', label: '🔥 VIPs não mentorados', filters: { ...EMPTY_FILTERS, badges: ['VIP'], mentee: 'NO' } },
  { id: 'presentes-nao-abordados', label: 'Presentes ainda não abordados', filters: { ...EMPTY_FILTERS, presence: 'YES', approached: 'NO' } },
  { id: 'renovacao', label: 'Renovação próxima', filters: { ...EMPTY_FILTERS, renewal: true } }
];

export function matchesFilters(a: Attendee, f: CloserFilters): boolean {
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
