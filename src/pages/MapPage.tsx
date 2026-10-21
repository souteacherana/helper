import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Eye, LayoutGrid, Map as MapIcon, Pencil, Plus, Search, Settings2, Trash2, UserX, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useEventTables } from '../hooks/useEventTables';
import { EventMap } from '../components/EventMap';
import { BadgePill } from '../components/BadgePill';
import { NumberField } from '../components/NumberField';
import {
  EMPTY_CHAIR_COLOR,
  FLOOR_TOP,
  MAP_WIDTH,
  areaAt,
  buildGeometry,
  buildSeatIndex,
  chairColor,
  readingOrder,
  seatKey,
  tablesOutsideHall,
  type MapAreaKey,
  type MapGeometry
} from '../lib/eventMap';
import { useHallSettings } from '../hooks/useHallSettings';
import { HallSizePanel } from '../components/HallSizePanel';
import { matchesQuery } from '../lib/format';
import { BADGE_COLORS, getBadgeLevel, type Attendee } from '../types/index';

const LEGEND = [
  { label: 'VIP', color: BADGE_COLORS.VIP },
  { label: 'Silver', color: BADGE_COLORS.SILVER },
  { label: 'Patrocinador', color: BADGE_COLORS.PATROCINADOR },
  { label: 'Vazio', color: EMPTY_CHAIR_COLOR }
];

/** Ingresso Silver em área VIP (ou o contrário). Patrocinador pode sentar em qualquer área. */
function areaMismatch(geo: MapGeometry, attendee: Attendee, tableX: number): string | null {
  const badge = getBadgeLevel(attendee);
  if (badge === 'PATROCINADOR') return null;
  const area = areaAt(geo, tableX);
  return badge !== area.ticket ? `Ingresso ${badge} em ${area.label}` : null;
}

export const MapPage: React.FC = () => {
  const navigate = useNavigate();
  const { attendees, userSession, assignSeat, releaseSeatsAbove } = useApp();
  const { tables, loading, addTable, updateTable, deleteTable, createDefaultLayout, setAreaTableCount, rearrangeAll, setAllSeats } =
    useEventTables();
  const { hall, saveHall } = useHallSettings();
  const geo = useMemo(() => buildGeometry(hall), [hall]);
  const isAdmin = userSession.role === 'ADMIN';

  const [editMode, setEditMode] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dimAbsent, setDimAbsent] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const editing = isAdmin && editMode;
  const seatIndex = useMemo(() => buildSeatIndex(attendees), [attendees]);
  const selectedTable = tables.find(t => t.id === selectedTableId) ?? null;
  const tableById = useMemo(() => new Map(tables.map(t => [t.id, t])), [tables]);

  const totalSeats = tables.reduce((sum, t) => sum + t.seats, 0);
  const seated = attendees.filter(a => a.tableId && tableById.has(a.tableId));
  const unseated = attendees.filter(a => !a.tableId || !tableById.has(a.tableId));

  // Busca: destaca no mapa os lugares de quem bate com o texto
  const searchMatches = useMemo(
    () => (search.trim() ? attendees.filter(a => matchesQuery(search, [a.name, a.instagram], a.phone)) : []),
    [attendees, search]
  );
  const highlightedIds = useMemo(() => new Set(searchMatches.map(a => a.id)), [searchMatches]);

  const scrollToX = (x: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const ratio = el.scrollWidth / MAP_WIDTH;
    el.scrollTo({ left: Math.max(0, x * ratio - el.clientWidth / 2) });
  };

  // Se a busca achou uma única pessoa sentada, abre a mesa dela
  const singleSeatedMatch = searchMatches.length === 1 && searchMatches[0].tableId ? searchMatches[0] : null;
  useEffect(() => {
    if (!singleSeatedMatch?.tableId) return;
    const table = tableById.get(singleSeatedMatch.tableId);
    if (!table) return;
    setSelectedTableId(table.id);
    scrollToX(table.x);
  }, [singleSeatedMatch?.id, singleSeatedMatch?.tableId, tableById]);

  const selectTable = (id: string | null) => {
    setSelectedTableId(id);
    setConfirmDelete(false);
    if (id) window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };

  const handleAddTable = () => {
    const nextNumber = tables.reduce((max, t) => Math.max(max, Number(t.label) || 0), 0) + 1;
    const center = geo.areas[1];
    // Nova mesa no meio da área VIP, perto do fundo do salão
    const y = Math.max(FLOOR_TOP + geo.chairDistance * 2, geo.height - geo.chairDistance - geo.chairSize * 2);
    const created = addTable({ label: String(nextNumber), x: Math.round(center.x + center.width / 2), y: Math.round(y), seats: 7 });
    selectTable(created.id);
    scrollToX(created.x);
  };

  // Quantas pessoas perdem o lugar se as mesas/cadeiras indicadas deixarem de existir
  const displacedBy = (tableIds: Set<string>, seatsAbove?: number) =>
    attendees.filter(a => a.tableId && tableIds.has(a.tableId) && (seatsAbove === undefined || (a.seatNumber ?? 0) > seatsAbove));

  const confirmDisplaced = (people: Attendee[], what: string) =>
    people.length === 0 ||
    window.confirm(
      `${what} deixa ${people.length} pessoa(s) sem lugar: ${people
        .slice(0, 5)
        .map(a => a.name)
        .join(', ')}${people.length > 5 ? '...' : ''}. Continuar?`
    );

  const tablesInArea = (key: MapAreaKey) => tables.filter(t => areaAt(geo, t.x).key === key);
  const commonSeats = tables.length > 0 && tables.every(t => t.seats === tables[0].seats) ? tables[0].seats : null;

  const changeAreaCount = (key: MapAreaKey, count: number) => {
    const current = tablesInArea(key).sort(readingOrder(geo));
    const removed = new Set(current.slice(count).map(t => t.id));
    const area = geo.areas.find(a => a.key === key)!;
    if (!confirmDisplaced(displacedBy(removed), `Diminuir as mesas da ${area.label} (${area.shortLabel})`)) return false;
    if (
      current.length > 0 &&
      !window.confirm(`As mesas da ${area.shortLabel} serão reorganizadas em fileiras e todas as mesas do mapa renumeradas. Continuar?`)
    ) {
      return false;
    }
    setAreaTableCount(geo, key, count, commonSeats ?? 7);
    if (selectedTableId && removed.has(selectedTableId)) selectTable(null);
    return true;
  };

  const changeAllSeats = (seats: number) => {
    const ids = new Set(tables.map(t => t.id));
    if (!confirmDisplaced(displacedBy(ids, seats), `Mudar todas as mesas para ${seats} lugares`)) return false;
    setAllSeats(seats);
    releaseSeatsAbove(seats);
    return true;
  };

  const changeTableSeats = (tableId: string, seats: number) => {
    const table = tableById.get(tableId);
    if (!table) return false;
    if (!confirmDisplaced(displacedBy(new Set([tableId]), seats), `Mudar a mesa ${table.label} para ${seats} lugares`)) return false;
    updateTable(tableId, { seats });
    releaseSeatsAbove(seats, tableId);
    return true;
  };

  const sortedForSelect = useMemo(
    () => [...attendees].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [attendees]
  );

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 pb-24">
      {/* Cabeçalho */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
            <MapIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">Mapa do Evento</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {editing ? 'Arraste as mesas para posicionar. Toque em uma mesa para editar e definir os lugares.' : 'Toque em uma mesa para ver quem está sentado em cada lugar.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-600">
            Lugares ocupados: <strong className="text-slate-900">{seated.length}</strong>/{totalSeats}
          </span>
          {isAdmin && (
            <button
              onClick={() => {
                setEditMode(prev => !prev);
                setConfirmDelete(false);
              }}
              className={`px-3 py-2.5 rounded-lg border font-bold flex items-center gap-1.5 transition ${
                editing ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {editing ? <Eye className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
              <span>{editing ? 'Concluir edição' : 'Editar mapa'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Busca, filtros e legenda */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Onde está sentado(a)? Digite o nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-10 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 transition shadow-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2.5 text-slate-400 hover:text-slate-700">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {search.trim() && (
          <div className="text-xs">
            {searchMatches.length === 0 ? (
              <span className="text-slate-500">Ninguém encontrado.</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {searchMatches.slice(0, 8).map(a => {
                  const table = a.tableId ? tableById.get(a.tableId) : undefined;
                  return (
                    <button
                      key={a.id}
                      onClick={() => {
                        if (!table) return;
                        selectTable(table.id);
                        scrollToX(table.x);
                      }}
                      className={`px-2.5 py-2 rounded-lg border font-semibold text-left ${
                        table ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-500 cursor-default'
                      }`}
                    >
                      {a.name} · {table ? `Mesa ${table.label}, lugar ${a.seatNumber}` : 'sem lugar'}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {geo.areas.map(area => (
              <button
                key={area.key}
                onClick={() => scrollToX(area.x + area.width / 2)}
                className="px-3 py-2.5 rounded-lg bg-white border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 shrink-0 lg:hidden"
              >
                {area.shortLabel}
              </button>
            ))}
            <button
              onClick={() => setDimAbsent(prev => !prev)}
              className={`px-3 py-2.5 rounded-lg border font-bold shrink-0 transition ${
                dimAbsent ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              Destacar presentes
            </button>
          </div>
          <div className="flex items-center gap-3 text-slate-600">
            {LEGEND.map(item => (
              <span key={item.label} className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Mapa */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Carregando mapa...</div>
        ) : tables.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <LayoutGrid className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm text-slate-500">O mapa ainda não foi montado.</p>
            {isAdmin && (
              <button
                onClick={() => {
                  createDefaultLayout(geo);
                  setEditMode(true);
                }}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 px-5 rounded-xl inline-flex items-center gap-1.5"
              >
                <LayoutGrid className="w-4 h-4" />
                <span>Criar com o layout do croqui (29 mesas × 7 lugares)</span>
              </button>
            )}
          </div>
        ) : (
          <div ref={scrollRef} className="overflow-x-auto">
            <EventMap
              geometry={geo}
              tables={tables}
              seatIndex={seatIndex}
              selectedTableId={selectedTableId}
              highlightedIds={highlightedIds}
              dimAbsent={dimAbsent}
              editable={editing}
              onSelectTable={selectTable}
              onMoveTable={(id, x, y) => updateTable(id, { x, y })}
            />
          </div>
        )}

        {editing && tables.length > 0 && (
          <div className="border-t border-slate-200 p-3 sm:px-5 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={handleAddTable}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar mesa</span>
            </button>
            <span className="text-[11px] text-slate-500">
              {tables.length} mesas • {unseated.length} participante(s) sem lugar
            </span>
          </div>
        )}
      </div>

      {/* Medidas reais do salão (admin) */}
      {editing && (
        <HallSizePanel
          hall={hall}
          tablesCount={tables.length}
          outsideCount={tablesOutsideHall(geo, tables).length}
          onSave={saveHall}
          onRearrange={() => rearrangeAll(geo, commonSeats ?? 7)}
        />
      )}

      {/* Configuração geral do mapa (admin) */}
      {editing && tables.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              <Settings2 className="w-4 h-4 text-slate-500" />
              <span>Configuração geral</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Mudar a quantidade de mesas reorganiza a área em fileiras e renumera as mesas. Ajustes finos: arraste as mesas no mapa.
            </p>
          </div>
          <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {geo.areas.map(area => (
              <div key={area.key} className="space-y-1.5">
                <span className="block font-bold text-slate-700">
                  Mesas na {area.label} <span className="text-slate-400 font-medium">({area.shortLabel})</span>
                </span>
                <NumberField
                  label={`Mesas na ${area.shortLabel}`}
                  value={tablesInArea(area.key).length}
                  min={0}
                  max={40}
                  onChange={count => changeAreaCount(area.key, count)}
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <span className="block font-bold text-slate-700">
                Lugares por mesa <span className="text-slate-400 font-medium">(todas)</span>
              </span>
              <NumberField label="Lugares em todas as mesas" value={commonSeats ?? tables[0].seats} min={1} max={16} onChange={changeAllSeats} />
              {commonSeats === null && <span className="block text-[11px] text-amber-700">As mesas têm quantidades diferentes.</span>}
            </div>
          </div>
        </div>
      )}

      {/* Mesa selecionada */}
      {selectedTable && (
        <div ref={panelRef} className="bg-white rounded-2xl border border-slate-300 shadow-md overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Mesa {selectedTable.label}</h2>
              <p className="text-[11px] text-slate-500">
                {areaAt(geo, selectedTable.x).label} • {selectedTable.seats} lugares
              </p>
            </div>
            <button onClick={() => selectTable(null)} className="p-2.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" title="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>

          {editing && (
            <div className="p-4 sm:px-5 border-b border-slate-100 bg-slate-50 flex flex-wrap items-end gap-3 text-xs">
              <label className="space-y-1">
                <span className="block font-bold text-slate-700">Número/nome da mesa</span>
                <input
                  key={selectedTable.id}
                  defaultValue={selectedTable.label}
                  onBlur={e => {
                    const label = e.target.value.trim();
                    if (label && label !== selectedTable.label) updateTable(selectedTable.id, { label });
                  }}
                  onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className="w-28 bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </label>
              <div className="space-y-1">
                <span className="block font-bold text-slate-700">Lugares nesta mesa</span>
                <NumberField
                  label="Lugares nesta mesa"
                  value={selectedTable.seats}
                  min={1}
                  max={16}
                  onChange={seats => changeTableSeats(selectedTable.id, seats)}
                />
              </div>
              <div className="ml-auto">
                {confirmDelete ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        if (!confirmDisplaced(displacedBy(new Set([selectedTable.id])), `Excluir a mesa ${selectedTable.label}`)) return;
                        deleteTable(selectedTable.id);
                        selectTable(null);
                      }}
                      className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold"
                    >
                      Confirmar exclusão
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="p-2 rounded-lg text-slate-400 hover:text-slate-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="px-3 py-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir mesa</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {Array.from({ length: selectedTable.seats }, (_, i) => {
              const seat = i + 1;
              const occupant = seatIndex.get(seatKey(selectedTable.id, seat));
              const mismatch = occupant ? areaMismatch(geo, occupant, selectedTable.x) : null;

              return (
                <div key={seat} className="px-4 sm:px-5 py-2.5 flex items-center gap-3 text-sm">
                  <span className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: chairColor(occupant) }} />
                  <span className="text-[11px] font-bold text-slate-400 w-14 shrink-0">Lugar {seat}</span>

                  {editing ? (
                    <div className="flex-1 min-w-0 space-y-1">
                      <select
                        value={occupant?.id ?? ''}
                        onChange={e => assignSeat(e.target.value || null, selectedTable.id, seat)}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
                      >
                        <option value="">— Lugar vazio —</option>
                        <optgroup label="Sem lugar">
                          {sortedForSelect
                            .filter(a => !a.tableId || !tableById.has(a.tableId))
                            .map(a => (
                              <option key={a.id} value={a.id}>
                                {a.name} ({getBadgeLevel(a)})
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label="Já sentados (muda de lugar)">
                          {sortedForSelect
                            .filter(a => a.tableId && tableById.has(a.tableId))
                            .map(a => (
                              <option key={a.id} value={a.id}>
                                {a.name} ({getBadgeLevel(a)}) — Mesa {tableById.get(a.tableId!)?.label}, lugar {a.seatNumber}
                              </option>
                            ))}
                        </optgroup>
                      </select>
                      {mismatch && (
                        <div className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {mismatch}
                        </div>
                      )}
                    </div>
                  ) : occupant ? (
                    <button
                      onClick={() => navigate(`/closers?focus=${encodeURIComponent(occupant.id)}`)}
                      className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left group py-1.5"
                    >
                      <span className="min-w-0 flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${occupant.isPresent ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          title={occupant.isPresent ? 'Presente' : 'Ainda não fez check-in'}
                        />
                        <span className="font-bold text-slate-900 truncate">{occupant.name}</span>
                        <BadgePill level={getBadgeLevel(occupant)} size="sm" />
                      </span>
                      <span className="text-[11px] font-bold text-slate-500 group-hover:text-slate-900 flex items-center shrink-0">
                        Ver intel <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  ) : (
                    <span className="flex-1 text-slate-400 italic text-xs">Lugar vazio</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin: quem ainda não tem lugar */}
      {editing && unseated.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-2">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
            <UserX className="w-4 h-4 text-slate-500" />
            <span>Sem lugar ({unseated.length})</span>
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {unseated.map(a => (
              <span
                key={a.id}
                className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 flex items-center gap-1.5"
              >
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BADGE_COLORS[getBadgeLevel(a)] }} />
                {a.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
