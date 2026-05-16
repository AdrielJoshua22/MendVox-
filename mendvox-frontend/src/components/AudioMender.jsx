import React, { useState, useEffect, useRef } from 'react';
import { convertToTrueWav } from '../utils/audioUtils';
import { toast } from 'react-hot-toast';

export default function AudioMender() {
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
        toast.success("Audio capturado correctamente 🎙️");
      };

      mediaRecorder.start();
      setIsRecording(true);
      setAudioBlob(null);
      setResult("");
    } catch (error) {
      console.error(error);
      toast.error("Necesitás dar permisos de micrófono en el navegador.");
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
      toast.success("¡Pensamiento procesado con éxito!");
      fetchHistory();

    } catch (error) {
      console.error(error);
      toast.error("Ocurrió un error al conectar con MendVox.");
      setResult("Ocurrió un error al conectar con MendVox.");
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  return (
    <main className="card" style={{ maxWidth: '700px', margin: '0 auto', textAlign: 'center' }}>
      <header style={{ marginBottom: '30px' }}>
        <h1 className="logo" style={{ color: '#00a884', fontSize: '2.5rem', fontWeight: '700', margin: 0 }}>MendVox Audio</h1>
        <p className="subtitle" style={{ color: '#667781', margin: '5px 0 0 0' }}>IA para limpiar y optimizar tus pensamientos de voz</p>
      </header>

      <section className="input-section" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Controles del Grabador de Audio */}
        <div className="audio-controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', flexWrap: 'wrap' }}>
          {!isRecording ? (
            <button
              className="secondary-button"
              onClick={startRecording}
              style={{ border: '1px solid #00a884', color: '#00a884', padding: '10px 20px', borderRadius: '20px' }}
            >
              🎙️ Grabar Audio
            </button>
          ) : (
            <button
              className="animate-pulse"
              onClick={stopRecording}
              style={{ backgroundColor: '#fee2e2', border: '1px solid #ef4444', color: '#ef4444', padding: '10px 20px', borderRadius: '20px', fontWeight: '600' }}
            >
              🛑 Detener Grabación
            </button>
          )}
          {audioUrl && !isRecording && (
            <audio className="audio-player" src={audioUrl} controls style={{ height: '40px' }} />
          )}
        </div>

        {/* Caja de Texto Inteligente */}
        <textarea
          placeholder="Escribe, pega o graba lo que tienes en mente..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isRecording}
          style={{
            width: '100%', minHeight: '140px', padding: '16px', border: '1px solid #e9edef',
            borderRadius: '12px', fontSize: '1rem', resize: 'none', boxStructuring: 'border-box',
            outline: 'none', transition: 'border-color 0.2s', backgroundColor: '#f8f9fa'
          }}
          onFocus={(e) => e.target.style.borderColor = '#00a884'}
          onBlur={(e) => e.target.style.borderColor = '#e9edef'}
        />

        {/* Botón de Acción Principal */}
        <button
          className="mend-button"
          onClick={handleMend}
          disabled={loading || (!text && !audioBlob)}
          style={{
            padding: '14px 24px', backgroundColor: '#00a884', color: 'white', border: 'none',
            borderRadius: '12px', fontWeight: '600', fontSize: '1rem', cursor: 'pointer',
            opacity: (loading || (!text && !audioBlob)) ? 0.5 : 1, transition: 'background-color 0.2s'
          }}
        >
          {loading ? `Reparando pensamiento... (${timer}s)` : "Procesar con IA"}
        </button>

        {result && (
          <p className="timer-badge" style={{ fontSize: '0.85rem', color: '#667781', fontFamily: 'monospace', margin: 0, textAlign: 'right' }}>
            Tiempo de respuesta: {timer}s
          </p>
        )}
      </section>

      {/* Caja de Resultados */}
      {result && (
        <section className="result-section animate-fade-in" style={{ marginTop: '30px', textAlign: 'left' }}>
          <div className="divider" style={{ height: '1px', background: '#e9edef', margin: '20px 0' }}></div>
          <h4 style={{ margin: '0 0 10px 0', color: '#111b21', fontSize: '1.1rem' }}>💡 Resultado optimizado:</h4>
          <p className="result-text" style={{ fontSize: '1.05rem', lineHeight: '1.6', color: '#111b21', background: '#f0f2f5', padding: '20px', borderRadius: '12px', margin: 0 }}>
            {result}
          </p>
        </section>
      )}

      {/* Sección del Historial */}
      <div style={{ textAlign: 'center', marginTop: '35px' }}>
        <button
          className="secondary-button"
          onClick={() => setShowHistory(!showHistory)}
          style={{ backgroundColor: '#ffffff', border: '1px solid #e9edef', color: '#667781', padding: '10px 24px', borderRadius: '20px' }}
        >
          {showHistory ? "📁 Ocultar Historial" : "📂 Ver Historial"}
        </button>
      </div>

      {showHistory && history.length > 0 && (
        <section className="history-section animate-fade-in" style={{ marginTop: '25px', textAlign: 'left' }}>
          <div className="divider" style={{ height: '1px', background: '#e9edef', margin: '20px 0' }}></div>
          <h3 className="history-title" style={{ fontSize: '1.2rem', color: '#667781', textAlign: 'center', marginBottom: '20px' }}>Historial de Ideas</h3>
          <div className="history-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {history.map((item) => (
              <div key={item.id} className="history-item" style={{ background: '#f8f9fa', border: '1px solid #e9edef', borderRadius: '12px', padding: '15px', transition: 'transform 0.2s' }}>
                <p className="history-original" style={{ fontSize: '0.85rem', color: '#667781', fontStyle: 'italic', margin: '0 0 6px 0' }}>
                  Original: "{item.originalText}"
                </p>
                <p className="history-repaired" style={{ fontSize: '0.95rem', color: '#111b21', fontWeight: '500', margin: 0 }}>
                  IA: {item.repairedText}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}