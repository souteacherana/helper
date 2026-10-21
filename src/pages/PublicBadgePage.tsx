import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { BadgePill } from '../components/BadgePill';
import { Avatar } from '../components/Avatar';
import { Award, CheckCircle2, QrCode, ChevronRight } from 'lucide-react';
import { getBadgeLevel, type Attendee } from '../types/index';
import { supabase } from '../lib/supabase';
import { attendeeFromRow, type AttendeeRow } from '../lib/attendeeMapper';

/**
 * Busca só os dados do crachá (função public_badge no banco): quem escaneia o QR Code
 * não recebe a lista de participantes nem nenhum dado além do que aparece na tela.
 */
function usePublicBadge(id: string | undefined) {
  const { attendees } = useApp();
  const [state, setState] = useState<{ id?: string; attendee: Attendee | null }>({ attendee: null });

  useEffect(() => {
    if (!supabase || !id) return;
    let cancelled = false;
    supabase.rpc('public_badge', { p_id: id }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) console.error('Failed to load badge:', error);
      const row = (data as AttendeeRow[] | null)?.[0];
      setState({ id, attendee: row ? attendeeFromRow(row, []) : null });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Modo demonstração (sem Supabase): usa os dados locais
  if (!supabase) return { loading: false, attendee: attendees.find(a => a.id === id) ?? null };
  return { loading: state.id !== id, attendee: state.attendee };
}

export const PublicBadgePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userSession } = useApp();
  const { loading, attendee } = usePublicBadge(id);
  const isTeam = userSession.role === 'CLOSER' || userSession.role === 'ADMIN';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-sm text-slate-500 font-sans">
        Carregando credencial...
      </div>
    );
  }

  if (!attendee) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center font-sans">
        <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 mb-4 shadow-sm">
          <QrCode className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-1">Crachá não encontrado</h1>
        <p className="text-sm text-slate-500 max-w-sm">
          Este QR Code não consta na lista oficial de participantes da Imersão Rise.
        </p>
      </div>
    );
  }

  const badgeLevel = getBadgeLevel(attendee);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 font-sans">
      {/* Main Digital Badge Card */}
      <div className="w-full max-w-sm">
        <div className="clean-card rounded-3xl p-6 sm:p-8 bg-white border border-slate-200 shadow-md text-center space-y-5 relative">
          {/* Top Hole Visual */}
          <div className="w-12 h-2.5 bg-slate-200 rounded-full mx-auto mb-1 border border-slate-300" />

          {/* Header with Official Event Logo */}
          <div className="border-b border-slate-100 pb-4 text-center">
            <img
              src="/logo-imersao-rise-dark.png"
              alt="Imersão Rise"
              className="h-12 mx-auto object-contain mb-1"
            />
            <span className="text-[11px] font-extrabold tracking-widest text-slate-400 uppercase block">
              Credencial Oficial • Barueri/SP
            </span>
          </div>

          {/* Avatar Photo */}
          <div className="relative inline-block mx-auto">
            <Avatar
              name={attendee.name}
              photoUrl={attendee.photoUrl}
              className="w-32 h-32 rounded-2xl shadow-sm"
              textClassName="text-4xl"
            />
            {attendee.isPresent && (
              <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white p-1 rounded-full shadow-md border-2 border-white">
                <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
              </div>
            )}
          </div>

          {/* Attendee Name & Badge Tier */}
          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight leading-snug">
              {attendee.name}
            </h1>
            <div className="flex justify-center pt-1">
              <BadgePill level={badgeLevel} size="lg" />
            </div>
          </div>

          {/* Footer Seal */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-center space-x-1.5 text-xs text-slate-500">
            <Award className="w-4 h-4 text-slate-400" />
            <span>Participante Verificado de 2026</span>
          </div>

          {/* Closer/admin logado que escaneou o QR: atalho para a ficha de vendas */}
          {isTeam && (
            <button
              onClick={() => navigate(`/closers?focus=${encodeURIComponent(attendee.id)}`)}
              className="w-full py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm flex items-center justify-center gap-1.5"
            >
              <span>Ver ficha de vendas</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="text-center mt-5">
          <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
            Imersão Rise • O Maior Evento para Professores de Idiomas
          </p>
        </div>
      </div>
    </div>
  );
};
