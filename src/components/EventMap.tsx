import React, { useMemo, useRef, useState } from 'react';
import type { Attendee, EventTable } from '../types/index';
import {
  DIVIDER_WIDTH,
  FLOOR_TOP,
  MAP_WIDTH,
  STAGE,
  STAGE_SECTIONS,
  chairColor,
  chairPositions,
  clampToFloor,
  mapHeightFor,
  seatKey,
  type MapGeometry
} from '../lib/eventMap';

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

  const sectionWidth = STAGE.width / STAGE_SECTIONS.length;
  // Durante o arraste, considera a posição nova para o desenho crescer junto
  const height = mapHeightFor(geo, drag ? [...tables, { y: drag.y }] : tables);
  const scale = scaleBar(geo.unitsPerMeter);
  const tableRadius = geo.tableRadius;
  const chairSize = geo.chairSize;
  const fmt = (m: number) => m.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

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

      {/* Palco */}
      <rect x={STAGE.x} y={STAGE.y - 4} width={STAGE.width} height={4} fill="#0F172A" />
      <rect x={STAGE.x} y={STAGE.y} width={STAGE.width} height={STAGE.height} fill="#8C8C8C" />
      {STAGE_SECTIONS.map((label, i) => (
        <text
          key={label}
          x={STAGE.x + sectionWidth * i + sectionWidth / 2}
          y={STAGE.y + STAGE.height / 2 + 9}
          textAnchor="middle"
          fontSize={26}
          fontWeight={800}
          fill="#FFFFFF"
        >
          {label}
        </text>
      ))}

      {/* Áreas */}
      {geo.areas.map((area, i) => (
        <g key={area.key}>
          <rect
            x={area.x}
            y={FLOOR_TOP}
            width={area.width}
            height={height - FLOOR_TOP}
            fill={area.ticket === 'VIP' ? '#FDE4E6' : '#F1F1F1'}
          />
          <text
            x={area.key === 'SILVER_RIGHT' ? area.x + area.width - 10 : area.ticket === 'VIP' ? area.x + area.width / 2 : area.x + 10}
            y={height - 10}
            textAnchor={area.key === 'SILVER_RIGHT' ? 'end' : area.ticket === 'VIP' ? 'middle' : 'start'}
            fontSize={14}
            fill="#334155"
          >
            {area.label.toUpperCase()}
          </text>
          {i < geo.areas.length - 1 && (
            <rect x={area.x + area.width} y={FLOOR_TOP} width={DIVIDER_WIDTH} height={height - FLOOR_TOP} fill="#FEF3C7" />
          )}
        </g>
      ))}

      {/* Limite do salão (pode haver mesas fora dele depois de diminuir as medidas) */}
      {height > geo.height + 1 && (
        <line x1={0} x2={MAP_WIDTH} y1={geo.height} y2={geo.height} stroke="#DC2626" strokeWidth={2} strokeDasharray="10 6" />
      )}

      {/* Medidas do salão e régua de escala */}
      <g transform={`translate(12 ${FLOOR_TOP + 22})`}>
        <text fontSize={13} fontWeight={700} fill="#475569">
          {`Salão ${fmt(geo.hall.widthM)} m × ${fmt(geo.hall.depthM)} m`}
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
            <circle r={tableRadius} fill="#555555" />
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
