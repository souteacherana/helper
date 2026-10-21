import type { Attendee } from '../types/index';
import { normalizeText } from './format';

/** Acompanhante citado na ficha de alguém, ligado ao cadastro dele quando existe. */
export interface CompanionLink {
  /** Nome como está na ficha */
  name: string;
  /** Cadastro do acompanhante no evento (se houver alguém com esse nome) */
  attendee?: Attendee;
  /** Nome ainda não definido (ex: "Acompanhante Kathy - EMMY CONFIRMAR") */
  pending: boolean;
}

export const isPendingName = (name: string) => /confirmar|a definir|sem nome/i.test(name);

/** Nome para exibir: nomes provisórios viram "Acompanhante — nome a confirmar". */
export const companionDisplayName = (name: string) => (isPendingName(name) ? 'Acompanhante — nome a confirmar' : name);

export const buildNameIndex = (attendees: Attendee[]) => new Map(attendees.map(a => [normalizeText(a.name), a]));

/** Acompanhantes de uma pessoa (o campo aceita vários nomes separados por vírgula). */
export function companionsOf(person: Attendee, byName: Map<string, Attendee>): CompanionLink[] {
  if (!person.isAccompanied) return [];
  const names = (person.companionName || '')
    .split(',')
    .map(n => n.trim())
    .filter(Boolean);
  if (names.length === 0) return [{ name: '', pending: true }];
  return names.map(name => {
    const attendee = byName.get(normalizeText(name));
    return { name, attendee: attendee?.id === person.id ? undefined : attendee, pending: isPendingName(name) };
  });
}

/** Texto curto para a etiqueta do card: "Vem com Marcos", "Vem com Ana +2", "Vem com acompanhante". */
export function companionChipLabel(links: CompanionLink[]): string {
  const first = links[0];
  const firstName = !first || first.pending || !first.name ? 'acompanhante' : first.name.split(' ')[0];
  return `Vem com ${firstName}${links.length > 1 ? ` +${links.length - 1}` : ''}`;
}
