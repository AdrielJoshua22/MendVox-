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
  const [iaSilenciada, setIaSilenciada] = useState(false);
  const [estadosIA, setEstadosIA] = useState({});
  const chatEndRef = useRef(null);

  const COLORES_SENTIMIENTO = {
    BUENO: '#25D366',
    MALO: '#FF9F43',
    AGRESIVO: '#ef4444',
    NORMAL: '#667781',
    NEUTRAL: '#667781'
  };

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

          const promesasIA = seleccionados.map(t => axios.get(`http://localhost:3000/api/chats/${t}/estado-ia`));
          const resultadosIA = await Promise.all(promesasIA);
          const nuevosEstados = {};
          resultadosIA.forEach((res, i) => nuevosEstados[seleccionados[i]] = res.data.iaSilenciada);
          setEstadosIA(nuevosEstados);

          cargarClientes();
        } catch (e) {
          console.error(e);
        }
      };
      buscarMultiplesChats();
      intervalo = setInterval(buscarMultiplesChats, 3000);
    }
    return () => clearInterval(intervalo);
  }, [modoMonitor, seleccionados]);

  const abrirChat = (cliente) => {
    setClienteActivo(cliente);
    setModoMonitor(false);

    axios.get(`http://localhost:3000/api/chats/${cliente.telefono}/estado-ia`)
      .then(res => setIaSilenciada(res.data.iaSilenciada))
      .catch(err => console.error(err));
  };

  const cerrarChat = () => {
    setClienteActivo(null);
    setHistorialChat([]);
    setMensajeManual("");
  };

  const cerrarMonitor = () => {
    setModoMonitor(false);
    setChatsMultiples({});
  };

  const toggleSeleccion = (telefono) => {
    setSeleccionados(prev => prev.includes(telefono) ? prev.filter(t => t !== telefono) : [...prev, telefono]);
  };

  const toggleSeleccionarTodos = () => {
    if (seleccionados.length === clientes.length) {
      setSeleccionados([]);
    } else {
      setSeleccionados(clientes.map(c => c.telefono));
    }
  };

  const dispararMensajes = async () => {
    setDisparando(true);
    const id = toast.loading("Enviando mensajes...");
    try {
      await axios.post('http://localhost:3000/api/campana/disparar', { telefonos: seleccionados });
      toast.success("Campaña enviada", { id });
      setSeleccionados([]);
      cargarClientes();
      cargarMetricas();
    } catch (e) {
      toast.error("Error al disparar campaña", { id });
    }
    setDisparando(false);
  };

  const eliminarCampana = async () => {
    const confirmacion = window.confirm("¿Estás seguro de que querés borrar TODA la campaña? Se eliminarán todos los clientes y el historial.");
    if (!confirmacion) return;

    const id = toast.loading("Eliminando campaña...");
    try {
      await axios.delete('http://localhost:3000/api/campana/borrar');
      toast.success("Campaña eliminada", { id });
      setSeleccionados([]);
      cargarClientes();
      cargarMetricas();
    } catch (error) {
      console.error(error);
      toast.error("Error al eliminar", { id });
    }
  };

  const enviarMensajeIndividual = async (e) => {
    e.preventDefault();
    if (!mensajeManual.trim() || !clienteActivo) return;
    const texto = mensajeManual;
    setMensajeManual("");
    try {
      await axios.post('http://localhost:3000/api/chats/enviar', { telefono: clienteActivo.telefono, mensaje: texto });
      setHistorialChat(prev => [...prev, { remitente: 'bot', mensaje: texto, fecha: new Date() }]);
      setIaSilenciada(true);
    } catch (e) {
      toast.error("Error al enviar");
      setMensajeManual(texto);
    }
  };

  const enviarMensajeMonitor = async (telefono) => {
    const texto = mensajesRapidos[telefono];
    if (!texto || !texto.trim()) return;
    try {
      await axios.post('http://localhost:3000/api/chats/enviar', { telefono, mensaje: texto });
      setMensajesRapidos(prev => ({ ...prev, [telefono]: "" }));
      setEstadosIA(prev => ({ ...prev, [telefono]: true }));
    } catch (e) {
      toast.error("Error al enviar");
    }
  };

  const handleToggleIA = async () => {
    if (!clienteActivo) return;
    try {
      const res = await axios.post(`http://localhost:3000/api/chats/${clienteActivo.telefono}/toggle-ia`);
      setIaSilenciada(res.data.iaSilenciada);
    } catch (error) {
      console.error(error);
    }
  };

  const handleToggleIAMonitor = async (telefono) => {
    try {
      const res = await axios.post(`http://localhost:3000/api/chats/${telefono}/toggle-ia`);
      setEstadosIA(prev => ({ ...prev, [telefono]: res.data.iaSilenciada }));
    } catch (error) {
      console.error(error);
    }
  };

  const renderizarMensaje = (texto) => {
    if (texto && texto.startsWith('[AUDIO:')) {
      const finUrl = texto.indexOf(']');
      const url = texto.substring(7, finUrl);
      const transcripcion = texto.substring(finUrl + 1).trim();

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <audio controls src={`http://localhost:3000${url}`} style={{ height: '35px', maxWidth: '100%' }} />
          <span style={{ fontStyle: 'italic', color: '#555' }}>"{transcripcion}"</span>
        </div>
      );
    }
    return <span>{texto}</span>;
  };

  return (
    <main className="card" style={{ maxWidth: modoMonitor ? '1200px' : '900px' }}>
      <header>
        <h1 className="logo" style={{ color: '#00a884' }}>MendVox Cobranzas</h1>
        <p className="subtitle">Gestión automatizada por WhatsApp</p>
      </header>

      {/* MÉTRICAS SUPERIORES (Solo KPIs numéricos, sin gráficos) */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px', marginTop: '20px' }}>
        <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '12px', borderLeft: '4px solid #25D366' }}>
          <h4 style={{ margin: 0, color: '#667781', fontSize: '1rem' }}>Deuda Total</h4>
          <h2 style={{ margin: '10px 0 0 0', fontSize: '2rem' }}>${metricas.totalDeuda.toLocaleString('es-AR')}</h2>
        </div>
        <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '12px', borderLeft: '4px solid #34B7F1' }}>
          <h4 style={{ margin: 0, color: '#667781', fontSize: '1rem' }}>Contactados</h4>
          <h2 style={{ margin: '10px 0 0 0', fontSize: '2rem' }}>{metricas.contactados}</h2>
        </div>
        <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '12px', borderLeft: '4px solid #FF9F43' }}>
          <h4 style={{ margin: 0, color: '#667781', fontSize: '1rem' }}>Chats Activos (Bot)</h4>
          <h2 style={{ margin: '10px 0 0 0', fontSize: '2rem' }}>{metricas.activos} <span style={{fontSize: '1rem', color: '#667781'}}>/ 10</span></h2>
        </div>
      </section>

      {/* TABLA Y CONTROLES */}
      <section className="input-section">
        {!clienteActivo && !modoMonitor && (
          <div className="animate-fade-in">

            {seleccionados.length > 0 && (
              <div style={{ backgroundColor: '#e8f5e9', padding: '15px', borderRadius: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', color: '#2e7d32' }}>{seleccionados.length} clientes seleccionados</span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="mend-button" onClick={() => setModoMonitor(true)} disabled={seleccionados.length > 5}>Monitor</button>
                  <button className="mend-button" onClick={dispararMensajes} disabled={disparando}>Disparar Mensajes</button>
                </div>
              </div>
            )}

            {clientes.length > 0 && (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                      <th style={{ padding: '10px' }}>
                        <input
                          type="checkbox"
                          checked={seleccionados.length === clientes.length && clientes.length > 0}
                          onChange={toggleSeleccionarTodos}
                        />
                      </th>
                      <th style={{ padding: '10px' }}>Nombre</th>
                      <th style={{ padding: '10px' }}>Teléfono</th>
                      <th style={{ padding: '10px' }}>Deuda</th>
                      <th style={{ padding: '10px' }}>Humor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map(c => (
                      <tr key={c.telefono} className={`fila-clickeable ${c.estado_campana === 'alerta' ? 'fila-alerta' : ''}`} onClick={() => abrirChat(c)} style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}>
                        <td style={{ padding: '10px' }} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={seleccionados.includes(c.telefono)} onChange={() => toggleSeleccion(c.telefono)} />
                        </td>
                        <td style={{ padding: '10px' }}>{c.nombre}</td>
                        <td style={{ padding: '10px' }}>{c.telefono}</td>
                        <td style={{ padding: '10px' }}>${c.deuda}</td>
                        <td style={{ padding: '10px', fontWeight: 'bold', color: COLORES_SENTIMIENTO[c.sentimiento] || '#667781' }}>
                          {c.sentimiento === 'BUENO' && 'Bueno'}
                          {c.sentimiento === 'MALO' && 'Malo'}
                          {c.sentimiento === 'AGRESIVO' && 'Agresivo'}
                          {c.sentimiento === 'NORMAL' && 'Normal'}
                          {c.sentimiento === 'NEUTRAL' && 'Normal'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button
                    onClick={eliminarCampana}
                    style={{
                      backgroundColor: '#fee2e2',
                      color: '#ef4444',
                      border: '1px solid #ef4444',
                      padding: '8px 16px',
                      borderRadius: '20px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}
                  >
                    Eliminar Campaña
                  </button>
                </div>
              </>
            )}

            {clientes.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#667781' }}>
                <p>No hay clientes en la campaña actual.</p>
              </div>
            )}
          </div>
        )}

        {modoMonitor && (
          <div className="monitor-grid">
            {seleccionados.map(telefono => {
              const cliente = clientes.find(c => c.telefono === telefono);
              const historial = chatsMultiples[telefono] || [];
              const iaApagada = estadosIA[telefono] || false;

              return (
                <div key={telefono} className={`monitor-chat-card ${cliente?.estado_campana === 'alerta' ? 'tarjeta-alerta' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '450px' }}>
                  <div className="monitor-header" style={{ flexShrink: 0 }}>
                    <strong>{cliente?.nombre}</strong>
                  </div>

                  <div className="monitor-chat-body" style={{ flex: 1, overflowY: 'auto' }}>
                    {historial.map((msg, i) => (
                      <div key={i} className={`burbuja ${msg.remitente === 'bot' ? 'bot' : 'cliente'}`}>
                        {renderizarMensaje(msg.mensaje)}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 10px', backgroundColor: '#f0f2f5', flexShrink: 0 }}>
                    <button
                      onClick={() => handleToggleIAMonitor(telefono)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '15px',
                        border: 'none',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        backgroundColor: iaApagada ? '#fee2e2' : '#dcf8c6',
                        color: iaApagada ? '#ef4444' : '#00a884',
                        transition: 'all 0.2s ease-in-out'
                      }}
                    >
                      {iaApagada ? 'Humano al Mando (Reactivar IA)' : 'IA Activa (Pausar)'}
                    </button>
                  </div>

                  <div className="monitor-input-area" style={{ display: 'flex', gap: '8px', padding: '10px', backgroundColor: '#f0f2f5', borderTop: '1px solid #ddd', flexShrink: 0 }}>
                    <input
                      type="text"
                      placeholder="Escribe un mensaje..."
                      value={mensajesRapidos[telefono] || ""}
                      onChange={(e) => setMensajesRapidos(p => ({ ...p, [telefono]: e.target.value }))}
                      style={{ flex: 1, padding: '10px 14px', borderRadius: '20px', border: '1px solid #ccc', outline: 'none' }}
                    />
                    <button
                      className="mend-button"
                      onClick={() => enviarMensajeMonitor(telefono)}
                      style={{
                        padding: '0 15px',
                        borderRadius: '20px',
                        fontWeight: 'bold',
                        minWidth: '45px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      Enviar
                    </button>
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
                  {renderizarMensaje(msg.mensaje)}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px', marginTop: '4px' }}>
              <button
                onClick={handleToggleIA}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: 'none',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  backgroundColor: iaSilenciada ? '#fee2e2' : '#dcf8c6',
                  color: iaSilenciada ? '#ef4444' : '#00a884',
                  transition: 'all 0.2s ease-in-out',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}
              >
                {iaSilenciada ? 'Humano al Mando (Reactivar IA)' : 'IA Activa (Pausar)'}
              </button>
            </div>

            <form onSubmit={enviarMensajeIndividual} style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <input type="text" style={{ flex: 1, padding: '10px 14px', borderRadius: '20px', border: '1px solid #ccc', outline: 'none' }} value={mensajeManual} onChange={(e) => setMensajeManual(e.target.value)} />
              <button className="mend-button" type="submit" style={{ padding: '0 20px', borderRadius: '20px' }}>Enviar</button>
            </form>
            <button className="secondary-button" style={{ marginTop: '10px' }} onClick={cerrarChat}>Volver</button>
          </div>
        )}
      </section>
    </main>
  );
}