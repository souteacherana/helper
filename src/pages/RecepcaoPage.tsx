import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { BadgePill } from '../components/BadgePill';
import { Avatar } from '../components/Avatar';
import { Search, CheckCircle2, UserCheck, Users } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getBadgeLevel } from '../types/index';
import { formatCheckInTime, matchesQuery } from '../lib/format';
import { currentEventDay, eventDayInfo } from '../lib/eventDays';

export const RecepcaoPage: React.FC = () => {
  const { attendees, toggleCheckIn } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PRESENT' | 'ABSENT'>('ALL');

  const filteredAttendees = useMemo(() => {
    return attendees.filter(item => {
      const matchesSearch = matchesQuery(search, [item.name, item.companionName], item.phone);
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'PRESENT' && item.isPresent) ||
        (statusFilter === 'ABSENT' && !item.isPresent);

      return matchesSearch && matchesStatus;
    });
  }, [attendees, search, statusFilter]);

  const handleCheckInToggle = (id: string, name: string, currentlyPresent: boolean) => {
    // Desfazer presença por toque acidental é fácil na fila — pede confirmação
    if (currentlyPresent && !window.confirm(`Desfazer o check-in de ${name}?`)) return;

    toggleCheckIn(id);
    if (!currentlyPresent) {
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.8 }
      });
    }
  };

  const presentCount = attendees.filter(a => a.isPresent).length;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 pb-24">
      {/* Reception Mobile Banner */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            Recepção & Credenciamento
          </h1>
          <span className="inline-block mt-1.5 text-xs font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-lg bg-slate-900 text-white">
            {eventDayInfo(currentEventDay()).label}
          </span>
          <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
            Entrega de Crachás: VIP (Vermelho Brasa), SILVER (Prateado) e PATROCINADOR (Verde Água)
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl flex items-center justify-between sm:justify-start space-x-3">
          <div className="text-left sm:text-right">
            <div className="text-[11px] uppercase font-bold text-slate-500">Check-ins de hoje</div>
            <div className="text-base sm:text-lg font-black text-emerald-700">
              {presentCount} <span className="text-xs text-slate-400 font-normal">/ {attendees.length}</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
            <UserCheck className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Search Bar & Filter Tabs */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Digite o nome para credenciamento rápido..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 transition shadow-sm"
          />
        </div>

        <div className="flex items-center justify-between text-xs gap-2">
          <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm min-w-0 overflow-x-auto no-scrollbar">
            {(['ALL', 'ABSENT', 'PRESENT'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-3 rounded-lg font-bold transition shrink-0 ${
                  statusFilter === st
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'ALL' ? 'Todos' : st === 'ABSENT' ? 'Pendentes' : 'Confirmados'}
              </button>
            ))}
          </div>

          <span className="text-slate-500 text-xs shrink-0">
            Exibindo <strong className="text-slate-900">{filteredAttendees.length}</strong>
          </span>
        </div>
      </div>

      {/* Reception Mobile List Cards */}
      <div className="space-y-2.5">
        {filteredAttendees.length === 0 && (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-sm text-slate-500">
            Nenhum participante encontrado.
          </div>
        )}

        {filteredAttendees.map(item => {
          const badgeToDeliver = getBadgeLevel(item);

          return (
            <div
              key={item.id}
              className={`clean-card p-3.5 sm:p-4 rounded-2xl bg-white border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                item.isPresent ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200'
              }`}
            >
              {/* Left Info */}
              <div className="flex items-center space-x-3">
                <Avatar name={item.name} photoUrl={item.photoUrl} />
                <div className="space-y-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <h2 className="text-sm font-extrabold text-slate-900 leading-tight line-clamp-2 break-words">{item.name}</h2>
                    <BadgePill level={badgeToDeliver} size="sm" />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span
                      className={`font-bold text-xs px-2 py-0.5 rounded border uppercase ${
                        badgeToDeliver === 'PATROCINADOR'
                          ? 'bg-teal-50 text-teal-800 border-teal-300'
                          : badgeToDeliver === 'VIP'
                          ? 'bg-red-50 text-red-800 border-red-300'
                          : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                    >
                      Entregar Crachá: {badgeToDeliver}
                    </span>

                    {item.isAccompanied && (
                      <span className="font-bold text-[11px] px-2 py-0.5 rounded border bg-pink-50 text-pink-700 border-pink-200 inline-flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        + Acompanhante{item.companionName ? `: ${item.companionName}` : ''}
                        {item.accompaniedBy ? ` (${item.accompaniedBy})` : ''}
                      </span>
                    )}

                    {item.isPresent && (
                      <span className="text-emerald-700 font-bold text-xs">
                        • Presença às {formatCheckInTime(item.checkInTime) || 'Agora'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Touch-Friendly Check-in Button */}
              <button
                onClick={() => handleCheckInToggle(item.id, item.name, item.isPresent)}
                className={`w-full sm:w-auto px-4 py-3 rounded-xl font-extrabold text-xs flex items-center justify-center space-x-2 transition shadow-sm min-h-[44px] ${
                  item.isPresent
                    ? 'bg-slate-100 hover:bg-rose-50 text-emerald-700 border border-slate-200'
                    : 'bg-slate-900 hover:bg-slate-800 text-white'
                }`}
              >
                {item.isPresent ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Presença Confirmada</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>Confirmar Presença</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
