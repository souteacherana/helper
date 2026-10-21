export type TicketLevel = 'VIP' | 'SILVER';
export type BadgeLevel = 'VIP' | 'SILVER' | 'PATROCINADOR';
export type ConfirmationStatus = 'CONFIRMED' | 'AWAITING';
export type AccompaniedBy = 'Esposo(a)' | 'Familiar' | 'Professor parceiro' | 'Colaborador' | 'Amigo';
export type PaymentMethod = 'Boleto' | 'Cartão de Crédito';

export interface CloserNote {
  id: string;
  date: string;
  text: string;
  closerName: string;
}

export interface Attendee {
  id: string;
  name: string;
  phone: string;
  instagram: string;
  level: TicketLevel;      // 'VIP' ou 'SILVER'
  isSponsor?: boolean;     // Marcação 'Patrocinador?'
  status: ConfirmationStatus;
  /** Presença no dia de hoje do evento (ver lib/eventDays) */
  isPresent: boolean;
  checkInTime?: string | null;
  /** Check-in de cada dia do evento (ISO), null = não veio */
  checkIns?: { day1: string | null; day2: string | null };
  isMentee: boolean;
  nearRenewal: boolean;
  photoUrl: string;
  closerNotes: CloserNote[];

  // Acompanhante
  isAccompanied: boolean;
  accompaniedBy?: AccompaniedBy;
  companionName?: string;

  // Situação de mentoria
  currentMentorship: string;
  cycle: string;
  cycleEndDate: string;
  mentorshipRemaining?: string;
  isPaying: boolean;
  paymentMethod?: PaymentMethod;
  installmentValue?: string;
  remainingInstallments?: number;
  mentorshipValue?: string;   // Valor total da mentoria
  amountPaid?: string;        // Valor já pago
  creditBalance?: string;     // Valor em haver (tempo restante convertido em dinheiro)

  // Oferta
  offerToMake: string;
  specialCondition?: string;

  // Lugar no mapa do evento
  tableId?: string;
  seatNumber?: number;
}

/** Mesa do mapa do evento. x/y é o centro da mesa nas coordenadas do desenho (ver lib/eventMap). */
export interface EventTable {
  id: string;
  label: string;
  x: number;
  y: number;
  seats: number;
}

/**
 * Lógica oficial do evento para o Crachá entregue na recepção e no QR Code:
 * 1. Patrocinador? SIM -> Crachá PATROCINADOR (verde água)
 * 2. Ingresso == SILVER -> Crachá SILVER (prateado)
 * 3. Ingresso == VIP -> Crachá VIP (vermelho brasa), independente de 'É ESPECIAL?'
 */
export function getBadgeLevel(attendee: Attendee): BadgeLevel {
  if (attendee.isSponsor) {
    return 'PATROCINADOR';
  }
  if (attendee.level === 'SILVER') {
    return 'SILVER';
  }
  return 'VIP';
}

export type UserRole = 'CLOSER' | 'RECEPCAO' | 'ADMIN' | null;

export interface UserSession {
  role: UserRole;
  userName?: string;
  loggedInAt?: string;
}

export const BADGE_COLORS = {
  VIP: '#991B1B', // vermelho brasa
  SILVER: '#94A3B8', // prateado
  PATROCINADOR: '#0D9488' // verde água / teal
} as const;
