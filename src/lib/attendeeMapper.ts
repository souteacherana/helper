import type { AccompaniedBy, Attendee, CloserNote, ConfirmationStatus, PaymentMethod, TicketLevel } from '../types/index';
import { currentEventDay } from './eventDays';

// Foto genérica que versões antigas gravavam para todo participante sem foto.
// Tratada como "sem foto" para que o avatar com iniciais seja exibido no lugar.
const LEGACY_DEFAULT_PHOTO = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400';

export interface AttendeeRow {
  id: string;
  name: string;
  phone: string | null;
  instagram: string | null;
  level: string;
  is_sponsor: boolean | null;
  status: string | null;
  is_present: boolean | null;
  check_in_time: string | null;
  check_in_day1?: string | null;
  check_in_day2?: string | null;
  is_mentee: boolean | null;
  near_renewal: boolean | null;
  photo_url: string | null;
  is_accompanied: boolean | null;
  accompanied_by: string | null;
  companion_name: string | null;
  current_mentorship: string | null;
  cycle: string | null;
  cycle_end_date: string | null;
  mentorship_remaining: string | null;
  is_paying: boolean | null;
  payment_method: string | null;
  installment_value: string | null;
  remaining_installments: number | null;
  mentorship_value: string | null;
  amount_paid: string | null;
  credit_balance: string | null;
  offer_to_make: string | null;
  special_condition: string | null;
  table_id: string | null;
  seat_number: number | null;
}

export interface CloserNoteRow {
  id: string;
  attendee_id: string;
  text: string;
  closer_name: string;
  created_at: string;
}

export function formatNoteDate(date: Date): string {
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function noteFromRow(row: CloserNoteRow): CloserNote {
  return {
    id: row.id,
    date: formatNoteDate(new Date(row.created_at)),
    text: row.text,
    closerName: row.closer_name
  };
}

export function attendeeFromRow(row: AttendeeRow, notes: CloserNote[]): Attendee {
  // Presença por dia (seção 7 do SQL). Banco sem essas colunas: usa o campo único antigo.
  const hasDays = row.check_in_day1 !== undefined || row.check_in_day2 !== undefined;
  const checkIns = hasDays
    ? { day1: row.check_in_day1 ?? null, day2: row.check_in_day2 ?? null }
    : { day1: row.is_present ? row.check_in_time : null, day2: null };
  const today = currentEventDay() === 2 ? checkIns.day2 : checkIns.day1;

  return {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    instagram: row.instagram || '',
    level: (row.level === 'SILVER' ? 'SILVER' : 'VIP') as TicketLevel,
    isSponsor: row.is_sponsor ?? false,
    status: (row.status || 'CONFIRMED') as ConfirmationStatus,
    isPresent: Boolean(today),
    checkInTime: today,
    checkIns,
    isMentee: row.is_mentee ?? false,
    nearRenewal: row.near_renewal ?? false,
    photoUrl: row.photo_url && row.photo_url !== LEGACY_DEFAULT_PHOTO ? row.photo_url : '',
    closerNotes: notes,
    isAccompanied: row.is_accompanied ?? false,
    accompaniedBy: (row.accompanied_by || undefined) as AccompaniedBy | undefined,
    companionName: row.companion_name || '',
    currentMentorship: row.current_mentorship || '',
    cycle: row.cycle || '',
    cycleEndDate: row.cycle_end_date || '',
    mentorshipRemaining: row.mentorship_remaining || '',
    isPaying: row.is_paying ?? false,
    paymentMethod: (row.payment_method || undefined) as PaymentMethod | undefined,
    installmentValue: row.installment_value || '',
    remainingInstallments: row.remaining_installments ?? undefined,
    mentorshipValue: row.mentorship_value || '',
    amountPaid: row.amount_paid || '',
    creditBalance: row.credit_balance || '',
    offerToMake: row.offer_to_make || '',
    specialCondition: row.special_condition || '',
    tableId: row.table_id || undefined,
    seatNumber: row.seat_number ?? undefined
  };
}

/**
 * Converte um Attendee para o formato da tabela. Usado tanto no insert quanto no update,
 * para que nenhum campo fique de fora em um dos dois caminhos.
 * Strings vazias viram NULL (as colunas com CHECK não aceitam '').
 */
export function attendeeToRow(a: Attendee): AttendeeRow {
  return {
    id: a.id,
    name: a.name,
    phone: a.phone || null,
    instagram: a.instagram || null,
    level: a.level,
    is_sponsor: a.isSponsor ?? false,
    status: a.status,
    is_present: a.isPresent,
    check_in_time: a.checkInTime ?? null,
    check_in_day1: a.checkIns?.day1 ?? null,
    check_in_day2: a.checkIns?.day2 ?? null,
    is_mentee: a.isMentee,
    near_renewal: a.nearRenewal,
    photo_url: a.photoUrl || null,
    is_accompanied: a.isAccompanied,
    accompanied_by: a.isAccompanied ? a.accompaniedBy || null : null,
    companion_name: a.isAccompanied ? a.companionName || null : null,
    current_mentorship: a.currentMentorship || null,
    cycle: a.cycle || null,
    cycle_end_date: a.cycleEndDate || null,
    mentorship_remaining: a.mentorshipRemaining || null,
    is_paying: a.isPaying,
    payment_method: a.isPaying ? a.paymentMethod || null : null,
    installment_value: a.isPaying ? a.installmentValue || null : null,
    remaining_installments: a.isPaying ? a.remainingInstallments ?? null : null,
    mentorship_value: a.mentorshipValue || null,
    amount_paid: a.amountPaid || null,
    credit_balance: a.creditBalance || null,
    offer_to_make: a.offerToMake || null,
    special_condition: a.specialCondition || null,
    table_id: a.tableId || null,
    seat_number: a.tableId ? a.seatNumber ?? null : null
  };
}
