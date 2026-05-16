import React from 'react';

export default function MenuPrincipal({ setVista }) {
  const cards = [
    {
      id: 'audio',
      title: 'Audio Mender',
      desc: 'Optimización y limpieza de notas de voz con inteligencia artificial.',
      icon: 'fa-microphone-lines',
      color: '#00a884', // Verde WhatsApp moderno
      bg: '#e6f7f4'
    },
    {
      id: 'whatsapp',
      title: 'WhatsApp Dashboard',
      desc: 'Panel central de cobranzas, métricas en vivo y chats automatizados.',
      icon: 'fa-whatsapp',
      color: '#128c7e',
      bg: '#e1f5fe'
    },
    {
      id: 'campana',
      title: 'Gestor de Campaña',
      desc: 'Carga masiva de bases de datos deudoras mediante archivos Excel.',
      icon: 'fa-file-excel',
      color: '#f57c00', // Naranja sutil para el Excel
      bg: '#fff3e0'
    }
  ];

  return (
    <div className="menu-clean-container animate-fade-in">
      <div className="menu-header-clean">
        <h2>MendVox Suite</h2>
        <p>Seleccioná el módulo de gestión para comenzar</p>
      </div>

      <div className="grid-clean">
        {cards.map(card => (
          <div
            key={card.id}
            className="card-clean"
            onClick={() => setVista(card.id)}
          >
            <div className="card-clean-icon" style={{ backgroundColor: card.bg, color: card.color }}>
              <i className={`fa-solid ${card.icon}`}></i>
            </div>
            <h3>{card.title}</h3>
            <p>{card.desc}</p>
            <span className="card-clean-action" style={{ color: card.color }}>
              Abrir módulo →
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}