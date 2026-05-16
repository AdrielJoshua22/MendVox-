import React from 'react';

export default function MenuPrincipal({ setVista }) {
  const cards = [
    {
      id: 'audio',
      title: 'Audio Mender',
      desc: 'Optimización y limpieza de notas de voz con inteligencia artificial.',
      icon: 'fa-volume-high',
      color: '#34B7F1',
      bg: 'rgba(52, 183, 241, 0.12)'
    },
    {
      id: 'whatsapp',
      title: 'WhatsApp Dashboard',
      desc: 'Panel central de cobranzas, métricas en vivo y chats automatizados.',
      icon: 'fa-whatsapp',
      color: '#00a884',
      bg: 'rgba(0, 168, 132, 0.12)'
    },
    {
      id: 'campana',
      title: 'Gestor de Campaña',
      desc: 'Carga masiva de bases de datos deudoras mediante archivos Excel.',
      icon: 'fa-database',
      color: '#f57c00',
      bg: 'rgba(245, 124, 0, 0.12)'
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
            style={{
              '--hover-accent': card.color,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center'
            }}
          >
            <div
              className="card-clean-icon"
              style={{
                backgroundColor: card.bg,
                color: card.color,
                width: '75px',  /* Antes 60px */
                height: '75px', /* Antes 60px */
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem', /* Antes 1.6rem (Icono interno más grande) */
                marginBottom: '25px'
              }}
            >
              <i className={`fa-solid ${card.icon}`}></i>
            </div>
            <h3 style={{ fontSize: '1.4rem', fontWeight: '700', margin: '0 0 12px 0' }}>
              {card.title}
            </h3>
            <p style={{ margin: '0 0 25px 0', flexGrow: 1, fontSize: '0.95rem', lineHeight: '1.45' }}>
              {card.desc}
            </p>

            <span className="card-clean-action" style={{ color: card.color, fontWeight: '600', fontSize: '0.9rem' }}>
              Abrir módulo →
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}