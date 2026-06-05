/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { ToastProvider, useToast } from './components/Toast';
import AuthCard from './components/AuthCard';
import Dashboard from './components/Dashboard';
import LogsViewer from './components/LogsViewer';
import { UserSession } from './types';
import { logger } from './lib/logger';

function AppContent() {
  const [session, setSession] = useState<UserSession | null>(null);
  const { showToast } = useToast();

  // Load and verify security session on mount
  useEffect(() => {
    logger.info('Verifying secure session tokens from local persistence...', 'Session');
    const email = localStorage.getItem('watt_email');
    const username = localStorage.getItem('watt_username');

    if (email && username) {
      setSession({ email, username });
      logger.success(`Verified active session found for: ${username} (${email})`, 'Session');
    } else {
      logger.info('No active profile session. Defaulting to Secure Authentication screen.', 'Session');
    }
  }, []);

  const handleAuthSuccess = (email: string, username: string) => {
    localStorage.setItem('watt_email', email);
    localStorage.setItem('watt_username', username);
    setSession({ email, username });
    logger.success(`User logged in and session stored: ${username}`, 'Session');
  };

  const handleLogout = () => {
    if (session) {
      logger.info(`User logged out: ${session.username}`, 'Session');
    }
    localStorage.removeItem('watt_email');
    localStorage.removeItem('watt_username');
    setSession(null);
    showToast('Güvenli çıkış yapıldı.', 'info');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {session ? (
        <Dashboard session={session} onLogout={handleLogout} />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-slate-950 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 min-h-screen relative overflow-hidden">
          {/* Ambient lighting effect */}
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-emerald-600/5 rounded-full blur-[120px] pointer-events-none select-none" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none select-none" />

          <AuthCard onAuthSuccess={handleAuthSuccess} />
        </div>
      )}

      {/* Embedded application logging stream for real-time debugging */}
      <LogsViewer />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
