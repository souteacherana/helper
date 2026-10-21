import React, { useState } from 'react';
import { getInitials } from '../lib/format';

interface AvatarProps {
  name: string;
  photoUrl?: string;
  className?: string;
  textClassName?: string;
}

/** Foto do participante; sem foto (ou se a imagem falhar) mostra as iniciais do nome. */
export const Avatar: React.FC<AvatarProps> = ({ name, photoUrl, className = 'w-12 h-12 rounded-xl', textClassName = 'text-sm' }) => {
  const [failed, setFailed] = useState(false);

  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        onError={() => setFailed(true)}
        className={`${className} object-cover border border-slate-200 shrink-0`}
      />
    );
  }

  return (
    <div
      aria-label={name}
      className={`${className} bg-slate-200 text-slate-600 border border-slate-200 font-extrabold flex items-center justify-center shrink-0 ${textClassName}`}
    >
      {getInitials(name)}
    </div>
  );
};
