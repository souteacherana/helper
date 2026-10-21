import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Download, Loader2, Printer, QrCode } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { buildQrZip, downloadBlob, isLocalAddress, publicSiteUrl } from '../lib/badgeQr';

/** Admin: QR Codes de todos os crachás (ZIP de imagens ou folha para imprimir). */
export const QrCodesPanel: React.FC = () => {
  const navigate = useNavigate();
  const { attendees } = useApp();
  const [progress, setProgress] = useState<number | null>(null);
  const site = publicSiteUrl();
  const local = isLocalAddress(site);

  const downloadAll = async () => {
    if (local && !window.confirm('Você está no endereço local: estes QR Codes NÃO vão funcionar nos celulares. Baixar mesmo assim (só para teste)?')) return;
    setProgress(0);
    try {
      const zip = await buildQrZip(attendees, setProgress);
      downloadBlob(zip, 'qrcodes-cracha-imersao-rise.zip');
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-slate-200">
        <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
          <QrCode className="w-4 h-4 text-slate-500" />
          <span>QR Codes dos crachás</span>
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Cada QR abre o crachá digital da pessoa. Se um closer logado escanear, abre a ficha de vendas dela.
          Para um QR só, use o botão de QR na lista de participantes abaixo.
        </p>
      </div>
      <div className="p-4 sm:p-5 space-y-3">
        <div className="text-xs text-slate-600">
          Endereço nos QR Codes: <strong className="text-slate-900 break-all">{site}/badge/…</strong>
        </div>
        {local && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Você está no endereço local (este computador). Gere os QR Codes para imprimir a partir do <strong>site publicado</strong>;
              os daqui não abrem nos celulares.
            </span>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={downloadAll}
            disabled={progress !== null || attendees.length === 0}
            className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5"
          >
            {progress !== null ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>
              {progress !== null ? `Gerando ${progress}/${attendees.length}...` : `Baixar todos (${attendees.length}) em ZIP`}
            </span>
          </button>
          <button
            onClick={() => navigate('/qrcodes')}
            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Folha para imprimir</span>
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          O ZIP tem uma pasta por crachá (VIP, SILVER, PATROCINADOR) e cada imagem traz o nome embaixo do QR, para saber
          onde colar. Importante: não exclua e recadastre alguém depois de imprimir, porque o QR antigo deixa de funcionar.
        </p>
      </div>
    </div>
  );
};
