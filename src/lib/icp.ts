/**
 * ICP dos inscritos (tabela attendee_icp, importada do formulário da Imersão).
 * Nível 1 a 7 = mesma escala do qualificador do Rise (1 = mais avançado); prontidão e perfil DISC
 * são etiquetas para o closer saber como conduzir a conversa.
 */
export type Readiness = 'A' | 'B' | 'C';

export interface Icp {
  attendeeId: string;
  level: number | null;
  profile: string;
  direction: string;
  readiness: Readiness | null;
  readinessScore: number | null;
  disc: string;
  answers: Record<string, string>;
}

export interface IcpRow {
  attendee_id: string;
  icp_level: number | null;
  profile: string | null;
  direction: string | null;
  readiness: Readiness | null;
  readiness_score: number | null;
  disc: string | null;
  answers: Record<string, string> | null;
}

export const icpFromRow = (r: IcpRow): Icp => ({
  attendeeId: r.attendee_id,
  level: r.icp_level,
  profile: r.profile ?? '',
  direction: r.direction ?? '',
  readiness: r.readiness,
  readinessScore: r.readiness_score,
  disc: r.disc ?? '',
  answers: r.answers ?? {}
});

export const READINESS_INFO: Record<Readiness, string> = {
  A: 'Tende a fechar no evento com uma boa conversa.',
  B: 'Fecha com processo: call + proposta clara.',
  C: 'Precisa de prova e segurança antes de decidir.'
};

export const READINESS_STYLE: Record<Readiness, string> = {
  A: 'bg-emerald-600 text-white border-emerald-600',
  B: 'bg-amber-100 text-amber-900 border-amber-300',
  C: 'bg-slate-200 text-slate-700 border-slate-300'
};

export const DISC_INFO: Record<string, string> = {
  Dominante: 'Decide rápido: seja direto e objetivo.',
  Influente: 'Decide conversando: crie conexão e troque ideias.',
  Estável: 'Precisa de segurança: mostre garantias e acolha.',
  Conforme: 'Precisa entender o processo: explique etapas e detalhes.'
};

/** Cor do nível: Elite (1–3), transição (4), Partiu 10K (5–6), Workshop (7) */
export function levelStyle(level: number | null): string {
  if (level === null) return 'bg-slate-100 text-slate-600 border-slate-200';
  if (level <= 3) return 'bg-violet-50 text-violet-800 border-violet-200';
  if (level === 4) return 'bg-indigo-50 text-indigo-800 border-indigo-200';
  if (level <= 6) return 'bg-sky-50 text-sky-800 border-sky-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

/** Respostas do formulário na ordem em que aparecem para o closer */
export const ANSWER_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Negócio', keys: ['Faturamento', 'Meta 6–12m', 'Vende hoje?', 'Tempo na área', 'Disciplina', 'Cidade/UF'] },
  {
    title: 'Para a conversa',
    keys: ['Motiva', 'Precisa para decidir', 'Diria SIM por', 'Impede', 'Daqui a 6 meses', 'Sente', 'Espera do evento', 'Frustrações']
  }
];
