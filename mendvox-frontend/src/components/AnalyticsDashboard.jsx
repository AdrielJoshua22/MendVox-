import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';

export default function AnalyticsDashboard() {
  const [metricas, setMetricas] = useState({ totalDeuda: 0, contactados: 0, activos: 0 });
  const [datosSentimiento, setDatosSentimiento] = useState([]);
  const [datosHistoricos, setDatosHistoricos] = useState([]);

  const COLORES_SENTIMIENTO = {
    BUENO: '#25D366',
    MALO: '#FF9F43',
    AGRESIVO: '#ef4444',
    NORMAL: '#667781',
    NEUTRAL: '#667781'
  };

  useEffect(() => {
    cargarDatos();
    const intervalo = setInterval(cargarDatos, 10000); // Refresca cada 10 seg
    return () => clearInterval(intervalo);
  }, []);

  const cargarDatos = async () => {
    try {
      const resMetricas = await axios.get('http://localhost:3000/api/metricas');
      setMetricas(resMetricas.data);

      const resSentimientos = await axios.get('http://localhost:3000/api/metricas/sentimientos');
      setDatosSentimiento(resSentimientos.data.map(item => ({
        name: item.sentimiento,
        value: item.cantidad
      })));

      const resHistorico = await axios.get('http://localhost:3000/api/metricas/historico');
      setDatosHistoricos(resHistorico.data);
    } catch (error) {
      console.error("Error cargando analíticas:", error);
    }
  };

  return (
    <main className="card" style={{ maxWidth: '1200px', margin: '20px auto', padding: '30px' }}>
      <header style={{ marginBottom: '30px' }}>
        <h1 className="logo" style={{ color: '#a855f7', margin: 0 }}>Historial y Métricas</h1>
        <p className="subtitle" style={{ margin: '5px 0 0 0' }}>Rendimiento global de la campaña MendVox</p>
      </header>

      {/* KPIs Principales */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '12px', borderLeft: '4px solid #25D366' }}>
          <h4 style={{ margin: 0, color: '#667781', fontSize: '1rem' }}>Capital en Gestión</h4>
          <h2 style={{ margin: '10px 0 0 0', fontSize: '2rem' }}>${metricas.totalDeuda.toLocaleString('es-AR')}</h2>
        </div>
        <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '12px', borderLeft: '4px solid #34B7F1' }}>
          <h4 style={{ margin: 0, color: '#667781', fontSize: '1rem' }}>Clientes Contactados</h4>
          <h2 style={{ margin: '10px 0 0 0', fontSize: '2rem' }}>{metricas.contactados}</h2>
        </div>
        <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '12px', borderLeft: '4px solid #a855f7' }}>
          <h4 style={{ margin: 0, color: '#667781', fontSize: '1rem' }}>Tasa de Respuesta</h4>
          <h2 style={{ margin: '10px 0 0 0', fontSize: '2rem' }}>
            {metricas.contactados > 0 ? Math.round((metricas.activos / metricas.contactados) * 100) : 0}%
          </h2>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>

        {/* Gráfico Histórico */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #eee', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#333' }}>Evolución de Conversaciones (Últimos 7 días)</h3>
          {datosHistoricos.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={datosHistoricos} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="dia" stroke="#8884d8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="conversaciones" stroke="#a855f7" strokeWidth={3} fillOpacity={1} fill="url(#colorConv)" name="Chats Activos" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
             <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>Recolectando datos...</div>
          )}
        </div>

        {/* Gráfico de Sentimientos */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #eee', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#333' }}>Análisis de Sentimiento IA</h3>
          {datosSentimiento.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={datosSentimiento} innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                  {datosSentimiento.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORES_SENTIMIENTO[entry.name] || '#999'} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconType="circle" verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>Sin datos aún</div>
          )}
        </div>

      </section>
    </main>
  );
}