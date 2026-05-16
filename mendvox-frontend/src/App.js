import React, { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Login from './components/Login';
import MenuPrincipal from './components/MenuPrincipal';
import AudioMender from './components/AudioMender';
import WhatsAppDashboard from './components/WhatsAppDashboard';
import GestorCampana from './components/GestorCampana';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [vistaActiva, setVistaActiva] = useState('menu'); // 'menu', 'audio', 'whatsapp', 'campana'
  const [theme, setTheme] = useState('light'); // 'light' o 'dark'

  // Sincronizamos la clase del body con el tema seleccionado
  useEffect(() => {
    document.body.className = theme === 'dark' ? 'dark-theme' : 'light-theme';
  }, [theme]);

  // Definimos el color de acento dinámico según la sección activa
  const obtenerColorAcento = () => {
    switch (vistaActiva) {
      case 'audio': return '#34B7F1';    // Cian corporativo
      case 'whatsapp': return '#00a884'; // Verde WhatsApp
      case 'campana': return '#f57c00';  // Naranja Excel
      default: return '#00a884';         // Por defecto verde
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
        <Login onLogin={() => setIsLoggedIn(true)} />
      </>
    );
  }

  return (
    <div className="container" style={{ '--current-accent': obtenerColorAcento() }}>
      <Toaster position="top-right" />

      {/* BARRA SUPERIOR DE CONTROL DE SESIÓN Y TEMA */}
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

      {/* RENDERIZADO DINÁMICO DE MÓDULOS */}
      <div className="animate-fade-in" style={{ width: '100%', marginTop: '40px' }}>
        {vistaActiva === 'menu' && <MenuPrincipal setVista={setVistaActiva} />}
        {vistaActiva === 'audio' && <AudioMender />}
        {vistaActiva === 'whatsapp' && <WhatsAppDashboard />}
        {vistaActiva === 'campana' && <GestorCampana />}
      </div>

      <footer className="main-footer">
        <p>MendVox Suite • Security Level: Administrator</p>
      </footer>
    </div>
  );
}

export default App;