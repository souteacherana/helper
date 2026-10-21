import type { Attendee } from '../types/index';
import { getBadgeLevel } from '../types/index';
import { EVENT_DAYS } from './eventDays';
import { formatCheckInTime, formatDateBR } from './format';

/**
 * Planilha para o pós-venda: participantes com presença nos dois dias e todas as anotações
 * dos closers. Abas: Resumo, Participantes e Anotações (uma linha por anotação).
 */

type Cell = { value?: string | number; fontWeight?: 'bold'; color?: string; backgroundColor?: string; wrap?: boolean; type?: typeof String | typeof Number } | null;

const header = (titles: string[]): Cell[] =>
  titles.map(value => ({ value, fontWeight: 'bold', color: '#FFFFFF', backgroundColor: '#0F172A' }));
const text = (value: string | undefined | null, wrap = false): Cell => ({ value: value ?? '', type: String, wrap });
const num = (value: number): Cell => ({ value, type: Number });
const sim = (b: boolean | undefined) => (b ? 'Sim' : '');

const presenceTime = (iso: string | null | undefined) => (iso ? formatCheckInTime(iso) : '');

export async function buildPostEventWorkbook(attendees: Attendee[]): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const people = [...attendees].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const [day1, day2] = EVENT_DAYS;

  // ---------- Participantes ----------
  const participants: Cell[][] = [
    header([
      'Nome', 'Crachá', 'Telefone', 'Instagram', 'Mentorado', 'Mentoria atual', 'Ciclo', 'Fim do ciclo', 'Renovação próxima',
      'Acompanhante', `Presença ${day1.short}`, `Presença ${day2.short}`, 'Oferta a fazer', 'Condição especial',
      'Nº de anotações', 'Anotações dos closers'
    ]),
    ...people.map(a => {
      const notes = a.closerNotes ?? [];
      return [
        text(a.name),
        text(getBadgeLevel(a)),
        text(a.phone),
        text(a.instagram),
        text(sim(a.isMentee)),
        text(a.currentMentorship),
        text(a.cycle),
        text(formatDateBR(a.cycleEndDate)),
        text(sim(a.nearRenewal)),
        text(a.isAccompanied ? [a.companionName, a.accompaniedBy && `(${a.accompaniedBy})`].filter(Boolean).join(' ') || 'Sim' : ''),
        text(presenceTime(a.checkIns?.day1)),
        text(presenceTime(a.checkIns?.day2)),
        text(a.offerToMake),
        text(a.specialCondition, true),
        num(notes.length),
        text(notes.map(n => `${n.date} — ${n.closerName}: ${n.text}`).join('\n'), true)
      ];
    })
  ];

  // ---------- Anotações ----------
  const notesRows: Cell[][] = [
    header(['Pessoa', 'Crachá', 'Telefone', 'Closer', 'Data e hora', 'Anotação']),
    ...people.flatMap(a =>
      (a.closerNotes ?? []).map(n => [text(a.name), text(getBadgeLevel(a)), text(a.phone), text(n.closerName), text(n.date), text(n.text, true)])
    )
  ];

  // ---------- Resumo ----------
  const both = people.filter(a => a.checkIns?.day1 && a.checkIns?.day2).length;
  const byCloser = new Map<string, number>();
  for (const a of people) for (const n of a.closerNotes ?? []) byCloser.set(n.closerName, (byCloser.get(n.closerName) ?? 0) + 1);
  const summary: Cell[][] = [
    [{ value: 'Imersão Rise 2026 — pós-evento', fontWeight: 'bold' }, null],
    [text(`Gerado em ${new Date().toLocaleString('pt-BR')}`), null],
    [null, null],
    header(['Indicador', 'Quantidade']),
    [text('Participantes cadastrados'), num(people.length)],
    [text(`Presentes ${day1.short}`), num(people.filter(a => a.checkIns?.day1).length)],
    [text(`Presentes ${day2.short}`), num(people.filter(a => a.checkIns?.day2).length)],
    [text('Presentes nos dois dias'), num(both)],
    [text('Não vieram em nenhum dia'), num(people.filter(a => !a.checkIns?.day1 && !a.checkIns?.day2).length)],
    [text('Abordados (com anotação)'), num(people.filter(a => (a.closerNotes?.length ?? 0) > 0).length)],
    [text('Total de anotações'), num(notesRows.length - 1)],
    [null, null],
    header(['Anotações por closer', 'Quantidade']),
    ...[...byCloser].sort((a, b) => b[1] - a[1]).map(([name, n]) => [text(name), num(n)])
  ];

  return writeXlsxFile([
    { sheet: 'Resumo', data: summary as never, columns: [{ width: 34 }, { width: 14 }] },
    {
      sheet: 'Participantes',
      data: participants as never,
      stickyRowsCount: 1,
      columns: [36, 13, 17, 22, 11, 22, 11, 13, 11, 30, 13, 13, 24, 30, 10, 70].map(width => ({ width }))
    },
    { sheet: 'Anotações', data: notesRows as never, stickyRowsCount: 1, columns: [34, 13, 17, 16, 14, 80].map(width => ({ width })) }
  ]).toBlob();
}
