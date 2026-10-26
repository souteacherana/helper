import React, { useEffect } from 'react';
import { Compass, Gauge, MessageSquareText, X } from 'lucide-react';
import type { Attendee } from '../types/index';
import { getBadgeLevel } from '../types/index';
import { BadgePill } from './BadgePill';
import { ANSWER_GROUPS, DISC_INFO, READINESS_INFO, READINESS_STYLE, levelStyle, type Icp } from '../lib/icp';

interface IcpSheetProps {
  attendee: Attendee;
  icp: Icp;
  onClose: () => void;
}

/** Classificação da pessoa (ICP, prontidão, perfil DISC) e as respostas do formulário. */
export const IcpSheet: React.FC<IcpSheetProps> = ({ attendee, icp, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label={`ICP de ${attendee.name}`}>
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" />
      <div className="relative w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="md:hidden mx-auto mt-2.5 w-10 h-1.5 rounded-full bg-slate-200" />
        <header className="px-5 pt-3 pb-3 md:pt-5 flex items-start justify-between gap-3 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Classificação</p>
            <h2 className="text-base font-extrabold text-slate-900 truncate">{attendee.name}</h2>
            <div className="mt-1">
              <BadgePill level={getBadgeLevel(attendee)} size="sm" />
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2.5 -mr-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div className={`rounded-2xl border p-4 ${levelStyle(icp.level)}`}>
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">ICP {icp.level ?? '—'}</p>
            <p className="text-lg font-extrabold">{icp.profile || 'Sem classificação'}</p>
            {icp.direction && (
              <p className="text-sm font-semibold flex items-center gap-1.5 mt-0.5">
                <Compass className="w-4 h-4" /> Direção: {icp.direction}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {icp.readiness && (
              <div className="rounded-xl border border-slate-200 p-3 space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <Gauge className="w-3.5 h-3.5" /> Prontidão
                </p>
                <span className={`inline-flex text-sm font-extrabold px-2.5 py-0.5 rounded-md border ${READINESS_STYLE[icp.readiness]}`}>{icp.readiness}</span>
                <p className="text-xs text-slate-600">{READINESS_INFO[icp.readiness]}</p>
              </div>
            )}
            {icp.disc && (
              <div className="rounded-xl border border-slate-200 p-3 space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <MessageSquareText className="w-3.5 h-3.5" /> Perfil DISC
                </p>
                <p className="text-sm font-extrabold text-slate-900">{icp.disc}</p>
                {DISC_INFO[icp.disc] && <p className="text-xs text-slate-600">{DISC_INFO[icp.disc]}</p>}
              </div>
            )}
          </div>

          {ANSWER_GROUPS.map(group => {
            const items = group.keys.filter(k => icp.answers[k]?.trim());
            if (!items.length) return null;
            return (
              <section key={group.title} className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{group.title}</h3>
                <dl className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {items.map(k => (
                    <div key={k} className="px-3 py-2.5">
                      <dt className="text-[11px] font-bold text-slate-500">{k}</dt>
                      <dd className="text-sm text-slate-900">{icp.answers[k]}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
