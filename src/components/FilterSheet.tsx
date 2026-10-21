import React, { useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { BADGE_COLORS } from '../types/index';
import {
  BADGE_OPTIONS,
  EMPTY_FILTERS,
  MENTORSHIP_PROGRAMS,
  type CloserFilters,
  type TriState
} from '../lib/closerFilters';

interface FilterSheetProps {
  open: boolean;
  filters: CloserFilters;
  resultCount: number;
  onChange: (next: CloserFilters) => void;
  onClose: () => void;
}

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="space-y-2">
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
    {children}
  </section>
);

/** Grupo de opções exclusivas (uma por vez), estilo "segmented control". */
function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 p-1 rounded-xl bg-slate-100" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`py-2.5 px-2 rounded-lg text-xs font-bold transition ${
            value === o.value ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const Toggle: React.FC<{ checked: boolean; label: string; onChange: (v: boolean) => void }> = ({ checked, label, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="w-full flex items-center justify-between py-2.5 text-sm font-semibold text-slate-800"
  >
    <span>{label}</span>
    <span className={`w-10 h-6 rounded-full p-0.5 transition ${checked ? 'bg-slate-900' : 'bg-slate-300'}`}>
      <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </span>
  </button>
);

const tri = (all: string, yes: string, no: string): { value: TriState; label: string }[] => [
  { value: 'ALL', label: all },
  { value: 'YES', label: yes },
  { value: 'NO', label: no }
];

/** Painel de filtros: de baixo para cima no celular, janela central no computador. */
export const FilterSheet: React.FC<FilterSheetProps> = ({ open, filters, resultCount, onChange, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  const set = (patch: Partial<CloserFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label="Filtros">
      <button type="button" aria-label="Fechar filtros" onClick={onClose} className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" />

      <div className="relative w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[88vh] flex flex-col">
        <div className="md:hidden mx-auto mt-2.5 w-10 h-1.5 rounded-full bg-slate-200" />
        <header className="px-5 pt-3 pb-3 md:pt-5 flex items-center justify-between border-b border-slate-100">
          <h2 className="text-base font-extrabold text-slate-900">Filtros</h2>
          <button type="button" onClick={onClose} className="p-2.5 -mr-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-5 overflow-y-auto">
          <Section title="Crachá" hint="Marque um ou mais">
            <div className="grid grid-cols-3 gap-2">
              {BADGE_OPTIONS.map(o => {
                const active = filters.badges.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => set({ badges: active ? filters.badges.filter(b => b !== o.value) : [...filters.badges, o.value] })}
                    className={`relative py-3 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: BADGE_COLORS[o.value] }} />
                    <span className="truncate">{o.label}</span>
                    {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Mentoria">
            <Segmented
              value={filters.mentee}
              options={tri('Todos', 'Mentorados', 'Não mentorados')}
              onChange={mentee => set({ mentee, program: mentee === 'NO' ? 'ALL' : filters.program })}
            />
            {filters.mentee !== 'NO' && (
              <Segmented
                value={filters.program}
                options={[
                  { value: 'ALL' as const, label: 'Qualquer programa' },
                  ...MENTORSHIP_PROGRAMS.map(p => ({ value: p, label: p.replace('Mentoria ', '') }))
                ]}
                onChange={program => set({ program })}
              />
            )}
          </Section>

          <Section title="Presença hoje">
            <Segmented value={filters.presence} options={tri('Todos', 'Presentes', 'Ausentes')} onChange={presence => set({ presence })} />
          </Section>

          <Section title="Abordagem" hint="Se algum closer já registrou anotação">
            <Segmented value={filters.approached} options={tri('Todos', 'Já abordados', 'Não abordados')} onChange={approached => set({ approached })} />
          </Section>

          <Section title="Outros">
            <div className="divide-y divide-slate-100">
              <Toggle checked={filters.renewal} label="Renovação próxima" onChange={renewal => set({ renewal })} />
              <Toggle checked={filters.accompanied} label="Vieram acompanhados" onChange={accompanied => set({ accompanied })} />
            </div>
          </Section>
        </div>

        <footer className="px-5 py-3 border-t border-slate-100 flex items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="px-4 py-3 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold"
          >
            {resultCount === 0 ? 'Nenhum participante' : `Ver ${resultCount} participante${resultCount === 1 ? '' : 's'}`}
          </button>
        </footer>
      </div>
    </div>
  );
};
