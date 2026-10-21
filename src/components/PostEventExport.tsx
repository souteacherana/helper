import React, { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { buildPostEventWorkbook } from '../lib/postEventExport';
import { downloadBlob } from '../lib/badgeQr';

/** Admin: baixa a planilha do pós-venda (presenças + anotações dos closers). */
export const PostEventExport: React.FC = () => {
  const { attendees } = useApp();
  const [busy, setBusy] = useState(false);
  const notes = attendees.reduce((sum, a) => sum + (a.closerNotes?.length ?? 0), 0);
  const approached = attendees.filter(a => (a.closerNotes?.length ?? 0) > 0).length;

  const download = async () => {
    setBusy(true);
    try {
      const blob = await buildPostEventWorkbook(attendees);
      const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
      downloadBlob(blob, `helper-pos-evento-${date}.xlsx`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-5 space-y-3">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
            <FileDown className="w-4 h-4 text-slate-500" />
            <span>Exportar para o pós-venda</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Planilha com todos os participantes, presença em cada dia e as anotações dos closers. Hoje: {approached} pessoa(s)
            abordada(s), {notes} anotação(ões).
          </p>
        </div>
        <button
          onClick={download}
          disabled={busy || attendees.length === 0}
          className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          <span>{busy ? 'Gerando planilha...' : 'Baixar planilha (.xlsx)'}</span>
        </button>
      </div>
    </div>
  );
};
