import 'dotenv/config';
import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} from "@whiskeysockets/baileys";
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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

const PYTHON_BACKEND_URL = "http://localhost:8000/api/tts";
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());
const preferenciasChat = new Map();
const mensajesGeneradosPorIA = new Set();
const sesionesIA = new Map();
const server = http.createServer(app);
const upload = multer({ dest: 'uploads/' });

let sock;
let isSocketConnected = false;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function procesarEnvioCampana(cliente) {
    const numeroFormateado = `${cliente.telefono}@s.whatsapp.net`;
    const mensajeInicial = `Hola ${cliente.nombre}, soy Joshua del área de cobranzas de MendVox. Te escribo por el saldo pendiente de $${cliente.deuda} de tu ${cliente.servicio}. ¿Podemos coordinar el pago para esta semana?`;

    try {
        await sock.sendMessage(numeroFormateado, { text: mensajeInicial });
        mensajesGeneradosPorIA.add(mensajeInicial);
        await pool.query("INSERT INTO historial_chats (telefono_cliente, remitente, mensaje) VALUES (?, 'bot', ?)", [cliente.telefono, mensajeInicial]);
        await pool.query("UPDATE clientes SET estado_campana = 'activa', ultima_interaccion = NOW() WHERE telefono = ?", [cliente.telefono]);
        console.log(`Mensaje enviado a ${cliente.nombre}`);
        return true;
    } catch (error) {
        console.error(`Fallo envio a ${cliente.telefono}:`, error.message);
        return false;
    }
}

app.get('/api/clientes', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM clientes");
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
});

app.get('/api/chats/:telefono', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT remitente, mensaje, fecha FROM historial_chats WHERE telefono_cliente = ? ORDER BY fecha ASC", [req.params.telefono]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
});

app.get('/api/metricas', async (req, res) => {
    try {
        const [resultDeuda] = await pool.query("SELECT SUM(deuda) as total FROM clientes");
        const [resultContactados] = await pool.query("SELECT COUNT(*) as total FROM clientes WHERE estado_campana != 'pendiente'");
        const [resultActivos] = await pool.query("SELECT COUNT(*) as total FROM clientes WHERE estado_campana = 'activa'");

        res.json({
            totalDeuda: Number(resultDeuda[0].total || 0),
            contactados: resultContactados[0].total || 0,
            activos: resultActivos[0].total || 0
        });
    } catch (error) {
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
            const { telefono, nombre, deuda, servicio, vencimiento } = fila;
            if (!telefono || !nombre) continue;

            await pool.query(`
                INSERT INTO clientes (telefono, nombre, deuda, servicio, vencimiento, estado_campana)
                VALUES (?, ?, ?, ?, ?, 'pendiente')
                ON DUPLICATE KEY UPDATE deuda = ?, servicio = ?, vencimiento = ?, estado_campana = 'pendiente'
            `, [telefono.toString(), nombre, deuda || 0, servicio || 'General', vencimiento || null, deuda || 0, servicio || 'General', vencimiento || null]);
            procesados++;
        }

        fs.unlinkSync(req.file.path);
        res.json({ success: true, message: `Cargados: ${procesados}` });
    } catch (error) {
        res.status(500).json({ error: "Error procesando Excel" });
    }
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
            if (cliente.estado_campana === 'activa') continue;

            await procesarEnvioCampana(cliente);
            await delay(3000);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
});

async function motorDeCampana() {
    if (!sock || !isSocketConnected) return;

    try {
        await pool.query("UPDATE clientes SET estado_campana = 'pausada' WHERE estado_campana = 'activa' AND ultima_interaccion < NOW() - INTERVAL 10 MINUTE");
        const [activos] = await pool.query("SELECT COUNT(*) as total FROM clientes WHERE estado_campana = 'activa'");
        const cupos = 10 - activos[0].total;

        if (cupos > 0) {
            const [pendientes] = await pool.query("SELECT * FROM clientes WHERE estado_campana = 'pendiente' LIMIT ?", [cupos]);
            for (const cliente of pendientes) {
                if (!isSocketConnected) break;
                await delay(Math.floor(Math.random() * 16000) + 12000);
                await procesarEnvioCampana(cliente);
            }
        }
    } catch (error) {
        console.error(error);
    }
}

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
            } else {
                console.log('Desvinculado. Borrar auth_info_baileys');
            }
        }
    });

    sock.ev.on('messages.upsert', async m => {
        if (!isSocketConnected || m.type !== 'notify') return;

        const msg = m.messages[0];
        const userInput = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        const from = msg.key.remoteJid;

        const frasesDelBot = [
            "Listo, a partir de ahora te respondo por texto.",
            "Listo, a partir de ahora te respondo con audios.",
            "Che, el sistema está medio colapsado en este momento. Bancame unos minutitos y probá de nuevo."
        ];

        if (frasesDelBot.includes(userInput) || mensajesGeneradosPorIA.has(userInput) || !userInput || from === 'status@broadcast' || from?.endsWith('@g.us')) return;

        const userInputLower = userInput.toLowerCase();

        if (msg.key.fromMe && userInputLower === 'modo texto') {
            preferenciasChat.set(from, 'TEXTO');
            await sock.sendMessage(from, { text: frasesDelBot[0] });
            return;
        }

        if (msg.key.fromMe && userInputLower === 'modo audio') {
            preferenciasChat.set(from, 'AUDIO');
            await sock.sendMessage(from, { text: frasesDelBot[1] });
            return;
        }

        const numeroDB = from.split('@')[0];

        try {
            const [rows] = await pool.query("SELECT * FROM clientes WHERE telefono = ?", [numeroDB]);
            const cliente = rows[0];

            if (!cliente) return;

            await pool.query("UPDATE clientes SET estado_campana = 'activa', ultima_interaccion = NOW() WHERE telefono = ?", [numeroDB]);
            await pool.query("INSERT INTO historial_chats (telefono_cliente, remitente, mensaje) VALUES (?, 'cliente', ?)", [numeroDB, userInput]);

            if (!preferenciasChat.has(from)) preferenciasChat.set(from, 'TEXTO');
            const estadoActual = preferenciasChat.get(from);

            let chatIA = sesionesIA.get(from);

            if (!chatIA) {
                chatIA = aiModel.startChat({
                    history: [
                        { role: "user", parts: [{ text: `Sos Joshua, del area de cobranzas de MendVox. Estas hablando por WhatsApp con ${cliente.nombre}.\nDATOS: Monto: $${cliente.deuda}, Servicio: ${cliente.servicio}, Vence: ${cliente.vencimiento}\nOBJETIVO: Escribirle como una persona real en una oficina. Queres cobrar esta semana, ofreciendo 2 cuotas.\nREGLAS: Habla en argentino informal pero laboral. NUNCA digas que sos un bot. Directo al punto. Saluda solo la primera vez. Usa texto plano. Cero emojis.` }] },
                        { role: "model", parts: [{ text: "Dale, arranco la charla actuando 100% como Joshua de cobranzas." }] }
                    ]
                });
                sesionesIA.set(from, chatIA);
            }

            const aiResult = await chatIA.sendMessage(userInput);
            const textoFinal = aiResult.response.text();

            mensajesGeneradosPorIA.add(textoFinal);

            if (estadoActual === 'TEXTO') {
                await sock.sendMessage(from, { text: textoFinal });
            } else if (estadoActual === 'AUDIO') {
                const response = await axios.post(PYTHON_BACKEND_URL, { text: textoFinal }, { responseType: 'arraybuffer', timeout: 120000 });
                if (response.data && response.data.byteLength > 5000) {
                    await sock.sendMessage(from, { audio: Buffer.from(response.data), mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
                }
            }

            await pool.query("INSERT INTO historial_chats (telefono_cliente, remitente, mensaje) VALUES (?, 'bot', ?)", [numeroDB, textoFinal]);

        } catch (e) {
            if (e.message && (e.message.includes("429") || e.message.includes("Quota") || e.message.includes("503"))) {
                await sock.sendMessage(from, { text: frasesDelBot[2] });
            }
        }
    });
}

server.listen(PORT, () => {
    connectToWhatsApp();
});