import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

const convertToTrueWav = async (rawBlob) => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  const arrayBuffer = await rawBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const channelData = audioBuffer.getChannelData(0);
  const wavBuffer = new ArrayBuffer(44 + channelData.length * 2);
  const view = new DataView(wavBuffer);

  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + channelData.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 48000, true);
  view.setUint32(28, 48000 * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, channelData.length * 2, true);

  let offset = 44;
  for (let i = 0; i < channelData.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  await audioContext.close();

  return new Blob([view], { type: 'audio/wav' });
};

function AudioMender() {
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(0);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAudioUrl(null);
    }
  }, [audioBlob]);

  const fetchHistory = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/v1/mend/history');
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const rawBlob = new Blob(audioChunksRef.current);
        const trueWavBlob = await convertToTrueWav(rawBlob);
        setAudioBlob(trueWavBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setAudioBlob(null);
      setResult("");
    } catch (error) {
      console.error(error);
      alert("Necesitas dar permisos de micrófono en el navegador.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleMend = async () => {
    if (!text.trim() && !audioBlob) return;

    setLoading(true);
    setResult("");
    setTimer(0);

    const startTime = Date.now();
    const interval = setInterval(() => {
      setTimer(((Date.now() - startTime) / 1000).toFixed(1));
    }, 100);

    try {
      let response;

      if (audioBlob) {
        const formData = new FormData();
        formData.append("audio", audioBlob, "grabacion.wav");

        response = await fetch('http://localhost:8080/api/v1/mend/audio', {
          method: 'POST',
          body: formData
        });
      } else {
        response = await fetch('http://localhost:8080/api/v1/mend', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: text
        });
      }

      const data = await response.json();
      setResult(data.text);
      if (data.audioBase64) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
        audio.play();
      }

      if (audioBlob) setAudioBlob(null);
      fetchHistory();

    } catch (error) {
      console.error(error);
      setResult("Ocurrió un error al conectar con MendVox.");
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  return (
    <main className="card">
      <header>
        <h1 className="logo">MendVox</h1>
        <p className="subtitle">IA para limpiar tus pensamientos</p>
      </header>

      <section className="input-section">
        <div className="audio-controls">
          {!isRecording ? (
            <button className="record-button" onClick={startRecording}>Grabar Audio</button>
          ) : (
            <button className="stop-button animate-pulse" onClick={stopRecording}>Detener Grabación</button>
          )}
          {audioUrl && !isRecording && <audio className="audio-player" src={audioUrl} controls />}
        </div>

        <textarea
          placeholder="Escribe, pega o graba lo que tienes en mente..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isRecording}
        />

        <button
          className={`mend-button ${loading ? 'loading' : ''}`}
          onClick={handleMend}
          disabled={loading || (!text && !audioBlob)}
        >
          {loading ? `Reparando... (${timer}s)` : "Mend It"}
        </button>
        {result && <p className="timer-badge">Tiempo de respuesta: {timer} segundos</p>}
      </section>

      {result && (
        <section className="result-section animate-fade-in">
          <div className="divider"></div>
          <p className="result-text">{result}</p>
        </section>
      )}

      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <button className="secondary-button" onClick={() => setShowHistory(!showHistory)}>
          {showHistory ? "Ocultar Historial" : "Ver Historial"}
        </button>
      </div>

      {showHistory && history.length > 0 && (
        <section className="history-section animate-fade-in">
          <div className="divider"></div>
          <h2 className="history-title">Historial Reciente</h2>
          <div className="history-list">
            {history.map((item) => (
              <div key={item.id} className="history-item">
                <p className="history-original">"{item.originalText}"</p>
                <p className="history-repaired">{item.repairedText}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function WhatsAppDashboard() {
  const [clientes, setClientes] = useState([]);
  const [clienteActivo, setClienteActivo] = useState(null);
  const [historialChat, setHistorialChat] = useState([]);

  useEffect(() => {
    axios.get('http://localhost:3000/api/clientes')
      .then(res => setClientes(res.data))
      .catch(err => console.error("Error al cargar deudores", err));
  }, []);

  const abrirChat = (cliente) => {
    setClienteActivo(cliente);

    axios.get(`http://localhost:3000/api/chats/${cliente.telefono}`)
      .then(res => setHistorialChat(res.data))
      .catch(err => console.error("Error al cargar el historial del chat", err));
  };

  const cerrarChat = () => {
    setClienteActivo(null);
    setHistorialChat([]);
  };

  return (
    <main className="card" style={{ maxWidth: '900px' }}>
      <header>
        <h1 className="logo" style={{ color: '#25D366' }}>MendVox Cobranzas</h1>
        <p className="subtitle">Gestión automatizada por WhatsApp</p>
      </header>

      <section className="input-section" style={{ marginTop: '20px' }}>

        {!clienteActivo && (
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', marginTop: '10px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '10px' }}>Nombre</th>
                <th style={{ padding: '10px' }}>Teléfono</th>
                <th style={{ padding: '10px' }}>Deuda</th>
                <th style={{ padding: '10px' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {clientes.length > 0 ? (
                clientes.map(c => (
                  <tr key={c.telefono} className="fila-clickeable" onClick={() => abrirChat(c)}>
                    <td style={{ padding: '10px' }}>{c.nombre}</td>
                    <td style={{ padding: '10px' }}>{c.telefono}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold' }}>${c.deuda}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{
                        backgroundColor: c.estado === 'mora' ? '#ffebee' : '#e8f5e9',
                        color: c.estado === 'mora' ? '#c62828' : '#2e7d32',
                        padding: '4px 8px', borderRadius: '12px', fontSize: '0.85em'
                      }}>
                        {c.estado.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>
                    No hay deudores cargados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* VISTA 2: HISTORIAL DE CHAT (Si tocamos a un cliente) */}
        {clienteActivo && (
          <div className="animate-fade-in">
            <div className="chat-header">
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Chat con {clienteActivo.nombre}</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-sub)' }}>
                  {clienteActivo.telefono} • Deuda: ${clienteActivo.deuda}
                </p>
              </div>
              <button className="secondary-button" onClick={cerrarChat}>
                ← Volver a la lista
              </button>
            </div>

            <div className="chat-container">
              {historialChat.length > 0 ? (
                historialChat.map((msg, idx) => (
                  <div key={idx} className={`burbuja ${msg.remitente === 'bot' ? 'bot' : 'cliente'}`}>
                    <span>{msg.mensaje}</span>
                    <span className="fecha-chat">
                      {new Date(msg.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              ) : (
                <p style={{ textAlign: 'center', color: '#667781', marginTop: '20px' }}>
                  No hay mensajes registrados con este cliente.
                </p>
              )}
            </div>

            <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '15px' }}>
              *Para recargar mensajes nuevos, volvé a la lista y entrá de nuevo.
            </p>
          </div>
        )}

      </section>
    </main>
  );
}

function App() {
  const [vistaActiva, setVistaActiva] = useState('audio'); // 'audio' o 'whatsapp'

  return (
    <div className="container">
      {/* Menú de Navegación Simple */}
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

      {/* Renderizado condicional */}
      {vistaActiva === 'audio' ? <AudioMender /> : <WhatsAppDashboard />}

      <footer>
        <p>Running on Local Llama 3.1 & Gemini Flash • MacBook M4</p>
      </footer>
    </div>
);
}

export default App;