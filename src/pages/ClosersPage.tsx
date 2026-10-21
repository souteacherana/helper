import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { BadgePill } from '../components/BadgePill';
import { Avatar } from '../components/Avatar';
import {
  Search,
  CheckCircle2,
  MessageCircle,
  UserCheck,
  RotateCw,
  ChevronDown,
  ChevronUp,
  Send,
  Sparkles,
  Phone,
  ExternalLink,
  BookOpen,
  Users,
  GraduationCap,
  CreditCard,
  Gift
} from 'lucide-react';
import type { BadgeLevel } from '../types/index';
import { getBadgeLevel } from '../types/index';
import { buildWhatsAppUrl, formatCheckInTime, formatDateBR, matchesQuery } from '../lib/format';
import { EVENT_DAYS, currentEventDay } from '../lib/eventDays';

const InstagramIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
  </svg>
);

export const ClosersPage: React.FC = () => {
  const { attendees, addCloserNote, userSession } = useApp();

  const [search, setSearch] = useState('');
  const [badgeFilter, setBadgeFilter] = useState<'ALL' | BadgeLevel>('ALL');
  const [presentOnly, setPresentOnly] = useState(false);
  const [menteeOnly, setMenteeOnly] = useState(false);
  const [nonMenteeVipOnly, setNonMenteeVipOnly] = useState(false);
  const [renewalOnly, setRenewalOnly] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Vindo do mapa ("Ver intel"): busca a pessoa e abre a ficha dela
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  useEffect(() => {
    if (!focusId) return;
    const target = attendees.find(a => a.id === focusId);
    if (!target) return;
    setSearch(target.name);
    setExpandedId(target.id);
    setSearchParams({}, { replace: true });
  }, [focusId, attendees, setSearchParams]);
  const [newNoteText, setNewNoteText] = useState<{ [key: string]: string }>({});

  const filteredAttendees = useMemo(() => {
    return attendees.filter(item => {
      const matchesSearch = matchesQuery(
        search,
        [item.name, item.instagram, item.currentMentorship, item.offerToMake, item.companionName],
        item.phone
      );

      const calculatedBadge = getBadgeLevel(item);
      const matchesBadge = badgeFilter === 'ALL' || calculatedBadge === badgeFilter;
      const matchesPresent = !presentOnly || item.isPresent;
      const matchesMentee = !menteeOnly || item.isMentee;
      const matchesNonMenteeVip = !nonMenteeVipOnly || (item.level === 'VIP' && !item.isMentee);
      const matchesRenewal = !renewalOnly || item.nearRenewal;

      return (
        matchesSearch &&
        matchesBadge &&
        matchesPresent &&
        matchesMentee &&
        matchesNonMenteeVip &&
        matchesRenewal
      );
    });
  }, [attendees, search, badgeFilter, presentOnly, menteeOnly, nonMenteeVipOnly, renewalOnly]);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const handleAddNote = (id: string, e: React.FormEvent) => {
    e.preventDefault();
    const text = newNoteText[id]?.trim();
    if (!text) return;

    addCloserNote(id, text, userSession.userName || 'Closer');
    setNewNoteText(prev => ({ ...prev, [id]: '' }));
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 pb-24">
      {/* Mobile Page Header Banner */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            Inteligência de Vendas • Closers
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Informações estratégicas escritas pela Teacher Ana de Araújo
          </p>
        </div>

        <div className="text-xs text-slate-600 font-medium bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 self-start sm:self-auto">
          Exibindo <strong className="text-slate-900 font-bold">{filteredAttendees.length}</strong> de {attendees.length}
        </div>
      </div>

      {/* Search & Swipeable Filter Controls Bar */}
      <div className="space-y-2.5">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone, instagram..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-xl pl-10 pr-10 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900 transition shadow-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2.5 text-xs text-slate-400 hover:text-slate-700"
            >
              ✕
            </button>
          )}
        </div>

        {/* Horizontally Scrollable Badge Filter Tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
          {(['ALL', 'VIP', 'SILVER', 'PATROCINADOR'] as const).map(lvl => (
            <button
              key={lvl}
              onClick={() => setBadgeFilter(lvl)}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition shrink-0 ${
                badgeFilter === lvl
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {lvl === 'ALL' ? 'Todos Crachás' : `Crachá ${lvl}`}
            </button>
          ))}
        </div>

        {/* Quick Toggles */}
        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-0.5 text-xs">
          <button
            onClick={() => setNonMenteeVipOnly(!nonMenteeVipOnly)}
            className={`px-3 py-2.5 rounded-lg border flex items-center space-x-1.5 shrink-0 transition font-bold ${
              nonMenteeVipOnly
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-white text-slate-700 border-slate-200'
            }`}
            title="VIPs que ainda não são mentorados (Alvos para fechamento no Pitch)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>🔥 VIPs Não-Mentorados</span>
          </button>

          <button
            onClick={() => setPresentOnly(!presentOnly)}
            className={`px-3 py-2.5 rounded-lg border flex items-center space-x-1.5 shrink-0 transition font-medium ${
              presentOnly
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Presentes</span>
          </button>

          <button
            onClick={() => setMenteeOnly(!menteeOnly)}
            className={`px-3 py-2.5 rounded-lg border flex items-center space-x-1.5 shrink-0 transition font-medium ${
              menteeOnly
                ? 'bg-indigo-50 text-indigo-800 border-indigo-300 font-bold'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>Já Mentorados</span>
          </button>

          <button
            onClick={() => setRenewalOnly(!renewalOnly)}
            className={`px-3 py-2.5 rounded-lg border flex items-center space-x-1.5 shrink-0 transition font-medium ${
              renewalOnly
                ? 'bg-rose-50 text-rose-800 border-rose-300 font-bold'
                : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5 text-rose-600" />
            <span>Renovação Próxima</span>
          </button>

          {(presentOnly || menteeOnly || nonMenteeVipOnly || renewalOnly || badgeFilter !== 'ALL' || search) && (
            <button
              onClick={() => {
                setPresentOnly(false);
                setMenteeOnly(false);
                setNonMenteeVipOnly(false);
                setRenewalOnly(false);
                setBadgeFilter('ALL');
                setSearch('');
              }}
              className="text-xs text-rose-600 hover:underline px-2 py-2.5 shrink-0 font-medium"
            >
              Resetar
            </button>
          )}
        </div>
      </div>

      {/* Attendees List */}
      {filteredAttendees.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-2">
          <p className="text-slate-500 text-sm">Nenhum participante encontrado com os filtros selecionados.</p>
          <button
            onClick={() => {
              setSearch('');
              setBadgeFilter('ALL');
              setPresentOnly(false);
              setMenteeOnly(false);
              setNonMenteeVipOnly(false);
              setRenewalOnly(false);
            }}
            className="text-xs text-slate-900 font-bold underline"
          >
            Limpar todos os filtros
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAttendees.map(item => {
            const isExpanded = expandedId === item.id;
            const calculatedBadge = getBadgeLevel(item);
            const whatsappUrl = buildWhatsAppUrl(
              item.phone,
              `Olá ${item.name.split(' ')[0]}! Tudo bem? Sou da equipe da Teacher Ana de Araújo na Imersão Rise...`
            );

            return (
              <div
                key={item.id}
                className={`clean-card rounded-2xl bg-white border transition-all ${
                  isExpanded ? 'border-slate-400 shadow-md ring-1 ring-slate-200' : 'border-slate-200'
                }`}
              >
                {/* Mobile Card Summary */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start space-x-3 min-w-0">
                      <div className="relative shrink-0">
                        <Avatar name={item.name} photoUrl={item.photoUrl} />
                        <span
                          className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${
                            item.isPresent ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        />
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-start gap-1.5">
                          <h2 className="text-sm font-extrabold text-slate-900 leading-tight line-clamp-2 break-words">{item.name}</h2>
                          <span className="shrink-0">
                            <BadgePill level={calculatedBadge} size="sm" />
                          </span>
                        </div>

                        <div className="flex items-center space-x-2 text-xs">
                          {item.isPresent ? (
                            <span className="text-xs font-bold text-emerald-700">
                              Presente hoje {item.checkInTime && `(${formatCheckInTime(item.checkInTime)})`}
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-slate-400">Ausente</span>
                          )}
                          <span className="text-slate-300">•</span>
                          <span className="text-xs font-semibold text-slate-500">Ingresso: {item.level}</span>
                        </div>
                      </div>
                    </div>

                    {whatsappUrl && (
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center space-x-1 shrink-0 transition"
                        title="Chamar no WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4 text-emerald-600" />
                        <span className="hidden sm:inline">WhatsApp</span>
                      </a>
                    )}
                  </div>

                  {/* Context Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs pt-0.5">
                    {item.nearRenewal && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 flex items-center space-x-1">
                        <RotateCw className="w-3 h-3 text-rose-600" />
                        <span>Renovação Próxima</span>
                      </span>
                    )}

                    {item.isAccompanied && (
                      <span
                        className="text-[11px] font-bold px-2 py-0.5 rounded bg-pink-50 text-pink-700 border border-pink-200"
                        title={item.companionName ? `Acompanhante: ${item.companionName}` : undefined}
                      >
                        Acompanhado{item.accompaniedBy ? ` (${item.accompaniedBy})` : ''}
                      </span>
                    )}
                  </div>

                  {/* Offer Teaser */}
                  {(item.offerToMake || item.currentMentorship) && (
                    <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-slate-800 flex items-start space-x-2">
                      <Gift className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        {item.currentMentorship && (
                          <div>
                            <strong className="text-slate-900 font-bold mr-1">Mentoria atual:</strong>
                            <span>{item.currentMentorship} ({item.cycle})</span>
                          </div>
                        )}
                        {item.offerToMake && (
                          <div>
                            <strong className="text-slate-900 font-bold mr-1">Oferta a fazer:</strong>
                            <span>{item.offerToMake}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Expand Drawer Button */}
                  <button
                    onClick={() => toggleExpand(item.id)}
                    className={`w-full py-3 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition ${
                      isExpanded
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                    }`}
                  >
                    <span>{isExpanded ? 'Recolher Detalhes' : 'Ver Intel Completa'}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {/* Cascata Expanded Detail Drawer */}
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50 p-4 sm:p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      <div className="p-3 rounded-xl bg-white border border-slate-200">
                        <div className="text-slate-400 font-medium flex items-center space-x-1 mb-0.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>Telefone</span>
                        </div>
                        <div className="text-slate-900 font-bold">{item.phone || '—'}</div>
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-slate-200">
                        <div className="text-slate-400 font-medium flex items-center space-x-1 mb-0.5">
                          <InstagramIcon className="w-3.5 h-3.5 text-pink-600" />
                          <span>Instagram</span>
                        </div>
                        {item.instagram ? (
                          <a
                            href={`https://instagram.com/${item.instagram.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-pink-600 font-bold hover:underline flex items-center space-x-1"
                          >
                            <span>{item.instagram}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <div className="text-slate-900 font-bold">—</div>
                        )}
                      </div>
                    </div>

                    {/* Presença nos dois dias do evento */}
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      {EVENT_DAYS.map(d => {
                        const time = d.day === 1 ? item.checkIns?.day1 : item.checkIns?.day2;
                        const isToday = d.day === currentEventDay();
                        return (
                          <div
                            key={d.day}
                            className={`p-3 rounded-xl border ${time ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}
                          >
                            <div className="text-slate-500 font-medium">
                              {d.short}
                              {isToday && <span className="ml-1 font-bold text-slate-900">(hoje)</span>}
                            </div>
                            <div className={`font-bold ${time ? 'text-emerald-700' : 'text-slate-400'}`}>
                              {time ? `Presente às ${formatCheckInTime(time)}` : 'Não registrou presença'}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Acompanhante */}
                    <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-1">
                      <div className="text-slate-400 font-medium flex items-center space-x-1 mb-0.5">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>Acompanhante</span>
                      </div>
                      {item.isAccompanied ? (
                        <div className="text-slate-900 font-bold">
                          {item.companionName || 'Nome não informado'}{' '}
                          {item.accompaniedBy && (
                            <span className="text-slate-500 font-medium">({item.accompaniedBy})</span>
                          )}
                        </div>
                      ) : (
                        <div className="text-slate-500 font-medium">Não está acompanhado</div>
                      )}
                    </div>

                    {/* Mentoria & Pagamento */}
                    {(item.currentMentorship || item.isPaying || item.mentorshipValue || item.amountPaid || item.creditBalance) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                        <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                          <div className="text-slate-400 font-medium flex items-center space-x-1 mb-0.5">
                            <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                            <span>Mentoria Atual</span>
                          </div>
                          <div className="text-slate-900 font-bold">{item.currentMentorship || '—'}</div>
                          {item.cycle && <div className="text-slate-600">{item.cycle}</div>}
                          {item.cycleEndDate && (
                            <div className="text-slate-500">Finaliza em: {formatDateBR(item.cycleEndDate)}</div>
                          )}
                          {item.mentorshipRemaining && (
                            <div className="text-slate-500">Sobrando: {item.mentorshipRemaining}</div>
                          )}
                        </div>

                        <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                          <div className="text-slate-400 font-medium flex items-center space-x-1 mb-0.5">
                            <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                            <span>Pagamento</span>
                          </div>
                          <div className="text-slate-900 font-bold">
                            {item.isPaying ? 'Ainda pagando' : 'Quitado / Não se aplica'}
                          </div>
                          {item.isPaying && (
                            <>
                              {item.paymentMethod && <div className="text-slate-600">{item.paymentMethod}</div>}
                              {item.installmentValue && (
                                <div className="text-slate-600">
                                  {item.installmentValue}
                                  {item.remainingInstallments != null &&
                                    ` • ${item.remainingInstallments} parcela(s) restante(s)`}
                                </div>
                              )}
                            </>
                          )}
                          {item.mentorshipValue && (
                            <div className="text-slate-600">Valor da mentoria: {item.mentorshipValue}</div>
                          )}
                          {item.amountPaid && (
                            <div className="text-slate-600">Valor pago: {item.amountPaid}</div>
                          )}
                          {item.creditBalance && (
                            <div className="text-emerald-700 font-bold">Em haver: {item.creditBalance}</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Oferta */}
                    {(item.offerToMake || item.specialCondition) && (
                      <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-1">
                        <div className="text-slate-400 font-medium flex items-center space-x-1 mb-0.5">
                          <Gift className="w-3.5 h-3.5 text-slate-400" />
                          <span>Oferta a ser feita</span>
                        </div>
                        <div className="text-slate-900 font-bold">{item.offerToMake || '—'}</div>
                        {item.specialCondition && (
                          <div className="text-slate-600">Condição especial: {item.specialCondition}</div>
                        )}
                      </div>
                    )}

                    {/* Closer Notes Section */}
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                        <span>Histórico de Abordagens</span>
                      </h3>

                      <form onSubmit={e => handleAddNote(item.id, e)} className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          placeholder="Registrar anotação de abordagem..."
                          value={newNoteText[item.id] || ''}
                          onChange={e => setNewNoteText({ ...newNoteText, [item.id]: e.target.value })}
                          className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                        />
                        <button
                          type="submit"
                          className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center space-x-1 shadow-sm transition min-h-[40px]"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Salvar</span>
                        </button>
                      </form>

                      {item.closerNotes && item.closerNotes.length > 0 ? (
                        <div className="space-y-2 pt-1">
                          {item.closerNotes.map(note => (
                            <div key={note.id} className="p-3 rounded-xl bg-white border border-slate-200 text-xs flex justify-between gap-2">
                              <div>
                                <span className="font-bold text-slate-900">{note.closerName}: </span>
                                <span className="text-slate-700">{note.text}</span>
                              </div>
                              <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">{note.date}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">Nenhuma anotação registrada pelos closers até o momento.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
