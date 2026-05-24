import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

export default function WhatsAppDashboard() {
  const [clientes, setClientes] = useState([]);
  const [clienteActivo, setClienteActivo] = useState(null);
  const [historialChat, setHistorialChat] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [disparando, setDisparando] = useState(false);
  const [metricas, setMetricas] = useState({ totalDeuda: 0, contactados: 0, activos: 0 });
  const [mensajeManual, setMensajeManual] = useState("");
  const [modoMonitor, setModoMonitor] = useState(false);
  const [chatsMultiples, setChatsMultiples] = useState({});
  const [mensajesRapidos, setMensajesRapidos] = useState({});
  const chatEndRef = useRef(null);

  useEffect(() => {
    cargarClientes();
    cargarMetricas();
  }, []);

  const cargarClientes = () => {
    axios.get('http://localhost:3000/api/clientes')
      .then(res => setClientes(res.data))
      .catch(err => console.error(err));
  };

  const cargarMetricas = () => {
    axios.get('http://localhost:3000/api/metricas')
      .then(res => setMetricas(res.data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    let intervalo;
    if (clienteActivo && !modoMonitor) {
      const buscarMensajes = () => {
        axios.get(`http://localhost:3000/api/chats/${clienteActivo.telefono}`)
          .then(res => setHistorialChat(res.data))
          .catch(err => console.error(err));
      };
      buscarMensajes();
      intervalo = setInterval(buscarMensajes, 3000);
    }
    return () => clearInterval(intervalo);
  }, [clienteActivo, modoMonitor]);

  useEffect(() => {
    let intervalo;
    if (modoMonitor && seleccionados.length > 0) {
      const buscarMultiplesChats = async () => {
        try {
          const promesas = seleccionados.map(t => axios.get(`http://localhost:3000/api/chats/${t}`));
          const resultados = await Promise.all(promesas);
          const nuevosChats = {};
          resultados.forEach((res, i) => nuevosChats[seleccionados[i]] = res.data);
          setChatsMultiples(nuevosChats);
        } catch (e) { console.error(e); }
      };
      buscarMultiplesChats();
      intervalo = setInterval(buscarMultiplesChats, 3000);
    }
    return () => clearInterval(intervalo);
  }, [modoMonitor, seleccionados]);

  const abrirChat = (cliente) => { setClienteActivo(cliente); setModoMonitor(false); };
  const cerrarChat = () => { setClienteActivo(null); setHistorialChat([]); setMensajeManual(""); };
  const cerrarMonitor = () => { setModoMonitor(false); setChatsMultiples({}); };

  const toggleSeleccion = (telefono) => {
    setSeleccionados(prev => prev.includes(telefono) ? prev.filter(t => t !== telefono) : [...prev, telefono]);
  };

  const dispararMensajes = async () => {
    setDisparando(true);
    const id = toast.loading("Enviando...");
    try {
      await axios.post('http://localhost:3000/api/campana/disparar', { telefonos: seleccionados });
      toast.success("Enviado", { id });
      setSeleccionados([]);
      cargarClientes();
      cargarMetricas();
    } catch (e) { toast.error("Error", { id }); }
    setDisparando(false);
  };

  const enviarMensajeIndividual = async (e) => {
    e.preventDefault();
    if (!mensajeManual.trim() || !clienteActivo) return;
    const texto = mensajeManual;
    setMensajeManual("");
    try {
      await axios.post('http://localhost:3000/api/chats/enviar', { telefono: clienteActivo.telefono, mensaje: texto });
      setHistorialChat(prev => [...prev, { remitente: 'bot', mensaje: texto, fecha: new Date() }]);
    } catch (e) { toast.error("Error"); setMensajeManual(texto); }
  };

  const enviarMensajeMonitor = async (telefono) => {
    const texto = mensajesRapidos[telefono];
    if (!texto || !texto.trim()) return;
    try {
      await axios.post('http://localhost:3000/api/chats/enviar', { telefono, mensaje: texto });
      setMensajesRapidos(prev => ({ ...prev, [telefono]: "" }));
    } catch (e) { toast.error("Error"); }
  };

  return (
    <main className="card" style={{ maxWidth: modoMonitor ? '1200px' : '900px' }}>
      <header>
        <h1 className="logo" style={{ color: '#25D366' }}>MendVox Cobranzas</h1>
        <p className="subtitle">Gestión automatizada por WhatsApp</p>
      </header>

      {/* METRICAS SIEMPRE VISIBLES */}
      <section style={{ display: 'flex', gap: '15px', marginBottom: '20px', marginTop: '20px' }}>
        <div style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '12px', borderLeft: '4px solid #25D366' }}>
          <h4 style={{ margin: 0, color: '#667781', fontSize: '0.9rem' }}>Deuda Total</h4>
          <h2 style={{ margin: 0 }}>${metricas.totalDeuda.toLocaleString('es-AR')}</h2>
        </div>
        <div style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '12px', borderLeft: '4px solid #34B7F1' }}>
          <h4 style={{ margin: 0, color: '#667781', fontSize: '0.9rem' }}>Contactados</h4>
          <h2 style={{ margin: 0 }}>{metricas.contactados}</h2>
        </div>
      </section>

      <section className="input-section">
        {!clienteActivo && !modoMonitor && (
          <div className="animate-fade-in">
            {seleccionados.length > 0 && (
              <div style={{ backgroundColor: '#e8f5e9', padding: '15px', borderRadius: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold' }}>{seleccionados.length} seleccionados</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="mend-button" onClick={() => setModoMonitor(true)} disabled={seleccionados.length > 5}>Monitor</button>
                  <button className="mend-button" onClick={dispararMensajes} disabled={disparando}>Disparar</button>
                </div>
              </div>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th></th><th>Nombre</th><th>Teléfono</th><th>Deuda</th></tr></thead>
              <tbody>
                {clientes.map(c => (
                  <tr key={c.telefono} className="fila-clickeable" onClick={() => abrirChat(c)}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={seleccionados.includes(c.telefono)} onChange={() => toggleSeleccion(c.telefono)} /></td>
                    <td>{c.nombre}</td>
                    <td>{c.telefono}</td>
                    <td>${c.deuda}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {modoMonitor && (
          <div className="monitor-grid">
            {seleccionados.map(telefono => {
              const cliente = clientes.find(c => c.telefono === telefono);
              const historial = chatsMultiples[telefono] || [];
              return (
                <div key={telefono} className="monitor-chat-card">
                  <div className="monitor-header"><strong>{cliente?.nombre}</strong></div>
                  <div className="monitor-chat-body">
                    {historial.map((msg, i) => (
                      <div key={i} className={`burbuja ${msg.remitente === 'bot' ? 'bot' : 'cliente'}`}>
                        <span>{msg.mensaje}</span>
                      </div>
                    ))}
                  </div>
                  <div className="monitor-input-area">
                    <input type="text" value={mensajesRapidos[telefono] || ""} onChange={(e) => setMensajesRapidos(p => ({ ...p, [telefono]: e.target.value }))} />
                    <button className="mend-button" onClick={() => enviarMensajeMonitor(telefono)}>➤</button>
                  </div>
                </div>
              );
            })}
            <button className="mend-button" onClick={cerrarMonitor} style={{ gridColumn: '1/-1', marginTop: '10px' }}>Cerrar Monitor</button>
          </div>
        )}

        {clienteActivo && !modoMonitor && (
          <div>
            <div className="chat-header"><h3>Chat con {clienteActivo.nombre}</h3></div>
            <div className="chat-container">
              {historialChat.map((msg, i) => (
                <div key={i} className={`burbuja ${msg.remitente === 'bot' ? 'bot' : 'cliente'}`}>
                  <span>{msg.mensaje}</span>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={enviarMensajeIndividual} style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <input type="text" style={{ flex: 1 }} value={mensajeManual} onChange={(e) => setMensajeManual(e.target.value)} />
              <button className="mend-button" type="submit">➤</button>
            </form>
            <button className="secondary-button" style={{ marginTop: '10px' }} onClick={cerrarChat}>Volver</button>
          </div>
        )}
      </section>
    </main>
  );
}