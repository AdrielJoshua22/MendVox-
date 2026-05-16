import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

export default function GestorCampana() {
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);

  const manejarSubida = async (e) => {
    e.preventDefault();
    if (!archivo) return alert("Por favor, seleccioná un archivo Excel (.xlsx)");

    setSubiendo(true);
    const formData = new FormData();
    formData.append('archivo_campana', archivo);

    try {
      await axios.post('http://localhost:3000/api/campana/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success("¡Base de datos actualizada con éxito! 📂", { duration: 4000 });
      setArchivo(null);
      document.getElementById('fileInput').value = '';
    } catch (error) {
      console.error(error);
      toast.error("Error al subir el archivo. Revisá el formato.");
    }
    setSubiendo(false);
  };

  return (
    <main className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
       <header>
        <h1 className="logo" style={{ color: '#34B7F1' }}>Gestor de Campañas</h1>
        <p className="subtitle">Carga masiva de deudores vía Excel</p>
      </header>

      <section style={{
        backgroundColor: '#f8f9fa', padding: '40px 20px', borderRadius: '12px',
        border: '2px dashed #ccc', marginTop: '20px', textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px'
      }}>
        <h3 style={{ margin: 0, color: '#111b21' }}>📥 Subir Excel Mensual</h3>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#667781' }}>
          Asegurate de que el archivo tenga exactamente estas columnas: Nombre, Telefono, Deuda, Servicio
        </p>

        <form onSubmit={manejarSubida} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px', width: '100%', alignItems: 'center' }}>
          <input
            id="fileInput"
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={(e) => setArchivo(e.target.files[0])}
            style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#fff', width: '80%' }}
          />
          <button
            type="submit"
            className="mend-button"
            disabled={!archivo || subiendo}
            style={{ width: 'auto', padding: '10px 30px', opacity: (!archivo || subiendo) ? 0.5 : 1, backgroundColor: '#34B7F1' }}
          >
            {subiendo ? "Procesando BD..." : "Subir Datos a MySQL"}
          </button>
        </form>
      </section>
    </main>
  );
}