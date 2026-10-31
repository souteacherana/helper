/**
 * Linhas do Dashboard: uma por pessoa do HELPER, com o ICP do formulário (attendee_icp),
 * presença dos dois dias, RISERS e as vendas, para filtrar e abrir Cobrança/Contrato.
 */
import type { Attendee } from '../types/index';
import type { Icp } from './icp';
import type { Sale } from './sales';
import { buildNameIndex, companionsOf } from './companions';

export type Ingresso = 'VIP' | 'SILVER' | 'PATROCINADOR';
export type PerfilKey = 'mentorado' | 'acompanhante' | 'patrocinador' | 'naoMentorado';

export const PERFIS: Record<PerfilKey, { label: string; className: string }> = {
  mentorado: { label: 'Mentorado', className: 'bg-emerald-600 border-emerald-600 text-white' },
  acompanhante: { label: 'Acompanhante', className: 'bg-stone-100 border-stone-300 text-stone-700' },
  patrocinador: { label: 'Patrocinador', className: 'bg-teal-50 border-teal-200 text-teal-800' },
  naoMentorado: { label: 'Não mentorado', className: 'bg-amber-50 border-amber-200 text-amber-800' }
};

/** Mesma escala do formulário: 1 = escola estruturada … 7 = aspirante */
export const ICP_NIVEL: Record<number, string> = {
  1: 'Escola Estruturada',
  2: 'Escola em Formação',
  3: 'Estruturando Escala',
  4: 'Professor Sobrecarregado',
  5: 'Professor Operacional',
  6: 'Iniciante',
  7: 'Aspirante'
};

export interface DashboardRow {
  attendee: Attendee;
  ingresso: Ingresso;
  perfil: PerfilKey;
  /** "Acompanha Fulana" quando a pessoa veio junto com um mentorado */
  perfilNota: string;
  riser: boolean;
  icp?: Icp;
  sales: Sale[];
}

/**
 * Acompanhante = não é mentorado e veio com um mentorado (cônjuge, familiar, colaborador ou amigo);
 * professor parceiro conta como não mentorado, porque também pode comprar.
 */
function perfilDe(a: Attendee, byName: Map<string, Attendee>): [PerfilKey, string] {
  if (a.isSponsor) return ['patrocinador', ''];
  if (a.isMentee) return ['mentorado', ''];
  const mentees = companionsOf(a, byName)
    .map(c => c.attendee)
    .filter((c): c is Attendee => !!c?.isMentee);
  if (mentees.length && a.accompaniedBy !== 'Professor parceiro') {
    return ['acompanhante', `Acompanha ${mentees.map(m => m.name.split(' ')[0]).join(', ')}`];
  }
  return ['naoMentorado', ''];
}

export function buildDashboardRows(
  attendees: Attendee[],
  icpMap: Map<string, Icp>,
  salesByAttendee: Map<string, Sale[]>,
  risers: Set<string> | undefined
): DashboardRow[] {
  const byName = buildNameIndex(attendees);
  return attendees.map(a => {
    const [perfil, perfilNota] = perfilDe(a, byName);
    return {
      attendee: a,
      ingresso: a.isSponsor ? 'PATROCINADOR' : a.level,
      perfil,
      perfilNota,
      riser: !!risers?.has(a.id),
      icp: icpMap.get(a.id),
      sales: salesByAttendee.get(a.id) ?? []
    };
  });
}
