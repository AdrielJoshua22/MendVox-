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
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (!clienteActivo) {
      cargarClientes();
      cargarMetricas();
    }
  }, [clienteActivo]);

  const cargarClientes = () => {
    axios.get('http://localhost:3000/api/clientes')
      .then(res => setClientes(res.data))
      .catch(err => console.error("Error al cargar deudores", err));
  };

  const cargarMetricas = () => {
    axios.get('http://localhost:3000/api/metricas')
      .then(res => setMetricas(res.data))
      .catch(err => console.error("Error al cargar métricas", err));
  };

  useEffect(() => {
    let intervalo;
    if (clienteActivo) {
      const buscarMensajes = () => {
        axios.get(`http://localhost:3000/api/chats/${clienteActivo.telefono}`)
          .then(res => setHistorialChat(res.data))
          .catch(err => console.error("Error al recargar el chat", err));
      };
      buscarMensajes();
      intervalo = setInterval(buscarMensajes, 3000);
    }
    return () => clearInterval(intervalo);
  }, [clienteActivo]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [historialChat]);

  const abrirChat = (cliente) => setClienteActivo(cliente);

  const cerrarChat = () => {
    setClienteActivo(null);
    setHistorialChat([]);
  };

  // LÓGICA DE NAVEGACIÓN ENTRE CONVERSACIONES
  const indiceActual = clientes.findIndex(c => c.telefono === clienteActivo?.telefono);

  const irAnterior = () => {
    if (indiceActual > 0) {
      setHistorialChat([]); // Limpieza visual rápida mientras carga el próximo
      setClienteActivo(clientes[indiceActual - 1]);
    }
  };

  const irSiguiente = () => {
    if (indiceActual < clientes.length - 1) {
      setHistorialChat([]);
      setClienteActivo(clientes[indiceActual + 1]);
    }
  };

  const toggleSeleccion = (telefono) => {
    setSeleccionados(prev =>
      prev.includes(telefono) ? prev.filter(t => t !== telefono) : [...prev, telefono]
    );
  };

  const dispararMensajes = async () => {
    setDisparando(true);
    const cargandoToast = toast.loading("Disparando mensajes a la cola... ");

    try {
      await axios.post('http://localhost:3000/api/campana/disparar', { telefonos: seleccionados });
      toast.success("¡Mensajes enviados correctamente!", { id: cargandoToast });
      setSeleccionados([]);
      cargarClientes();
      cargarMetricas();
    } catch (error) {
      console.error(error);
      toast.error("Error al disparar los mensajes.", { id: cargandoToast });
    }
    setDisparando(false);
  };

  return (
    <main className="card" style={{ maxWidth: '900px' }}>
      <header>
        <h1 className="logo" style={{ color: '#25D366' }}>MendVox Cobranzas</h1>
        <p className="subtitle">Gestión automatizada por WhatsApp</p>
      </header>

      <section className="input-section" style={{ marginTop: '20px' }}>

        {!clienteActivo && (
          <div className="animate-fade-in">
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                <div style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '12px', borderLeft: '4px solid #25D366', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <h4 style={{ margin: '0 0 5px 0', color: '#667781', fontSize: '0.9rem' }}>Deuda Total en Gestión</h4>
                    <h2 style={{ margin: 0, color: '#111b21' }}>${metricas.totalDeuda.toLocaleString('es-AR')}</h2>
                </div>
                <div style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '12px', borderLeft: '4px solid #34B7F1', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <h4 style={{ margin: '0 0 5px 0', color: '#667781', fontSize: '0.9rem' }}>Clientes Contactados</h4>
                    <h2 style={{ margin: 0, color: '#111b21' }}>{metricas.contactados}</h2>
                </div>
                <div style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '12px', borderLeft: '4px solid #FF9F43', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <h4 style={{ margin: '0 0 5px 0', color: '#667781', fontSize: '0.9rem' }}>Chats Activos (Bot)</h4>
                    <h2 style={{ margin: 0, color: '#111b21' }}>{metricas.activos} <span style={{fontSize: '1rem', color: '#667781'}}>/ 10</span></h2>
                </div>
            </div>

            {seleccionados.length > 0 && (
              <div style={{
                backgroundColor: '#e8f5e9', border: '1px solid #25D366', padding: '15px',
                borderRadius: '12px', marginBottom: '20px', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span style={{ fontWeight: 'bold', color: '#2e7d32' }}>
                  {seleccionados.length} cliente(s) seleccionado(s)
                </span>
                <button
                  className="mend-button"
                  onClick={dispararMensajes}
                  disabled={disparando}
                >
                  {disparando ? "Enviando..." : "Disparar Mensajes 🚀"}
                </button>
              </div>
            )}

            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', marginTop: '10px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: '10px', width: '40px' }}></th>
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
                      <td style={{ padding: '10px' }}>
                        {/* ❌ SE QUITÓ LA CONDICIÓN. AHORA SIEMPRE SE MUESTRA EL CHECKBOX */}
                        <input
                          type="checkbox"
                          checked={seleccionados.includes(c.telefono)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleSeleccion(c.telefono)}
                          style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '10px' }}>{c.nombre}</td>
                      <td style={{ padding: '10px' }}>{c.telefono}</td>
                      <td style={{ padding: '10px', fontWeight: 'bold' }}>${c.deuda}</td>
                      <td style={{ padding: '10px' }}>
                        <span style={{
                          backgroundColor: c.estado_campana === 'activa' ? '#e8f5e9' : c.estado_campana === 'pausada' ? '#fff3e0' : c.estado_campana === 'pendiente' ? '#e3f2fd' : '#ffebee',
                          color: c.estado_campana === 'activa' ? '#2e7d32' : c.estado_campana === 'pausada' ? '#e65100' : c.estado_campana === 'pendiente' ? '#1565c0' : '#c62828',
                          padding: '4px 8px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 'bold'
                        }}>
                          {c.estado_campana ? c.estado_campana.toUpperCase() : 'DESCONOCIDO'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>No hay deudores cargados.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {clienteActivo && (
          <div className="animate-fade-in">
            {/* CABECERA CON ESPACIADO AGREGADO */}
            <div className="chat-header" style={{ marginBottom: '20px', borderRadius: '12px' }}>
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.4rem' }}>
                  Chat con {clienteActivo.nombre}
                </h3>
              </div>
            </div>
            <div className="chat-container" style={{ borderRadius: '12px' }}>
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
                <p style={{ textAlign: 'center', color: '#667781', marginTop: '20px' }}>Cargando mensajes...</p>
              )}
              <div ref={chatEndRef} />
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '15px',
              backgroundColor: '#f0f2f5',
              padding: '12px 20px',
              borderRadius: '12px',
              border: '1px solid var(--border-light)'
            }}>
              <button className="secondary-button" onClick={cerrarChat}>
                ← Volver a la lista
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="secondary-button"
                  onClick={irAnterior}
                  disabled={indiceActual === 0}
                  style={{ opacity: indiceActual === 0 ? 0.5 : 1, cursor: indiceActual === 0 ? 'not-allowed' : 'pointer' }}
                >
                  ◀ Anterior
                </button>
                <button
                  className="secondary-button"
                  onClick={irSiguiente}
                  disabled={indiceActual === clientes.length - 1}
                  style={{ opacity: indiceActual === clientes.length - 1 ? 0.5 : 1, cursor: indiceActual === clientes.length - 1 ? 'not-allowed' : 'pointer' }}
                >
                  Siguiente ▶
                </button>
              </div>
            </div>

          </div>
        )}

      </section>
    </main>
  );
}