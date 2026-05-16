import React, { useState } from 'react';
import { toast } from 'react-hot-toast';

export default function Login({ onLogin, theme, alternarTema }) {
  const [pass, setPass] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pass === "mendvox2026") {
      toast.success("Acceso Concedido. Bienvenido.");
      onLogin();
    } else {
      toast.error("Clave Incorrecta");
    }
  };

  return (
    <div
      className="login-screen-container"
      style={{
        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
        backgroundColor: 'var(--bg-app)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px',
        boxSizing: 'border-box'
      }}
    >
      {/* BOTÓN FLOTANTE DE TEMA EN EL LOGIN */}
      <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10000 }}>
        <button className="nav-control-btn" onClick={alternarTema}>
          {theme === 'light' ? '🌙 Modo Oscuro' : '☀️ Modo Claro'}
        </button>
      </div>

      <div
        className="login-card"
        style={{
          background: 'var(--bg-card)', padding: '50px 40px', borderRadius: '24px',
          boxShadow: '0 10px 40px var(--shadow-subtle)', border: '1px solid var(--border-light)',
          textAlign: 'center', maxWidth: '450px', width: '100%', boxSizing: 'border-box'
        }}
      >
        <h1 style={{ fontSize: '3rem', margin: '0 0 10px 0', color: 'var(--current-accent, #00a884)', fontWeight: '800', letterSpacing: '-1px' }}>
          MendVox
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', margin: '0 0 40px 0' }}>
          Portal de Gestión Inteligente
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <input
            type="password"
            placeholder="Clave de Seguridad"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            style={{
              background: 'var(--bg-input)', border: '1px solid var(--border-light)',
              padding: '16px', borderRadius: '12px', color: 'var(--text-title)',
              fontSize: '1rem', width: '100%', textAlign: 'center', outline: 'none',
              boxSizing: 'border-box', transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--current-accent, #00a884)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border-light)'}
          />
          <button
            type="submit"
            className="mend-button"
            style={{
              width: '100%', padding: '14px', borderRadius: '12px',
              fontSize: '1rem', fontWeight: '600', cursor: 'pointer'
            }}
          >
            Ingresar al Sistema
          </button>
        </form>
      </div>

      <footer style={{ position: 'absolute', bottom: '25px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
          Desarrollado por <span style={{ fontWeight: '600', color: 'var(--text-title)' }}>AdrielJoshua</span>
        </p>
        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '10px' }}>
          <a href="https://github.com/AdrielJoshua22" target="_blank" rel="noreferrer" style={{ color: 'var(--current-accent, #00a884)', fontSize: '0.85rem', textDecoration: 'none', fontWeight: '500' }}>GitHub</a>
          <a href="https://linkedin.com/in/joshuaadriel" target="_blank" rel="noreferrer" style={{ color: 'var(--current-accent, #00a884)', fontSize: '0.85rem', textDecoration: 'none', fontWeight: '500' }}>LinkedIn</a>
        </div>
      </footer>
    </div>
  );
}