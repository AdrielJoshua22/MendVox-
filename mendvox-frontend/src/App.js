import React, { useState } from 'react';
import AudioMender from './components/AudioMender';
import WhatsAppDashboard from './components/WhatsAppDashboard';
import './App.css';

function App() {
  const [vistaActiva, setVistaActiva] = useState('audio');

  return (
    <div className="container">
      <nav style={{ display: 'flex', gap: '10px', marginBottom: '20px', justifyContent: 'center' }}>
        <button
          className={vistaActiva === 'audio' ? 'mend-button' : 'secondary-button'}
          onClick={() => setVistaActiva('audio')}
          style={{ width: 'auto', padding: '10px 20px', margin: 0 }}
        >
          Limpiador de Audio
        </button>
        <button
          className={vistaActiva === 'whatsapp' ? 'mend-button' : 'secondary-button'}
          onClick={() => setVistaActiva('whatsapp')}
          style={{ width: 'auto', padding: '10px 20px', margin: 0, backgroundColor: vistaActiva === 'whatsapp' ? '#25D366' : '' }}
        >
          WhatsApp Dashboard
        </button>
      </nav>

      {vistaActiva === 'audio' ? <AudioMender /> : <WhatsAppDashboard />}

      <footer>
        <p>Running on Local Llama 3.1 & Gemini Flash • MacBook M4</p>
      </footer>
    </div>
  );
}

export default App;