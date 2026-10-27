import type { Attendee, EventTable } from '../types/index';
import { BADGE_COLORS, getBadgeLevel } from '../types/index';

/**
 * Geometria do mapa do evento: auditório do Espaço Altus (Barueri), desenhado a partir da planta.
 *
 * O desenho tem MAP_WIDTH unidades de largura, que representam a largura real do auditório
 * (parede a parede). O palco fica no alto do desenho e o fundo do salão embaixo.
 * As posições das mesas ficam salvas em unidades do desenho (x, y).
 */
export const MAP_WIDTH = 1590;

interface Box {
  label?: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Planta do auditório em metros. x: da parede esquerda para a direita (olhando o palco a
 * partir do fundo); y: da parede do palco para o fundo do salão.
 */
export const VENUE = {
  name: 'Espaço Altus',
  areaM2: 424,
  widthM: 44.3,
  depthM: 12.1,
  /** Frente do palco: daqui para o fundo é a área das mesas */
  stageFrontM: 3.25,
  /** Os dois cantos ao lado do palco são curvos, com centro no canto do prédio */
  cornerRadiusM: 7.5,
  stage: { x0: 7.6, x1: 36.8, y0: 1.25, y1: 3.25 },
  pillars: [
    { x0: 9.9, x1: 10.5, y0: 0, y1: 1.25 },
    { x0: 17.9, x1: 18.5, y0: 0, y1: 1.25 },
    { x0: 25.9, x1: 26.5, y0: 0, y1: 1.25 },
    { x0: 33.8, x1: 34.5, y0: 0, y1: 1.25 },
    { x0: 0, x1: 1.2, y0: 9.3, y1: 10.45 }
  ] as Box[],
  /** Recortes dentro do retângulo do salão, encostados numa parede lateral */
  rooms: [
    { label: 'Camarim', x0: 0, x1: 4.7, y0: 10.45, y1: 12.1 },
    { label: 'House', x0: 42.3, x1: 44.3, y0: 7.7, y1: 12.1 }
  ] as Box[],
  /** Portas de saída nas curvas: ângulo (graus) do centro da porta, a partir da parede do palco */
  exitAnglesDeg: [30, 60],
  exitWidthM: 1,
  /** Trecho do fundo que é divisória com o Lounge (o resto do fundo é parede) */
  lounge: { x0: 34.5, x1: 42.3 },
  /** O que fica atrás da parede do fundo, para a equipe se localizar */
  behind: [
    { label: 'Apoio', x0: 4.7, x1: 10 },
    { label: 'Banheiros', x0: 10, x1: 17 },
    { label: 'Escada', x0: 17.5, x1: 27 },
    { label: 'Banheiros', x0: 27.5, x1: 34.5 },
    { label: 'Lounge · Recepção', x0: 34.5, x1: 44.3 }
  ]
} as const;

export const STAGE_SECTIONS = ['PALCO ESQUERDA', 'PALCO MEIO', 'PALCO DIREITA'];

export const UNITS_PER_METER = MAP_WIDTH / VENUE.widthM;
/** Linha da frente do palco no desenho (acima dela: palco e parede do palco) */
export const FLOOR_TOP = Math.round(14 + VENUE.stageFrontM * UNITS_PER_METER);
/** Faixa abaixo do salão onde aparece o que fica atrás da parede do fundo */
export const BACK_STRIP = Math.round(1.3 * UNITS_PER_METER);

/** Metros da planta → unidades do desenho. */
export const mapX = (m: number) => m * UNITS_PER_METER;
export const mapY = (m: number) => FLOOR_TOP + (m - VENUE.stageFrontM) * UNITS_PER_METER;

/** Contorno do salão em metros (cantos curvos amostrados), no sentido horário a partir do palco. */
export function venueOutline(): { x: number; y: number }[] {
  const { widthM: w, depthM: d, cornerRadiusM: r } = VENUE;
  const arc = (cx: number, from: number, to: number) =>
    Array.from({ length: 13 }, (_, i) => {
      const a = ((from + ((to - from) * i) / 12) * Math.PI) / 180;
      return { x: cx + Math.cos(a) * r, y: Math.sin(a) * r };
    });
  const pts = arc(w, 180, 90);
  for (const room of [...VENUE.rooms].sort((a, b) => b.x0 - a.x0)) {
    if (room.x1 >= w) pts.push({ x: w, y: room.y0 }, { x: room.x0, y: room.y0 }, { x: room.x0, y: d });
    else pts.push({ x: room.x1, y: d }, { x: room.x1, y: room.y0 }, { x: 0, y: room.y0 });
  }
  pts.push(...arc(0, 90, 0));
  return pts;
}

// Faixa amarela que separa as áreas
export const DIVIDER_WIDTH = 14;

export type MapAreaKey = 'SILVER_LEFT' | 'VIP' | 'SILVER_RIGHT';

export interface MapArea {
  key: MapAreaKey;
  label: string;
  shortLabel: string;
  x: number;
  width: number;
  ticket: 'VIP' | 'SILVER';
}

/** Medidas ajustáveis pelo admin (o salão em si vem da planta). */
export interface HallSettings {
  vipWidthM: number;
  tableDiameterM: number;
}

export const DEFAULT_HALL: HallSettings = { vipWidthM: 12.7, tableDiameterM: 1.6 };

export const HALL_LIMITS = {
  vipWidthM: { min: 1, max: VENUE.widthM - 1 },
  tableDiameterM: { min: 0.6, max: 4 }
} as const;

const CHAIR_M = 0.36; // lado da cadeira
const CHAIR_GAP_M = 0.12; // centro da cadeira fica 12 cm além da borda da mesa (encostada, como no croqui)
const AISLE_M = 1.07; // corredor entre mesas vizinhas
const FRONT_GAP_M = 1.27; // distância entre a frente do palco e a primeira fileira
const SIDE_MARGIN_M = 0.9; // distância mínima do centro da mesa até a borda da área
const WALL_CLEAR_M = 0.6; // passagem livre entre as cadeiras e as paredes

export interface MapGeometry {
  hall: HallSettings;
  unitsPerMeter: number;
  height: number;
  areas: MapArea[];
  tableRadius: number;
  chairSize: number;
  chairDistance: number;
  /** Do centro da mesa até a borda de fora das cadeiras */
  reach: number;
}

export function buildGeometry(hall: HallSettings): MapGeometry {
  const upm = UNITS_PER_METER;
  const vipWidth = Math.min(hall.vipWidthM * upm, MAP_WIDTH - 2 * DIVIDER_WIDTH - 40);
  const silverWidth = (MAP_WIDTH - vipWidth - 2 * DIVIDER_WIDTH) / 2;
  const tableRadius = (hall.tableDiameterM / 2) * upm;
  const chairSize = CHAIR_M * upm;
  const chairDistance = tableRadius + CHAIR_GAP_M * upm;
  return {
    hall,
    unitsPerMeter: upm,
    height: mapY(VENUE.depthM),
    areas: [
      { key: 'SILVER_LEFT', label: 'Área Silver', shortLabel: 'Silver esq.', x: 0, width: silverWidth, ticket: 'SILVER' },
      { key: 'VIP', label: 'Área VIP', shortLabel: 'VIP', x: silverWidth + DIVIDER_WIDTH, width: vipWidth, ticket: 'VIP' },
      {
        key: 'SILVER_RIGHT',
        label: 'Área Silver',
        shortLabel: 'Silver dir.',
        x: silverWidth + DIVIDER_WIDTH + vipWidth + DIVIDER_WIDTH,
        width: silverWidth,
        ticket: 'SILVER'
      }
    ],
    tableRadius,
    chairSize,
    chairDistance,
    reach: chairDistance + chairSize / 2
  };
}

export function areaAt(geo: MapGeometry, x: number): MapArea {
  return geo.areas.find(area => x < area.x + area.width) ?? geo.areas[geo.areas.length - 1];
}

/**
 * Posição das cadeiras: em arco pela metade de baixo da mesa (de frente para o palco),
 * da esquerda para a direita. Lugar 1 = cadeira mais à esquerda.
 */
export function chairPositions(geo: MapGeometry, seats: number): { x: number; y: number }[] {
  const start = 190; // graus; 0° = direita, 90° = para baixo (y cresce para baixo no SVG)
  const end = -10;
  return Array.from({ length: seats }, (_, i) => {
    const angle = seats === 1 ? 90 : start + ((end - start) * i) / (seats - 1);
    const rad = (angle * Math.PI) / 180;
    return { x: Math.cos(rad) * geo.chairDistance, y: Math.sin(rad) * geo.chairDistance };
  });
}

/**
 * Faixa de x (desenho) onde cabe o centro de uma mesa na altura y, sem as cadeiras encostarem
 * nas paredes laterais, nos cantos curvos, no camarim ou na House. Vazia (min > max) se não couber.
 */
export function floorSpanAt(geo: MapGeometry, y: number, clearM = WALL_CLEAR_M): { min: number; max: number } {
  const upm = geo.unitsPerMeter;
  const ym = VENUE.stageFrontM + (y - FLOOR_TOP) / upm;
  const reach = geo.reach / upm + clearM;
  let min = reach;
  let max = VENUE.widthM - reach;
  const corner = VENUE.cornerRadiusM + reach;
  if (ym < corner) {
    const dx = Math.sqrt(corner * corner - ym * ym);
    min = Math.max(min, dx);
    max = Math.min(max, VENUE.widthM - dx);
  }
  for (const room of VENUE.rooms) {
    if (ym + reach <= room.y0 || ym - reach >= room.y1) continue;
    if (room.x0 <= 0) min = Math.max(min, room.x1 + reach);
    else max = Math.min(max, room.x0 - reach);
  }
  return { min: min * upm, max: max * upm };
}

/** Limites de y do centro de uma mesa dentro do salão. */
function floorRows(geo: MapGeometry, clearM = WALL_CLEAR_M) {
  return { top: FLOOR_TOP + geo.tableRadius + 4, bottom: geo.height - geo.reach - clearM * geo.unitsPerMeter };
}

/** Mantém a mesa (com as cadeiras) dentro do salão. */
export function clampToFloor(geo: MapGeometry, x: number, y: number) {
  const rows = floorRows(geo);
  const cy = Math.min(rows.bottom, Math.max(rows.top, y));
  const span = floorSpanAt(geo, cy);
  const [min, max] = span.min <= span.max ? [span.min, span.max] : [geo.reach, MAP_WIDTH - geo.reach];
  return { x: Math.round(Math.min(max, Math.max(min, x))), y: Math.round(cy) };
}

/** Mesas fora do salão ou com as cadeiras batendo numa parede. */
export function tablesOutsideHall<T extends { x: number; y: number }>(geo: MapGeometry, tables: T[]): T[] {
  const rows = floorRows(geo, 0);
  return tables.filter(t => {
    const span = floorSpanAt(geo, t.y, 0);
    return t.y > rows.bottom + 1 || t.x < span.min - 1 || t.x > span.max + 1;
  });
}

/** Altura do desenho: o salão e a faixa do fundo, ou mais se alguma mesa estiver abaixo dele. */
export function mapHeightFor(geo: MapGeometry, tables: { y: number }[]): number {
  const lowest = tables.reduce((max, t) => Math.max(max, t.y), 0);
  return Math.max(geo.height + BACK_STRIP, lowest + geo.reach + 8);
}

// ---------- Organização automática das mesas de uma área ----------

/**
 * Posições para `count` mesas dentro da área, em fileiras a partir do palco.
 * Cada fileira usa só o trecho em que as mesas cabem (cantos curvos, camarim e House
 * encurtam as fileiras); as mesas são repartidas por igual entre as fileiras usadas
 * e fileiras com folga ficam deslocadas meia mesa, alternando.
 * Se não couber tudo, as fileiras continuam abaixo do salão (aparecem como fora).
 */
export function layoutArea(geo: MapGeometry, area: MapArea, count: number): { x: number; y: number }[] {
  if (count <= 0) return [];
  const upm = geo.unitsPerMeter;
  const tableSpacing = (geo.hall.tableDiameterM + AISLE_M) * upm;
  const rowGap = tableSpacing * 0.83;
  const rowTop = FLOOR_TOP + geo.tableRadius + FRONT_GAP_M * upm;
  const sideMargin = Math.max(SIDE_MARGIN_M * upm, geo.chairDistance);
  const { bottom } = floorRows(geo);

  const rows: { y: number; min: number; max: number; cap: number }[] = [];
  let capacity = 0;
  while (capacity < count && rows.length < 60) {
    const y = rowTop + rows.length * rowGap;
    let min = area.x + sideMargin;
    let max = area.x + area.width - sideMargin;
    if (y <= bottom) {
      const span = floorSpanAt(geo, y);
      min = Math.max(min, span.min);
      max = Math.min(max, span.max);
    }
    const cap = max >= min ? Math.floor((max - min) / tableSpacing + 1e-6) + 1 : 0;
    rows.push({ y, min, max, cap });
    capacity += cap;
  }

  // Reparte por igual: o menor "teto" por fileira que comporta todas; o que sobra sai das do fundo
  let level = 0;
  while (level < count && rows.reduce((sum, r) => sum + Math.min(r.cap, level), 0) < count) level++;
  const inRow = rows.map(r => Math.min(r.cap, level));
  let excess = inRow.reduce((a, b) => a + b, 0) - count;
  for (let i = inRow.length - 1; i >= 0 && excess > 0; i--) {
    if (inRow[i] === level) {
      inRow[i]--;
      excess--;
    }
  }

  const positions: { x: number; y: number }[] = [];
  rows.forEach((row, r) => {
    const n = inRow[r];
    if (!n) return;
    const slack = row.max - row.min - (n - 1) * tableSpacing;
    const stagger = Math.max(-slack / 2, Math.min(slack / 2, (r % 2 === 0 ? -1 : 1) * (tableSpacing / 4)));
    const center = (row.min + row.max) / 2 + stagger;
    for (let j = 0; j < n; j++) {
      positions.push({ x: Math.round(center + (j - (n - 1) / 2) * tableSpacing), y: Math.round(row.y) });
    }
  });
  return positions;
}

/** Ordem de leitura do mapa: área (esq → dir), fileira (frente → fundo), posição (esq → dir). */
export function readingOrder(geo: MapGeometry) {
  return (a: { x: number; y: number }, b: { x: number; y: number }): number => {
    const areaA = geo.areas.indexOf(areaAt(geo, a.x));
    const areaB = geo.areas.indexOf(areaAt(geo, b.x));
    if (areaA !== areaB) return areaA - areaB;
    if (Math.abs(a.y - b.y) > geo.tableRadius) return a.y - b.y;
    return a.x - b.x;
  };
}

/** Layout inicial do croqui: 10 mesas Silver à esquerda, 9 VIP no meio, 10 Silver à direita (7 lugares). */
export const DEFAULT_TABLE_COUNTS: Record<MapAreaKey, number> = { SILVER_LEFT: 10, VIP: 9, SILVER_RIGHT: 10 };

/** Distribui `counts` mesas pelas áreas e numera tudo na ordem do mapa. */
export function arrangeAll(
  geo: MapGeometry,
  counts: Record<MapAreaKey, number>,
  existing: EventTable[],
  seatsForNew: number
): { arranged: EventTable[]; removed: EventTable[] } {
  const order = readingOrder(geo);
  const arranged: EventTable[] = [];
  const removed: EventTable[] = [];
  for (const area of geo.areas) {
    const inArea = existing.filter(t => areaAt(geo, t.x).key === area.key).sort(order);
    const positions = layoutArea(geo, area, counts[area.key]);
    positions.forEach((pos, i) => {
      arranged.push(inArea[i] ? { ...inArea[i], ...pos } : { id: `${newTableId()}-${area.key}-${i}`, label: '', seats: seatsForNew, ...pos });
    });
    removed.push(...inArea.slice(positions.length));
  }
  return { arranged: arranged.sort(order).map((t, i) => ({ ...t, label: String(i + 1) })), removed };
}

export const newTableId = () => 'mesa-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- Lugares ----------

export const EMPTY_CHAIR_COLOR = '#D4D4D8';

export const seatKey = (tableId: string, seat: number) => `${tableId}:${seat}`;

export function buildSeatIndex(attendees: Attendee[]): Map<string, Attendee> {
  const index = new Map<string, Attendee>();
  for (const a of attendees) {
    if (a.tableId && a.seatNumber) index.set(seatKey(a.tableId, a.seatNumber), a);
  }
  return index;
}

export const chairColor = (occupant: Attendee | undefined) =>
  occupant ? BADGE_COLORS[getBadgeLevel(occupant)] : EMPTY_CHAIR_COLOR;
