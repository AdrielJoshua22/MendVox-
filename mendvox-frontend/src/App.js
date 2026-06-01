import React, { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Login from './components/Login';
import MenuPrincipal from './components/MenuPrincipal';
import AudioMender from './components/AudioMender';
import WhatsAppDashboard from './components/WhatsAppDashboard';
import GestorCampana from './components/GestorCampana';
import './App.css';
import AnalyticsDashboard from './components/AnalyticsDashboard';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [vistaActiva, setVistaActiva] = useState('menu');
  const [theme, setTheme] = useState('light');


  useEffect(() => {
    document.body.className = theme === 'dark' ? 'dark-theme' : 'light-theme';
  }, [theme]);

  const obtenerColorAcento = () => {
    switch (vistaActiva) {
      case 'audio': return '#34B7F1';
      case 'whatsapp': return '#00a884';
      case 'campana': return '#f57c00';
      case 'metricas': return '#a855f7';
      default: return '#00a884';
    }
  };

  const alternarTema = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const cerrarSesion = () => {
    setIsLoggedIn(false);
    setVistaActiva('menu');
  };

if (!isLoggedIn) {
    return (
      <>
        <Toaster position="top-center" />
        <Login
          onLogin={() => setIsLoggedIn(true)}
          theme={theme}
          alternarTema={alternarTema}
        />
      </>
    );
  }

  return (
    <div className="container" style={{ '--current-accent': obtenerColorAcento() }}>
      <Toaster position="top-right" />
      <div className="top-control-bar">
        <div className="top-bar-left">
          {vistaActiva !== 'menu' && (
            <button className="nav-control-btn" onClick={() => setVistaActiva('menu')}>
              ← Volver al Menú
            </button>
          )}
        </div>

        <div className="top-bar-right">
          <button className="nav-control-btn theme-toggle" onClick={alternarTema}>
            {theme === 'light' ? '🌙 Modo Oscuro' : '☀️ Modo Claro'}
          </button>
          <button className="nav-control-btn logout-btn" onClick={cerrarSesion}>
            🚪 Salir
          </button>
        </div>
      </div>
      <div className="animate-fade-in" style={{ width: '100%', marginTop: '40px' }}>
        {vistaActiva === 'menu' && <MenuPrincipal setVista={setVistaActiva} />}
        {vistaActiva === 'audio' && <AudioMender />}
        {vistaActiva === 'whatsapp' && <WhatsAppDashboard />}
        {vistaActiva === 'campana' && <GestorCampana />}
        {vistaActiva === 'metricas' && <AnalyticsDashboard />}
      </div>

      <footer className="main-footer" style={{ marginTop: '50px', padding: '30px 0', width: '100%', textAlign: 'center', borderTop: '1px solid var(--border-light)' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>
                MendVox Suite • Security Level: Administrator
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '5px 0 0 0' }}>
                Desarrollado por <span style={{ fontWeight: '600', color: 'var(--text-title)' }}>AdrielJoshua</span>
              </p>
              <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '10px' }}>
                <a href="https://github.com/AdrielJoshua22" target="_blank" rel="noreferrer" style={{ color: 'var(--current-accent)', fontSize: '0.85rem', textDecoration: 'none', fontWeight: '500' }}>GitHub</a>
                <a href="https://linkedin.com/in/joshuaadriel" target="_blank" rel="noreferrer" style={{ color: 'var(--current-accent)', fontSize: '0.85rem', textDecoration: 'none', fontWeight: '500' }}>LinkedIn</a>
              </div>
            </footer>
    </div>
  );
}

export default App;