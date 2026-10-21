import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BADGE_COLORS, getBadgeLevel, type BadgeLevel } from '../types/index';
import { isLocalAddress, publicSiteUrl, qrSvg } from '../lib/badgeQr';

const FILTERS: ('ALL' | BadgeLevel)[] = ['ALL', 'VIP', 'SILVER', 'PATROCINADOR'];
const ORDER: Record<BadgeLevel, number> = { PATROCINADOR: 0, VIP: 1, SILVER: 2 };

/** Folha com todos os QR Codes (com nome e crachá) para imprimir ou salvar em PDF. */
export const QrSheetPage: React.FC = () => {
  const navigate = useNavigate();
  const { attendees } = useApp();
  const [filter, setFilter] = useState<'ALL' | BadgeLevel>('ALL');
  const [svgs, setSvgs] = useState<Record<string, string>>({});
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
            {list.length} QR Code(s). Cada um abre <strong>{site}/badge/…</strong>. Na impressão, escolha papel A4 e escala 100%.
          </p>
          {isLocalAddress(site) && (
            <p className="mt-2 text-xs font-bold text-rose-700">
              ⚠️ Estes QR Codes apontam para o seu computador e não vão funcionar nos celulares. Gere a partir do site publicado.
            </p>
          )}
        </div>
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4 print:gap-2">
        {list.map(a => {
          const level = getBadgeLevel(a);
          return (
            <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-2 text-center break-inside-avoid print:rounded-none print:border-slate-300">
              <div className="aspect-square w-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svgs[a.id] ?? '' }} />
              <div className="text-[11px] font-extrabold text-slate-900 leading-tight line-clamp-2">{a.name}</div>
              <div className="text-[10px] font-bold" style={{ color: BADGE_COLORS[level] }}>
                {level}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
