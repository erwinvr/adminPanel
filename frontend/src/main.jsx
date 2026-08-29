import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ConfirmProvider } from './context/ConfirmContext.jsx';
import { Toaster } from '@/components/ui/sonner.jsx';
import { App } from './App.jsx';
import './styles/main.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
        <Toaster position="bottom-right" />
      </AuthProvider>
    </HashRouter>
  </StrictMode>
);
