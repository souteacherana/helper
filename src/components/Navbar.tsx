import React from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Users, Shield, ShieldCheck, CheckCircle2, Map as MapIcon } from 'lucide-react';
import { getBadgeLevel } from '../types/index';

export const Navbar: React.FC = () => {
  const { userSession, logout, attendees } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  if (location.pathname.startsWith('/badge/')) {
    return null;
  }

  const isTeam = userSession.role === 'CLOSER' || userSession.role === 'ADMIN';
  const navItems = [
    ...(isTeam ? [{ path: '/closers', label: 'Closers', icon: Users }, { path: '/mapa', label: 'Mapa', icon: MapIcon }] : []),
    ...(userSession.role ? [{ path: '/recepcao', label: 'Recepção', icon: Shield }] : []),
    ...(userSession.role === 'ADMIN' ? [{ path: '/admin', label: 'Admin', icon: ShieldCheck }] : [])
  ];

  const presentCount = attendees.filter(a => a.isPresent).length;
  const vipBadgePresent = attendees.filter(a => getBadgeLevel(a) === 'VIP' && a.isPresent).length;
  const vipBadgeTotal = attendees.filter(a => getBadgeLevel(a) === 'VIP').length;
  const sponsorBadgePresent = attendees.filter(a => getBadgeLevel(a) === 'PATROCINADOR' && a.isPresent).length;
  const sponsorBadgeTotal = attendees.filter(a => getBadgeLevel(a) === 'PATROCINADOR').length;

  return (
    <>
      {/* Top Header Bar */}
      <header className="print:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 sm:px-6 py-2 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          {/* Official Logo & Brand */}
          <div className="flex items-center space-x-2.5 cursor-pointer" onClick={() => navigate('/')}>
            <img
              src="/logo-imersao-rise-dark.png"
              alt="Imersão Rise"
              className="h-8 sm:h-9 object-contain"
            />
            <div className="hidden sm:block border-l border-slate-300 pl-2.5">
              <h1 className="text-xs font-black text-slate-900 tracking-tight leading-none">HELPER</h1>
              <p className="text-[11px] text-slate-500 font-medium">Intel de Vendas</p>
            </div>
          </div>

          {navItems.length > 0 && (
            <nav className="hidden md:flex items-center gap-1 text-xs font-bold">
              {navItems.map(item => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                    location.pathname === item.path ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          )}

          {/* Realtime Stats Pills */}
          <div className="flex items-center space-x-2 text-xs">
            <div className="flex items-center space-x-1.5 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 font-medium text-slate-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>
                Presença: <strong className="text-slate-900 font-bold">{presentCount}</strong>
                <span className="text-slate-400">/{attendees.length}</span>
              </span>
            </div>

            <div className="hidden lg:flex items-center space-x-2 text-[11px] text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
              <span>VIPs: <strong className="text-red-800">{vipBadgePresent}/{vipBadgeTotal}</strong></span>
              <span className="text-slate-300">•</span>
              <span>Patrocinador: <strong className="text-teal-800">{sponsorBadgePresent}/{sponsorBadgeTotal}</strong></span>
            </div>

            {userSession.role && (
              <button
                onClick={async () => {
                  await logout();
                  navigate('/login');
                }}
                className="p-2.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200 transition"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      {navItems.length > 0 && (
        <nav className="print:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 px-2 py-2 flex items-center gap-1.5 shadow-lg md:hidden">
          {navItems.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex-1 py-2 rounded-lg flex flex-col items-center justify-center space-y-0.5 text-xs font-bold transition ${
                location.pathname === item.path ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    </>
  );
};
