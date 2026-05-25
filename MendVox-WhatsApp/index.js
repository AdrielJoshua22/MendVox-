import 'dotenv/config';
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } from "@whiskeysockets/baileys";
import pino from "pino";
import axios from "axios";
import express from "express";
import http from "http";
import { GoogleGenerativeAI } from "@google/generative-ai";
import xlsx from "xlsx";
import mysql from "mysql2/promise";
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import qrcode from "qrcode-terminal";
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import FormData from 'form-data';

const PORT = process.env.PORT || 3000;
const PYTHON_BACKEND_URL = "http://localhost:8000/api/tts";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const upload = multer({ dest: 'uploads/' });

if (!fs.existsSync('audios')) fs.mkdirSync('audios');
app.use('/audios', express.static('audios'));

let sock;
let isSocketConnected = false;
const preferenciasChat = new Map();
const mensajesGeneradosPorIA = new Set();
const sesionesIA = new Map();
const humanosAlMando = new Set();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const promesaConTimeout = (promesa, ms) => {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timeout de WhatsApp excedido')), ms);
    });
    return Promise.race([promesa, timeout]).finally(() => clearTimeout(timer));
};

async function procesarEnvioCampana(cliente) {
    const numeroFormateado = `${cliente.telefono}@s.whatsapp.net`;
    const mensajeInicial = `Hola ${cliente.nombre}, soy Joshua del area de cobranzas de MendVox. Te escribo por el saldo pendiente de $${cliente.deuda} de tu ${cliente.servicio}. ¿Podemos coordinar el pago para esta semana?`;

    try {
        await promesaConTimeout(sock.sendMessage(numeroFormateado, { text: mensajeInicial }), 10000);
        mensajesGeneradosPorIA.add(mensajeInicial);
        await pool.query("INSERT INTO historial_chats (telefono_cliente, remitente, mensaje) VALUES (?, 'bot', ?)", [cliente.telefono, mensajeInicial]);
        await pool.query("UPDATE clientes SET estado_campana = 'activa', ultima_interaccion = NOW() WHERE telefono = ?", [cliente.telefono]);
        console.log(`Mensaje de campana a ${cliente.nombre}`);
        return true;
    } catch (error) {
        console.error(`Fallo campana a ${cliente.telefono}:`, error.message);
        return false;
    }
}

async function procesarRespuestaIA(jid, userInput, cliente, msg) {
    if (!preferenciasChat.has(jid)) preferenciasChat.set(jid, 'TEXTO');
    const estadoActual = preferenciasChat.get(jid);
    let chatIA = sesionesIA.get(jid);

    if (!chatIA) {
        chatIA = aiModel.startChat({
            history: [
                { role: "user", parts: [{ text: `Sos Joshua, del area de cobranzas de MendVox. Estas hablando con ${cliente.nombre}. DATOS: Deuda $${cliente.deuda}, Servicio: ${cliente.servicio}. NUNCA digas que sos un bot. Habla argentino informal pero laboral. REGLA VITAL: Si el cliente te insulta, se enoja mucho, pide explicitamente hablar con una persona real, o propone un plan de pago que no podes resolver, agrega EXACTAMENTE la palabra [ALERTA_HUMANA] al final de tu respuesta.` }] },
                { role: "model", parts: [{ text: "Dale, arranco." }] }
            ]
        });
        sesionesIA.set(jid, chatIA);
    }

    const aiResult = await chatIA.sendMessage(userInput);
    let textoFinal = aiResult.response.text();
    let requiereIntervencion = false;

    if (textoFinal.includes('[ALERTA_HUMANA]')) {
        requiereIntervencion = true;
        textoFinal = textoFinal.replace('[ALERTA_HUMANA]', '').trim();
        humanosAlMando.add(jid);
    }

    mensajesGeneradosPorIA.add(textoFinal);
    console.log(`[Gemini] a ${cliente.nombre}: ${textoFinal}`);

    if (estadoActual === 'TEXTO') {
        await sock.sendMessage(jid, { text: textoFinal });
    } else {
        const res = await axios.post(PYTHON_BACKEND_URL, { text: textoFinal }, { responseType: 'arraybuffer', timeout: 120000 });
        if (res.data && res.data.byteLength > 5000) {
            await sock.sendMessage(jid, { audio: Buffer.from(res.data), mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
        }
    }

    await pool.query("INSERT INTO historial_chats (telefono_cliente, remitente, mensaje) VALUES (?, 'bot', ?)", [cliente.telefono, textoFinal]);

    if (requiereIntervencion) {
        await pool.query("UPDATE clientes SET estado_campana = 'alerta' WHERE telefono = ?", [cliente.telefono]);
        console.log(`ALERTA: Intervencion humana requerida para ${cliente.nombre}`);
    }
}

app.get('/api/clientes', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM clientes");
        res.json(rows);
    } catch (error) { res.status(500).json({ error: "Error interno" }); }
});

app.get('/api/chats/:telefono', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT remitente, mensaje, fecha FROM historial_chats WHERE telefono_cliente = ? ORDER BY fecha ASC", [req.params.telefono]);
        res.json(rows);
    } catch (error) { res.status(500).json({ error: "Error interno" }); }
});

app.get('/api/metricas', async (req, res) => {
    try {
        const [deuda] = await pool.query("SELECT SUM(deuda) as total FROM clientes");
        const [contactados] = await pool.query("SELECT COUNT(*) as total FROM clientes WHERE estado_campana != 'pendiente'");
        const [activos] = await pool.query("SELECT COUNT(*) as total FROM clientes WHERE estado_campana = 'activa'");
        res.json({ totalDeuda: Number(deuda[0].total || 0), contactados: contactados[0].total || 0, activos: activos[0].total || 0 });
    } catch (error) { res.status(500).json({ error: "Error interno" }); }
});

app.get('/api/chats/:telefono/estado-ia', (req, res) => {
    const jid = `${req.params.telefono}@s.whatsapp.net`;
    res.json({ iaSilenciada: humanosAlMando.has(jid) });
});

app.post('/api/chats/:telefono/toggle-ia', async (req, res) => {
    try {
        const telefono = req.params.telefono;
        const jid = `${telefono}@s.whatsapp.net`;

        if (humanosAlMando.has(jid)) {
            humanosAlMando.delete(jid);
            await pool.query("UPDATE clientes SET estado_campana = 'activa' WHERE telefono = ?", [telefono]);
            res.json({ success: true, iaSilenciada: false });
        } else {
            humanosAlMando.add(jid);
            res.json({ success: true, iaSilenciada: true });
        }
    } catch (error) {
        console.error("Error cambiando estado de IA:", error);
        res.status(500).json({ error: "Error interno" });
    }
});

app.post('/api/campana/upload', upload.single('archivo_campana'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Falta archivo" });
    try {
        const workbook = xlsx.readFile(req.file.path);
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        let procesados = 0;
        for (const fila of data) {
            if (!fila.telefono || !fila.nombre) continue;
            await pool.query(`INSERT INTO clientes (telefono, nombre, deuda, servicio, vencimiento, estado_campana) VALUES (?, ?, ?, ?, ?, 'pendiente') ON DUPLICATE KEY UPDATE deuda=?, servicio=?, vencimiento=?, estado_campana='pendiente'`,
            [fila.telefono.toString(), fila.nombre, fila.deuda||0, fila.servicio||'General', fila.vencimiento||null, fila.deuda||0, fila.servicio||'General', fila.vencimiento||null]);
            procesados++;
        }
        fs.unlinkSync(req.file.path);
        res.json({ success: true, message: `Cargados: ${procesados}` });
    } catch (error) { res.status(500).json({ error: "Error procesando Excel" }); }
});

app.post('/api/campana/disparar', async (req, res) => {
    if (!sock || !isSocketConnected) return res.status(500).json({ error: "WhatsApp desconectado" });
    const { telefonos } = req.body;
    if (!telefonos || !telefonos.length) return res.status(400).json({ error: "Sin clientes" });

    try {
        const placeholders = telefonos.map(() => '?').join(',');
        const [clientes] = await pool.query(`SELECT * FROM clientes WHERE telefono IN (${placeholders})`, telefonos);
        for (const cliente of clientes) {
            if (!isSocketConnected) break;
            await procesarEnvioCampana(cliente);
            await delay(3000);
        }
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Error disparando campana" }); }
});

app.post('/api/chats/enviar', async (req, res) => {
    try {
        const { telefono, mensaje } = req.body;
        const jid = `${telefono}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: mensaje });
        humanosAlMando.add(jid);
        res.json({ success: true });
    } catch (error) {
        console.error("Error enviando mensaje manual:", error);
        res.status(500).json({ error: "Error interno" });
    }
});

app.delete('/api/campana/borrar', async (req, res) => {
    try {
        await pool.query("DELETE FROM historial_chats");
        await pool.query("DELETE FROM clientes");
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: "Error interno al borrar" }); }
});

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['MendVox Server', 'Chrome', '120.0.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'connecting') isSocketConnected = false;
        if (connection === 'open') {
            isSocketConnected = true;
            console.log('MendVox conectado a WhatsApp');
        }
        if (connection === 'close') {
            isSocketConnected = false;
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                connectToWhatsApp();
            } else { console.log('Desvinculado. Borrar auth_info_baileys'); }
        }
    });

   sock.ev.on('messages.upsert', async m => {
       if (!isSocketConnected) return;
       const msg = m.messages[0];
       if (!msg.message) return;

       let from = msg.key.remoteJid;
       if (from && from.includes('@lid') && msg.key.remoteJidAlt) {
           from = msg.key.remoteJidAlt;
       }

       if (from === 'status@broadcast' || from?.endsWith('@g.us') || from?.includes('@lid')) return;

       const comandosSistema = ["Listo, a partir de ahora te respondo por texto.", "Listo, a partir de ahora te respondo con audios.", "Che, el sistema esta medio colapsado en este momento."];
       let userInput = "";
       let rutaAudioLocal = "";

       if (msg.message?.audioMessage) {
           console.log(`Audio recibido del cliente, enviando a Audio Mender...`);
           const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: console });

           const nombreArchivo = `audio_${Date.now()}.ogg`;
           fs.writeFileSync(`audios/${nombreArchivo}`, buffer);
           rutaAudioLocal = `/audios/${nombreArchivo}`;

           const formData = new FormData();
           formData.append('audio', buffer, 'nota_de_voz.ogg');

           try {
               const resAudio = await axios.post('http://localhost:8000/api/transcribir', formData, {
                   headers: formData.getHeaders()
               });
               userInput = resAudio.data.text || "";
               console.log(`Texto limpio obtenido (Whisper): ${userInput}`);
           } catch (error) {
               console.error("Error en Audio Mender:", error.response?.data || error.code || error.message);
               await sock.sendMessage(from, { text: "Perdona, se me corto el audio. ¿Me lo podes escribir por favor?" });
               return;
           }
       } else {
           userInput = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
       }

       if (comandosSistema.includes(userInput) || !userInput) return;

       const numeroRaw = from.split('@')[0];
       const numeroCorto = numeroRaw.length >= 10 ? numeroRaw.slice(-10) : numeroRaw;

       try {
           const [rows] = await pool.query("SELECT * FROM clientes WHERE telefono LIKE ?", [`%${numeroCorto}%`]);
           const cliente = rows[0];
           if (!cliente) return;

           const numeroOficial = cliente.telefono;
           const jidOficial = `${numeroOficial}@s.whatsapp.net`;

           if (msg.key.fromMe) {
               const inputMin = userInput.toLowerCase();
               if (inputMin === 'modo texto') return await sock.sendMessage(from, { text: comandosSistema[0] }).then(() => preferenciasChat.set(jidOficial, 'TEXTO'));
               if (inputMin === 'modo audio') return await sock.sendMessage(from, { text: comandosSistema[1] }).then(() => preferenciasChat.set(jidOficial, 'AUDIO'));

               if (!mensajesGeneradosPorIA.has(userInput)) {
                   humanosAlMando.add(jidOficial);
                   await pool.query("INSERT INTO historial_chats (telefono_cliente, remitente, mensaje) VALUES (?, 'bot', ?)", [numeroOficial, userInput]);
               }
               return;
           }

           const mensajeParaBD = rutaAudioLocal ? `[AUDIO:${rutaAudioLocal}] ${userInput}` : userInput;
           const palabrasAgresivas = ['concha', 'puta', 'puto', 'mierda', 'hijos de', 'ladre', 'harto', 'denunciar', 'abogado'];
           const esInsulto = palabrasAgresivas.some(palabra => userInput.toLowerCase().includes(palabra));

           if (esInsulto) {
               console.log(`ALERTA ROJA Lenguaje agresivo detectado de ${cliente.nombre}`);
               humanosAlMando.add(jidOficial);
               await pool.query("UPDATE clientes SET estado_campana = 'alerta', ultima_interaccion = NOW() WHERE telefono = ?", [numeroOficial]);
           } else {
               await pool.query("UPDATE clientes SET estado_campana = 'activa', ultima_interaccion = NOW() WHERE telefono = ?", [numeroOficial]);
           }

           await pool.query("INSERT INTO historial_chats (telefono_cliente, remitente, mensaje) VALUES (?, 'cliente', ?)", [numeroOficial, mensajeParaBD]);

           if (humanosAlMando.has(jidOficial)) {
               console.log(`IA silenciada para ${cliente.nombre}`);
               return;
           }

           await procesarRespuestaIA(jidOficial, userInput, cliente, msg);

       } catch (e) {
           console.error("Error procesando mensaje:", e);
       }
   });
}

server.listen(PORT, () => {
    console.log(`Servidor backend corriendo en puerto ${PORT}`);
    connectToWhatsApp();
});