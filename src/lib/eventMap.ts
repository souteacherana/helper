import type { Attendee, EventTable } from '../types/index';
import { BADGE_COLORS, getBadgeLevel } from '../types/index';

/**
 * Geometria do mapa do evento.
 *
 * O desenho tem sempre MAP_WIDTH unidades de largura, que representam a largura real do salão.
 * A partir das medidas em metros (configuradas pelo admin) calculamos a escala (unidades por
 * metro), a altura do desenho, a largura das áreas e o tamanho de mesas e cadeiras.
 * As posições das mesas ficam salvas em unidades do desenho (x, y).
 */
export const MAP_WIDTH = 1590;

// Faixa superior do desenho reservada ao palco (fora da medida do salão)
export const STAGE = { x: 152, y: 16, width: 1278, height: 48 };
export const STAGE_SECTIONS = ['PALCO ESQUERDA', 'PALCO MEIO', 'PALCO DIREITA'];
export const FLOOR_TOP = 80;

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

/** Medidas reais do salão, definidas pelo admin. */
export interface HallSettings {
  widthM: number;
  depthM: number;
  vipWidthM: number;
  tableDiameterM: number;
}

/**
 * Padrão = escala do croqui original (mesas de 1,6 m), para o desenho atual não mudar
 * até o admin informar as medidas reais.
 */
export const DEFAULT_HALL: HallSettings = { widthM: 47.1, depthM: 7.4, vipWidthM: 12.7, tableDiameterM: 1.6 };

export const HALL_LIMITS = {
  widthM: { min: 5, max: 200 },
  depthM: { min: 3, max: 200 },
  vipWidthM: { min: 1, max: 200 },
  tableDiameterM: { min: 0.6, max: 4 }
} as const;

const CHAIR_M = 0.36; // lado da cadeira
const CHAIR_GAP_M = 0.12; // centro da cadeira fica 12 cm além da borda da mesa (encostada, como no croqui)
const AISLE_M = 1.07; // corredor entre mesas vizinhas
const FRONT_GAP_M = 1.27; // distância entre a frente do salão e a primeira fileira
const SIDE_MARGIN_M = 0.9; // distância mínima do centro da mesa até a borda da área

export interface MapGeometry {
  hall: HallSettings;
  unitsPerMeter: number;
  height: number;
  areas: MapArea[];
  tableRadius: number;
  chairSize: number;
  chairDistance: number;
}

export function buildGeometry(hall: HallSettings): MapGeometry {
  const upm = MAP_WIDTH / hall.widthM;
  const vipWidth = Math.min(hall.vipWidthM * upm, MAP_WIDTH - 2 * DIVIDER_WIDTH - 40);
  const silverWidth = (MAP_WIDTH - vipWidth - 2 * DIVIDER_WIDTH) / 2;
  const tableRadius = (hall.tableDiameterM / 2) * upm;
  return {
    hall,
    unitsPerMeter: upm,
    height: FLOOR_TOP + hall.depthM * upm,
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
    chairSize: CHAIR_M * upm,
    chairDistance: tableRadius + CHAIR_GAP_M * upm
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

/** Mantém a mesa (com as cadeiras) dentro do salão. */
export function clampToFloor(geo: MapGeometry, x: number, y: number) {
  const margin = geo.chairDistance + geo.chairSize / 2;
  return {
    x: Math.round(Math.min(MAP_WIDTH - margin, Math.max(margin, x))),
    y: Math.round(Math.min(geo.height - margin, Math.max(FLOOR_TOP + geo.tableRadius + 4, y)))
  };
}

/** Mesas que ficaram fora do salão (ex: depois de diminuir a profundidade). */
export function tablesOutsideHall(geo: MapGeometry, tables: { x: number; y: number }[]) {
  return tables.filter(t => t.y + geo.tableRadius > geo.height || t.x < 0 || t.x > MAP_WIDTH);
}

/** Altura do desenho: o salão, ou mais se alguma mesa estiver abaixo dele. */
export function mapHeightFor(geo: MapGeometry, tables: { y: number }[]): number {
  const lowest = tables.reduce((max, t) => Math.max(max, t.y), 0);
  return Math.max(geo.height, lowest + geo.chairDistance + geo.chairSize);
}

// ---------- Organização automática das mesas de uma área ----------

/**
 * Posições para `count` mesas dentro da área, em fileiras (como no croqui):
 * cada fileira centralizada; fileiras de mesmo tamanho deslocadas meia mesa.
 */
export function layoutArea(geo: MapGeometry, area: MapArea, count: number): { x: number; y: number }[] {
  if (count <= 0) return [];
  const upm = geo.unitsPerMeter;
  const tableSpacing = (geo.hall.tableDiameterM + AISLE_M) * upm;
  const rowGap = tableSpacing * 0.83;
  const rowTop = FLOOR_TOP + geo.tableRadius + FRONT_GAP_M * upm;
  const sideMargin = Math.max(SIDE_MARGIN_M * upm, geo.chairDistance);
  const usable = Math.max(0, area.width - 2 * sideMargin);

  const perRowMax = Math.max(1, Math.floor(usable / tableSpacing + 1e-6) + 1);
  const rows = Math.ceil(count / perRowMax);
  const base = Math.floor(count / rows);
  const extra = count % rows;
  const center = area.x + area.width / 2;

  // Fileiras do mesmo tamanho: desloca meia mesa alternando (fileiras de tamanhos
  // diferentes já ficam intercaladas por estarem centralizadas)
  const allSameSize = rows > 1 && extra === 0;
  const widest = base + (extra ? 1 : 0);
  const spacing = Math.min(tableSpacing, usable / Math.max(1, widest - 1 + (allSameSize ? 0.5 : 0)));

  const positions: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    const inRow = base + (r < extra ? 1 : 0);
    const stagger = allSameSize ? (r % 2 === 0 ? -spacing / 4 : spacing / 4) : 0;
    for (let j = 0; j < inRow; j++) {
      positions.push({
        x: Math.round(center + (j - (inRow - 1) / 2) * spacing + stagger),
        y: Math.round(rowTop + r * rowGap)
      });
    }
  }
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
