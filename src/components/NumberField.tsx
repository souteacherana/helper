import React, { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface NumberFieldProps {
  value: number;
  min: number;
  max: number;
  /** Chamado com o novo valor. Retornar false desfaz (ex: o usuário cancelou uma confirmação). */
  onChange: (value: number) => boolean | void;
  label?: string;
}

/** Campo numérico com − e +. Digitando, o valor só é aplicado ao sair do campo ou apertar Enter. */
export const NumberField: React.FC<NumberFieldProps> = ({ value, min, max, onChange, label }) => {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const commit = (next: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round(next)));
    if (!Number.isFinite(clamped) || clamped === value) {
      setDraft(String(value));
      return;
    }
    if (onChange(clamped) === false) setDraft(String(value));
  };

  return (
    <div className="flex items-center gap-1" aria-label={label}>
      <button
        type="button"
        onClick={() => commit(value - 1)}
        disabled={value <= min}
        className="p-3 rounded-lg border border-slate-300 bg-white disabled:opacity-40"
        title="Diminuir"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => commit(Number(draft))}
        onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="w-14 text-center bg-white border border-slate-300 rounded-lg py-2 text-sm font-bold text-slate-900 focus:outline-none focus:border-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => commit(value + 1)}
        disabled={value >= max}
        className="p-3 rounded-lg border border-slate-300 bg-white disabled:opacity-40"
        title="Aumentar"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
