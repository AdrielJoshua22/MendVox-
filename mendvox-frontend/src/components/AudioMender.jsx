import React, { useState, useEffect, useRef } from 'react';
import { convertToTrueWav } from '../utils/audioUtils';

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