import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, WifiOff, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

const BUNDLE = /\/assets\/index-[^"']+\.js/;

/**
 * Saiu um deploy novo desde que a página abriu? Compara o script desta página com o do site
 * (a cada minuto e ao voltar para a aba). No npm run dev não há bundle e nada é conferido.
 */
function useNewVersion(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const running = document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]')?.getAttribute('src')?.match(BUNDLE)?.[0];
    if (!running) return;
    const check = async () => {
      try {
        const html = await (await fetch('/', { cache: 'no-store' })).text();
        const latest = html.match(BUNDLE)?.[0];
        if (latest && latest !== running) setAvailable(true);
      } catch {
        // Sem internet: confere de novo na próxima vez
      }
    };
    const timer = window.setInterval(check, 60_000);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return available;
}

/** Avisos globais: versão nova no ar, falha ao salvar no Supabase e modo offline (exibindo dados em cache). */
export const StatusToast: React.FC = () => {
  const { errorMessage, dismissError, syncStatus } = useApp();
  const newVersion = useNewVersion();

  return (
    <div className="print:hidden fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md space-y-2 pointer-events-none">
      {newVersion && (
        <div role="status" className="pointer-events-auto p-3 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-lg flex items-center gap-2">
          <RefreshCw className="w-4 h-4 shrink-0" />
          <span className="flex-1">Saiu uma versão nova do HELPER.</span>
          <button type="button" onClick={() => window.location.reload()} className="px-3 py-1.5 rounded-lg bg-white text-slate-900 font-bold">
            Atualizar
          </button>
        </div>
      )}

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
