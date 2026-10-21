import React from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import type { UserRole } from '../types/index';

type LoggedRole = Exclude<UserRole, null>;

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: LoggedRole[];
}

const HOME_BY_ROLE: Record<LoggedRole, string> = {
  CLOSER: '/closers',
  RECEPCAO: '/recepcao',
  ADMIN: '/admin'
};

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { userSession, authReady } = useApp();

  // Ainda restaurando a sessão salva (F5 / reabrir o app): não manda para o login à toa
  if (!authReady) return null;

  if (!userSession.role) {
    return <Navigate to="/login" replace />;
  }

  // Role sem permissão para esta rota volta para a página inicial dela
  if (allowedRoles && !allowedRoles.includes(userSession.role)) {
    return <Navigate to={HOME_BY_ROLE[userSession.role]} replace />;
  }

  return <>{children}</>;
};
