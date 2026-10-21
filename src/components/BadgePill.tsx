import React from 'react';
import type { BadgeLevel } from '../types/index';

interface BadgePillProps {
  level: BadgeLevel;
  size?: 'sm' | 'md' | 'lg';
}

export const BadgePill: React.FC<BadgePillProps> = ({ level, size = 'md' }) => {
  let badgeStyles = '';

  switch (level) {
    case 'VIP':
      // Vermelho brasa
      badgeStyles = 'bg-red-50 text-red-800 border-red-300 font-bold';
      break;
    case 'PATROCINADOR':
      // Verde água / teal
      badgeStyles = 'bg-teal-50 text-teal-800 border-teal-300 font-bold';
      break;
    case 'SILVER':
    default:
      // Prateado
      badgeStyles = 'bg-slate-100 text-slate-700 border-slate-300 font-semibold';
      break;
  }

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-0.5',
    lg: 'text-sm px-3.5 py-1 font-bold'
  }[size];

  return (
    <span
      className={`inline-flex items-center justify-center rounded-md border tracking-wide uppercase transition-colors ${badgeStyles} ${sizeStyles}`}
    >
      {level}
    </span>
  );
};
