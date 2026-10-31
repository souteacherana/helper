import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { LoginPage } from './pages/LoginPage';
import { ClosersPage } from './pages/ClosersPage';
import { RecepcaoPage } from './pages/RecepcaoPage';
import { AdminPage } from './pages/AdminPage';
import { MapPage } from './pages/MapPage';
import { QrSheetPage } from './pages/QrSheetPage';
import { CobrancaPage } from './pages/CobrancaPage';
import { DashboardPage } from './pages/DashboardPage';
import { PublicBadgePage } from './pages/PublicBadgePage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { StatusToast } from './components/StatusToast';

const RootRedirect: React.FC = () => {
  const { userSession, authReady } = useApp();
  if (!authReady) return null;
  if (!userSession.role) {
    return <Navigate to="/login" replace />;
  }
  if (userSession.role === 'ADMIN') {
    return <Navigate to="/admin" replace />;
  }
  return <Navigate to={userSession.role === 'CLOSER' ? '/closers' : '/recepcao'} replace />;
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-slate-200 selection:text-slate-900">
          <Navbar />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<LoginPage />} />
              
              <Route
                path="/closers"
                element={
                  <ProtectedRoute allowedRoles={['CLOSER', 'ADMIN']}>
                    <ClosersPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['CLOSER', 'ADMIN']}>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/mapa"
                element={
                  <ProtectedRoute allowedRoles={['CLOSER', 'ADMIN']}>
                    <MapPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/qrcodes"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <QrSheetPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/cobranca"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <CobrancaPage />
                  </ProtectedRoute>
                }
              />

              {/* Recepção não exige login — acesso direto pela URL */}
              <Route path="/recepcao" element={<RecepcaoPage />} />

              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminPage />
                  </ProtectedRoute>
                }
              />

              {/* Public Badge route - Isolated, no login link or confidential data */}
              <Route path="/badge/:id" element={<PublicBadgePage />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <StatusToast />
        </div>
      </BrowserRouter>
    </AppProvider>
  );
};

export default App;
