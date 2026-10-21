import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { buildImportPreview, readSpreadsheet, type ImportPreview } from '../lib/spreadsheetImport';
import { BadgePill } from './BadgePill';
import { getBadgeLevel } from '../types/index';

export const SpreadsheetImport: React.FC = () => {
  const { attendees, importAttendees } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [status, setStatus] = useState<'idle' | 'reading' | 'saving' | 'done'>('idle');
  const [readError, setReadError] = useState('');
  const [doneMessage, setDoneMessage] = useState('');

  const reset = () => {
    setPreview(null);
    setFileName('');
    setReadError('');
    setStatus('idle');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    reset();
    setDoneMessage('');
    setFileName(file.name);
    setStatus('reading');
    try {
      const sheet = await readSpreadsheet(file);
      setPreview(buildImportPreview(sheet, attendees));
    } catch (err) {
      console.error('Failed to read spreadsheet:', err);
      setReadError('Não consegui ler o arquivo. Confirme que é uma planilha .xlsx (Excel ou Google Planilhas → Download → .xlsx).');
    }
    setStatus('idle');
  };

  const handleConfirm = async () => {
    if (!preview || preview.rows.length === 0) return;
    setStatus('saving');
    const created = preview.rows.filter(r => r.action === 'create').length;
    const updated = preview.rows.length - created;
    const ok = await importAttendees(preview.rows.map(r => r.attendee));
    if (ok) {
      reset();
      setDoneMessage(`Importação concluída: ${created} novo(s), ${updated} atualizado(s).`);
    } else {
      setStatus('idle');
    }
  };

  const created = preview?.rows.filter(r => r.action === 'create').length ?? 0;
  const updated = (preview?.rows.length ?? 0) - created;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-slate-500" />
            <span>Importar Planilha</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Baixe o modelo, preencha e envie o arquivo .xlsx. Você confere tudo antes de salvar.
          </p>
        </div>
        <a
          href="/modelo_participantes.xlsx"
          download
          className="self-start sm:self-auto text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center gap-1.5 transition shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Baixar planilha modelo</span>
        </a>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-slate-300 hover:border-slate-500 rounded-xl p-4 text-xs font-bold text-slate-600 cursor-pointer transition">
          {status === 'reading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span>{fileName || 'Escolher arquivo .xlsx'}</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFile}
            className="hidden"
          />
        </label>

        {doneMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{doneMessage}</span>
          </div>
        )}

        {readError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">{readError}</div>
        )}

        {preview && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="text-lg font-black text-emerald-700">{created}</div>
                <div className="text-[11px] font-bold uppercase text-emerald-800">Novos</div>
              </div>
              <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200">
                <div className="text-lg font-black text-sky-700">{updated}</div>
                <div className="text-[11px] font-bold uppercase text-sky-800">Atualizados</div>
              </div>
              <div
                className={`p-2.5 rounded-xl border ${
                  preview.errors.length ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className={`text-lg font-black ${preview.errors.length ? 'text-rose-700' : 'text-slate-400'}`}>
                  {preview.errors.length}
                </div>
                <div className={`text-[11px] font-bold uppercase ${preview.errors.length ? 'text-rose-800' : 'text-slate-500'}`}>
                  Com erro
                </div>
              </div>
            </div>

            {preview.errors.length > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs space-y-1.5 max-h-48 overflow-y-auto">
                <div className="font-bold text-rose-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Estas linhas não serão importadas. Corrija na planilha e envie de novo:</span>
                </div>
                {preview.errors.map(err => (
                  <div key={err.line} className="text-rose-700">
                    <strong>Linha {err.line}:</strong> {err.message}
                  </div>
                ))}
              </div>
            )}

            {preview.rows.length > 0 && (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {preview.rows.map(row => (
                  <div key={row.line} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] text-slate-400 w-12 shrink-0">Linha {row.line}</span>
                      <span className="font-bold text-slate-900 truncate">{row.attendee.name}</span>
                      <BadgePill level={getBadgeLevel(row.attendee)} size="sm" />
                    </div>
                    <span
                      className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded border shrink-0 ${
                        row.action === 'create'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-sky-50 text-sky-700 border-sky-200'
                      }`}
                    >
                      {row.action === 'create' ? 'Novo' : 'Atualizar'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleConfirm}
                disabled={preview.rows.length === 0 || status === 'saving'}
                className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-xs py-2.5 px-5 rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                {status === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>
                  {status === 'saving'
                    ? 'Importando...'
                    : `Confirmar importação (${preview.rows.length})`}
                </span>
              </button>
              <button
                onClick={reset}
                disabled={status === 'saving'}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 py-2.5 px-4 rounded-xl border border-slate-200 flex items-center justify-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancelar</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
