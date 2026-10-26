import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BADGE_COLORS, getBadgeLevel, type BadgeLevel } from '../types/index';
import { isLocalAddress, publicSiteUrl, qrSvg } from '../lib/badgeQr';

const FILTERS: ('ALL' | BadgeLevel)[] = ['ALL', 'VIP', 'SILVER', 'PATROCINADOR'];
const ORDER: Record<BadgeLevel, number> = { PATROCINADOR: 0, VIP: 1, SILVER: 2 };

/**
 * Etiqueta Colacril CA4164 (A4, 12 por folha: 3 colunas x 4 linhas de 63,5 x 72 mm), medidas do
 * fabricante: borda esquerda/direita 7,25 mm, entre colunas 2,5 mm, sem espaço entre linhas,
 * borda de cima/baixo 5 mm (a altura útil fica 71,75 mm para caber na folha).
 */
const SHEET = { cols: 3, rows: 4, labelW: 63.5, labelH: 71.75, left: 7.25, top: 5, gapX: 2.5 };
const PER_SHEET = SHEET.cols * SHEET.rows;

/** Folha com todos os QR Codes (com nome e crachá) no modelo de etiqueta, para imprimir ou salvar em PDF. */
export const QrSheetPage: React.FC = () => {
  const navigate = useNavigate();
  const { attendees } = useApp();
  const [filter, setFilter] = useState<'ALL' | BadgeLevel>('ALL');
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  /** Para aproveitar uma folha já usada: a primeira etiqueta livre (1 a 12) */
  const [startAt, setStartAt] = useState(1);
  const site = publicSiteUrl();

  const list = useMemo(
    () =>
      attendees
        .filter(a => filter === 'ALL' || getBadgeLevel(a) === filter)
        .sort((a, b) => ORDER[getBadgeLevel(a)] - ORDER[getBadgeLevel(b)] || a.name.localeCompare(b.name, 'pt-BR')),
    [attendees, filter]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const missing = list.filter(a => !svgs[a.id]);
      if (!missing.length) return;
      const generated: Record<string, string> = {};
      for (const a of missing) generated[a.id] = await qrSvg(a.id);
      if (!cancelled) setSvgs(prev => ({ ...prev, ...generated }));
    })();
    return () => {
      cancelled = true;
    };
  }, [list, svgs]);

  const ready = list.every(a => svgs[a.id]);

  // Posições vazias no começo da 1ª folha + as pessoas, em folhas de 12
  const slots = [...Array(startAt - 1).fill(null), ...list] as (typeof list[number] | null)[];
  const sheets: (typeof list[number] | null)[][] = [];
  for (let i = 0; i < slots.length; i += PER_SHEET) sheets.push(slots.slice(i, i + PER_SHEET));

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 pb-24 print:p-0 print:max-w-none">
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 print:hidden">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => navigate('/admin')} className="text-xs font-bold text-slate-600 flex items-center gap-1 py-2">
            <ArrowLeft className="w-4 h-4" /> Voltar ao Admin
          </button>
          <button
            onClick={() => window.print()}
            disabled={!ready}
            className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>{ready ? 'Imprimir / salvar PDF' : 'Gerando QR Codes...'}</span>
          </button>
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">QR Codes dos crachás</h1>
          <p className="text-xs text-slate-500">
            {list.length} QR Code(s) em {sheets.length} folha(s) de etiqueta <strong>Colacril CA4164</strong> (12 por folha). Cada um abre{' '}
            <strong>{site}/badge/…</strong>. Na impressão: papel A4, escala <strong>100% / tamanho real</strong> e margens <strong>nenhuma</strong>.
          </p>
          {isLocalAddress(site) && (
            <p className="mt-2 text-xs font-bold text-rose-700">
              ⚠️ Estes QR Codes apontam para o seu computador e não vão funcionar nos celulares. Gere a partir do site publicado.
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          Começar na etiqueta nº
          <input
            type="number"
            min={1}
            max={PER_SHEET}
            value={startAt}
            onChange={e => setStartAt(Math.min(PER_SHEET, Math.max(1, Number(e.target.value) || 1)))}
            className="w-16 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-900"
          />
          <span className="font-normal text-slate-500">(para aproveitar uma folha já começada; conta da esquerda para a direita)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold ${filter === f ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
            >
              {f === 'ALL' ? 'Todos' : f}
            </button>
          ))}
        </div>
      </div>

      <style>{'@page { size: A4; margin: 0; }'}</style>
      <div className="overflow-x-auto print:overflow-visible">
        {sheets.map((sheet, si) => (
          <div
            key={si}
            className="relative bg-white mx-auto mb-6 shadow-md print:shadow-none print:mb-0 print:break-after-page"
            style={{ width: '210mm', height: '297mm' }}
          >
            {sheet.map((a, i) => {
              const col = i % SHEET.cols;
              const row = Math.floor(i / SHEET.cols);
              const style: React.CSSProperties = {
                left: `${SHEET.left + col * (SHEET.labelW + SHEET.gapX)}mm`,
                top: `${SHEET.top + row * SHEET.labelH}mm`,
                width: `${SHEET.labelW}mm`,
                height: `${SHEET.labelH}mm`
              };
              if (!a) return <div key={i} className="absolute border border-dashed border-slate-200 print:border-0" style={style} />;
              const level = getBadgeLevel(a);
              return (
                <div
                  key={a.id}
                  className="absolute flex flex-col items-center justify-center text-center border border-dashed border-slate-300 print:border-0"
                  style={{ ...style, padding: '3mm' }}
                >
                  <div className="[&>svg]:w-full [&>svg]:h-full" style={{ width: '50mm', height: '50mm' }} dangerouslySetInnerHTML={{ __html: svgs[a.id] ?? '' }} />
                  <div className="font-extrabold text-slate-900 leading-tight line-clamp-2" style={{ fontSize: '9pt', marginTop: '1mm' }}>
                    {a.name}
                  </div>
                  <div className="font-bold" style={{ fontSize: '7pt', color: BADGE_COLORS[level] }}>
                    {level}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
