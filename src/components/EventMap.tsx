import React, { useMemo, useRef, useState } from 'react';
import type { Attendee, EventTable } from '../types/index';
import {
  BACK_STRIP,
  DIVIDER_WIDTH,
  FLOOR_TOP,
  MAP_WIDTH,
  STAGE_SECTIONS,
  VENUE,
  chairColor,
  chairPositions,
  clampToFloor,
  mapHeightFor,
  mapX,
  mapY,
  seatKey,
  tablesOutsideHall,
  venueOutline,
  type MapGeometry
} from '../lib/eventMap';

const OUTLINE_PATH = 'M' + venueOutline().map(p => `${mapX(p.x).toFixed(1)} ${mapY(p.y).toFixed(1)}`).join(' L') + ' Z';

/** Portas de saída nas curvas: o trecho da parede e a posição do rótulo, já no desenho. */
const EXITS = VENUE.exitAnglesDeg.flatMap(deg =>
  [0, VENUE.widthM].map(cx => {
    const half = VENUE.exitWidthM / 2 / VENUE.cornerRadiusM;
    const at = (rad: number, r: number) => {
      const dx = Math.cos(rad) * r;
      return { x: mapX(cx === 0 ? dx : cx - dx), y: mapY(Math.sin(rad) * r) };
    };
    const rad = (deg * Math.PI) / 180;
    const p1 = at(rad - half, VENUE.cornerRadiusM);
    const p2 = at(rad + half, VENUE.cornerRadiusM);
    const label = at(rad, VENUE.cornerRadiusM + 0.6);
    return { key: `${cx}-${deg}`, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, labelX: label.x, labelY: label.y };
  })
);

/** Régua de escala com um comprimento "redondo" (1, 2, 5, 10... m) de uns 150–300 de desenho. */
function scaleBar(unitsPerMeter: number) {
  const target = 220 / unitsPerMeter;
  const meters = [1, 2, 5, 10, 20, 50].find(m => m >= target * 0.6) ?? 50;
  return { meters, length: meters * unitsPerMeter };
}

interface EventMapProps {
  geometry: MapGeometry;
  tables: EventTable[];
  seatIndex: Map<string, Attendee>;
  selectedTableId: string | null;
  highlightedIds: Set<string>;
  dimAbsent: boolean;
  editable: boolean;
  onSelectTable: (id: string | null) => void;
  onMoveTable: (id: string, x: number, y: number) => void;
  svgRef?: React.Ref<SVGSVGElement>;
}

interface DragState {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  moved: boolean;
}

export const EventMap: React.FC<EventMapProps> = ({
  geometry: geo,
  tables,
  seatIndex,
  selectedTableId,
  highlightedIds,
  dimAbsent,
  editable,
  onSelectTable,
  onMoveTable,
  svgRef
}) => {
  const localSvgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const setRefs = (node: SVGSVGElement | null) => {
    localSvgRef.current = node;
    if (typeof svgRef === 'function') svgRef(node);
    else if (svgRef) (svgRef as React.MutableRefObject<SVGSVGElement | null>).current = node;
  };

  // Converte a posição do dedo/mouse para coordenadas do desenho
  const toMapPoint = (clientX: number, clientY: number) => {
    const svg = localSvgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: point.x, y: point.y };
  };

  const chairsBySeats = useMemo(() => {
    const cache = new Map<number, { x: number; y: number }[]>();
    for (const t of tables) if (!cache.has(t.seats)) cache.set(t.seats, chairPositions(geo, t.seats));
    return cache;
  }, [tables, geo]);

  const handlePointerDown = (e: React.PointerEvent, table: EventTable) => {
    if (!editable) return;
    e.stopPropagation();
    const p = toMapPoint(e.clientX, e.clientY);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDrag({ id: table.id, pointerId: e.pointerId, startX: p.x, startY: p.y, originX: table.x, originY: table.y, x: table.x, y: table.y, moved: false });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const p = toMapPoint(e.clientX, e.clientY);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    const moved = drag.moved || Math.hypot(dx, dy) > 4;
    const next = clampToFloor(geo, drag.originX + dx, drag.originY + dy);
    setDrag({ ...drag, ...next, moved });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.moved) {
      onMoveTable(drag.id, drag.x, drag.y);
      onSelectTable(drag.id);
    } else {
      onSelectTable(drag.id === selectedTableId ? null : drag.id);
    }
    setDrag(null);
  };

  const stageX = mapX(VENUE.stage.x0);
  const stageY = mapY(VENUE.stage.y0);
  const stageW = mapX(VENUE.stage.x1 - VENUE.stage.x0);
  const stageH = mapY(VENUE.stage.y1) - stageY;
  const sectionWidth = stageW / STAGE_SECTIONS.length;
  const outlinePath = OUTLINE_PATH;
  const exits = EXITS;
  // Mesas fora do salão ou com cadeiras batendo numa parede (considera a posição do arraste)
  const placed = drag ? tables.map(t => (t.id === drag.id ? { ...t, x: drag.x, y: drag.y } : t)) : tables;
  const outsideIds = new Set(tablesOutsideHall(geo, placed).map(t => t.id));
  // Durante o arraste, considera a posição nova para o desenho crescer junto
  const height = mapHeightFor(geo, drag ? [...tables, { y: drag.y }] : tables);
  const scale = scaleBar(geo.unitsPerMeter);
  const tableRadius = geo.tableRadius;
  const chairSize = geo.chairSize;

  return (
    <svg
      ref={setRefs}
      viewBox={`0 0 ${MAP_WIDTH} ${height}`}
      className="w-full h-auto select-none"
      // Editando, o dedo arrasta mesas em vez de rolar a página
      style={{ minWidth: 1100, touchAction: editable ? 'none' : 'manipulation' }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDrag(null)}
      onClick={() => !editable && onSelectTable(null)}
      role="img"
      aria-label="Mapa do evento com mesas e lugares"
    >
      <rect x={0} y={0} width={MAP_WIDTH} height={height} fill="#FFFFFF" />

      {/* O que fica atrás da parede do fundo */}
      <rect x={0} y={geo.height} width={MAP_WIDTH} height={BACK_STRIP} fill="#F8FAFC" />
      {VENUE.behind.map(b => (
        <text key={b.label + b.x0} x={mapX((b.x0 + b.x1) / 2)} y={geo.height + BACK_STRIP / 2 + 5} textAnchor="middle" fontSize={13} fill="#94A3B8">
          {b.label}
        </text>
      ))}

      {/* Áreas, recortadas pelo contorno do salão */}
      <defs>
        <clipPath id="venue-floor">
          <path d={outlinePath} />
        </clipPath>
      </defs>
      <g clipPath="url(#venue-floor)">
        {geo.areas.map((area, i) => (
          <g key={area.key}>
            <rect
              x={area.x}
              y={FLOOR_TOP}
              width={area.width}
              height={geo.height - FLOOR_TOP}
              fill={area.ticket === 'VIP' ? '#FDE4E6' : '#F1F1F1'}
            />
            {i < geo.areas.length - 1 && (
              <rect x={area.x + area.width} y={FLOOR_TOP} width={DIVIDER_WIDTH} height={geo.height - FLOOR_TOP} fill="#FEF3C7" />
            )}
          </g>
        ))}
      </g>
      {geo.areas.map(area => {
        const anchor = area.key === 'SILVER_RIGHT' ? 'end' : area.ticket === 'VIP' ? 'middle' : 'start';
        // Rótulos no fundo, desviando do camarim (esquerda) e da House (direita)
        const x =
          area.key === 'SILVER_RIGHT'
            ? Math.min(area.x + area.width, mapX(VENUE.rooms[1].x0)) - 10
            : area.ticket === 'VIP'
              ? area.x + area.width / 2
              : Math.max(area.x, mapX(VENUE.rooms[0].x1)) + 10;
        return (
          <text key={area.key} x={x} y={geo.height - 10} textAnchor={anchor} fontSize={14} fill="#334155">
            {area.label.toUpperCase()}
          </text>
        );
      })}

      {/* Camarim e House */}
      {VENUE.rooms.map(room => (
        <g key={room.label}>
          <rect x={mapX(room.x0)} y={mapY(room.y0)} width={mapX(room.x1 - room.x0)} height={mapY(room.y1) - mapY(room.y0)} fill="#E2E8F0" />
          <text
            x={mapX((room.x0 + room.x1) / 2)}
            y={(mapY(room.y0) + mapY(room.y1)) / 2 + 5}
            textAnchor="middle"
            fontSize={13}
            fontWeight={700}
            fill="#64748B"
          >
            {room.label}
          </text>
        </g>
      ))}

      {/* Palco */}
      <rect x={stageX} y={stageY} width={stageW} height={stageH} fill="#8C8C8C" />
      {STAGE_SECTIONS.map((label, i) => (
        <text
          key={label}
          x={stageX + sectionWidth * i + sectionWidth / 2}
          y={stageY + stageH / 2 + 9}
          textAnchor="middle"
          fontSize={26}
          fontWeight={800}
          fill="#FFFFFF"
        >
          {label}
        </text>
      ))}

      {/* Paredes, pilares, divisória do lounge e saídas */}
      <path d={outlinePath} fill="none" stroke="#334155" strokeWidth={5} strokeLinejoin="round" />
      {VENUE.pillars.map(p => (
        <rect key={`${p.x0}-${p.y0}`} x={mapX(p.x0)} y={mapY(p.y0)} width={mapX(p.x1 - p.x0)} height={mapY(p.y1) - mapY(p.y0)} fill="#475569" />
      ))}
      <line x1={mapX(VENUE.lounge.x0)} x2={mapX(VENUE.lounge.x1)} y1={geo.height} y2={geo.height} stroke="#FFFFFF" strokeWidth={7} />
      <line
        x1={mapX(VENUE.lounge.x0)}
        x2={mapX(VENUE.lounge.x1)}
        y1={geo.height}
        y2={geo.height}
        stroke="#334155"
        strokeWidth={3}
        strokeDasharray="10 7"
      />
      {exits.map(e => (
        <g key={e.key}>
          <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#16A34A" strokeWidth={8} strokeLinecap="round" />
          <text x={e.labelX} y={e.labelY + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#15803D">
            SAÍDA
          </text>
        </g>
      ))}

      {/* Mesas abaixo do salão */}
      {height > geo.height + BACK_STRIP + 1 && (
        <line x1={0} x2={MAP_WIDTH} y1={geo.height} y2={geo.height} stroke="#DC2626" strokeWidth={2} strokeDasharray="10 6" />
      )}

      {/* Nome do espaço e régua de escala */}
      <g transform={`translate(12 ${mapY(0.25) + 12})`}>
        <text fontSize={13} fontWeight={700} fill="#475569">
          {`${VENUE.name} · ${VENUE.areaM2} m²`}
        </text>
        <line x1={0} x2={scale.length} y1={14} y2={14} stroke="#475569" strokeWidth={2} />
        <line x1={0} x2={0} y1={9} y2={19} stroke="#475569" strokeWidth={2} />
        <line x1={scale.length} x2={scale.length} y1={9} y2={19} stroke="#475569" strokeWidth={2} />
        <text x={scale.length + 6} y={19} fontSize={12} fill="#475569">{`${scale.meters} m`}</text>
      </g>

      {/* Mesas */}
      {tables.map(table => {
        const isDragging = drag?.id === table.id;
        const x = isDragging ? drag.x : table.x;
        const y = isDragging ? drag.y : table.y;
        const isSelected = table.id === selectedTableId;
        const chairs = chairsBySeats.get(table.seats) ?? [];
        const hasHighlight = chairs.some((_, i) => {
          const occupant = seatIndex.get(seatKey(table.id, i + 1));
          return occupant && highlightedIds.has(occupant.id);
        });

        return (
          <g
            key={table.id}
            transform={`translate(${x} ${y})`}
            onPointerDown={e => handlePointerDown(e, table)}
            onClick={e => {
              e.stopPropagation();
              // Visualização: abre no toque (e não ao encostar), para rolar o mapa sem abrir mesas
              if (!editable) onSelectTable(table.id === selectedTableId ? null : table.id);
            }}
            style={{ cursor: editable ? (isDragging ? 'grabbing' : 'grab') : 'pointer' }}
          >
            {/* Área de toque maior que a mesa */}
            <circle r={Math.max(tableRadius * 1.6, tableRadius + 16)} fill="transparent" />
            {(isSelected || hasHighlight) && (
              <circle
                r={geo.chairDistance + chairSize}
                fill="none"
                stroke={hasHighlight ? '#F59E0B' : '#0F172A'}
                strokeWidth={3}
                strokeDasharray={isSelected && !hasHighlight ? '6 4' : undefined}
              />
            )}
            <circle r={tableRadius} fill={outsideIds.has(table.id) ? '#DC2626' : '#555555'} />
            <text y={tableRadius * 0.22} textAnchor="middle" fontSize={Math.max(9, tableRadius * 0.63)} fontWeight={800} fill="#FFFFFF">
              {table.label}
            </text>
            {chairs.map((pos, i) => {
              const occupant = seatIndex.get(seatKey(table.id, i + 1));
              const dimmed = dimAbsent && (!occupant || !occupant.isPresent);
              const highlighted = occupant && highlightedIds.has(occupant.id);
              return (
                <rect
                  key={i}
                  x={pos.x - chairSize / 2}
                  y={pos.y - chairSize / 2}
                  width={chairSize}
                  height={chairSize}
                  fill={chairColor(occupant)}
                  opacity={dimmed ? 0.3 : 1}
                  stroke={highlighted ? '#F59E0B' : undefined}
                  strokeWidth={highlighted ? 2.5 : undefined}
                >
                  <title>{`Lugar ${i + 1}: ${occupant ? occupant.name : 'vazio'}`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
};
