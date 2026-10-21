import React from 'react';
import { AlertTriangle, WifiOff, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

/** Avisos globais: falha ao salvar no Supabase e modo offline (exibindo dados em cache). */
export const StatusToast: React.FC = () => {
  const { errorMessage, dismissError, syncStatus } = useApp();

  return (
    <div className="print:hidden fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md space-y-2 pointer-events-none">
      {syncStatus === 'offline' && (
        <div className="pointer-events-auto p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold shadow-lg flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Sem conexão com o banco. Exibindo os últimos dados salvos neste aparelho.</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="pointer-events-auto p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold shadow-lg flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{errorMessage}</span>
          <button onClick={dismissError} className="p-0.5 rounded hover:bg-rose-100" title="Fechar">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
