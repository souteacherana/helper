/**
 * Dias do evento. A presença é registrada por dia; o "dia de hoje" segue a mesma regra
 * da função event_day() no banco (horário de Brasília): a partir de 01/11 é o Dia 2.
 */
export type EventDay = 1 | 2;

export const EVENT_DAYS: { day: EventDay; date: string; label: string; short: string }[] = [
  { day: 1, date: '2026-10-31', label: 'Dia 1 · sábado 31/10', short: 'Sáb 31/10' },
  { day: 2, date: '2026-11-01', label: 'Dia 2 · domingo 01/11', short: 'Dom 01/11' }
];

/** Data de hoje em Brasília, no formato AAAA-MM-DD. */
function todayInBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function currentEventDay(): EventDay {
  return todayInBrasilia() >= EVENT_DAYS[1].date ? 2 : 1;
}

export const eventDayInfo = (day: EventDay) => EVENT_DAYS[day - 1];
