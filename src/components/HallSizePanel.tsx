import React, { useEffect, useState } from 'react';
import { AlertTriangle, LayoutGrid, Ruler, Save } from 'lucide-react';
import { HALL_LIMITS, VENUE, type HallSettings } from '../lib/eventMap';

interface HallSizePanelProps {
  hall: HallSettings;
  tablesCount: number;
  outsideCount: number;
  onSave: (next: HallSettings) => void;
  onRearrange: () => void;
}

const FIELDS: { key: keyof HallSettings; label: string; hint: string }[] = [
  { key: 'vipWidthM', label: 'Largura da área VIP', hint: 'Faixa central; as áreas Silver dividem o resto' },
  { key: 'tableDiameterM', label: 'Diâmetro da mesa', hint: 'Mesa redonda, sem as cadeiras' }
];

const toText = (n: number) => String(n).replace('.', ',');
const toNumber = (s: string) => Number(s.replace(',', '.'));

/** Medidas ajustáveis do mapa (admin): o salão segue a planta; aqui entram área VIP e mesas. */
export const HallSizePanel: React.FC<HallSizePanelProps> = ({ hall, tablesCount, outsideCount, onSave, onRearrange }) => {
  const [draft, setDraft] = useState<Record<keyof HallSettings, string>>(() => ({
    vipWidthM: toText(hall.vipWidthM),
    tableDiameterM: toText(hall.tableDiameterM)
  }));
  const [justSaved, setJustSaved] = useState(false);

  // Medidas salvas em outro aparelho
  useEffect(() => {
    setDraft({
      vipWidthM: toText(hall.vipWidthM),
      tableDiameterM: toText(hall.tableDiameterM)
    });
  }, [hall]);

  const parsed = Object.fromEntries(FIELDS.map(f => [f.key, toNumber(draft[f.key])])) as unknown as HallSettings;
  const errors: string[] = [];
  for (const f of FIELDS) {
    const v = parsed[f.key];
    const { min, max } = HALL_LIMITS[f.key];
    if (!Number.isFinite(v) || v < min || v > max) errors.push(`${f.label}: entre ${toText(min)} e ${toText(max)} m`);
  }
  const changed = FIELDS.some(f => parsed[f.key] !== hall[f.key]);

  const save = () => {
    if (errors.length || !changed) return;
    onSave(parsed);
    setJustSaved(true);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-slate-200">
        <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
          <Ruler className="w-4 h-4 text-slate-500" />
          <span>Medidas</span>
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          O salão segue a planta do {VENUE.name} ({toText(VENUE.widthM)} m de largura, {toText(Math.round((VENUE.depthM - VENUE.stageFrontM) * 100) / 100)} m do palco ao fundo). Mesas, cadeiras e corredores ficam na escala real.
        </p>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {FIELDS.map(f => (
            <label key={f.key} className="space-y-1.5">
              <span className="block font-bold text-slate-700">{f.label}</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft[f.key]}
                  onChange={e => {
                    setDraft({ ...draft, [f.key]: e.target.value });
                    setJustSaved(false);
                  }}
                  onKeyDown={e => e.key === 'Enter' && save()}
                  className="w-24 bg-white border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-slate-900"
                />
                <span className="text-slate-500 font-semibold">m</span>
              </div>
              <span className="block text-[11px] text-slate-400">{f.hint}</span>
            </label>
          ))}
        </div>

        {errors.length > 0 && (
          <div className="text-[11px] font-semibold text-rose-700 space-y-0.5">
            {errors.map(e => (
              <div key={e}>{e}</div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <button
            onClick={save}
            disabled={errors.length > 0 || !changed}
            className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>Salvar medidas</span>
          </button>
          {tablesCount > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Reorganizar todas as mesas em fileiras na escala atual? As posições ajustadas à mão serão refeitas e as mesas renumeradas.')) {
                  onRearrange();
                  setJustSaved(false);
                }
              }}
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Reorganizar mesas nesta escala</span>
            </button>
          )}
        </div>

        {justSaved && tablesCount > 0 && (
          <p className="text-[11px] text-slate-600">
            Medidas salvas. As mesas continuam onde estavam: use “Reorganizar mesas nesta escala” para redistribuí-las.
          </p>
        )}
        {outsideCount > 0 && (
          <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {outsideCount} mesa(s) fora do salão ou encostadas numa parede (em vermelho). Arraste para dentro ou reorganize.
          </p>
        )}
      </div>
    </div>
  );
};
