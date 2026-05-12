import 'dotenv/config';
import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import pino from "pino";
import axios from "axios";
import qrcode from "qrcode-terminal";
import express from "express";
import http from "http";
import { GoogleGenerativeAI } from "@google/generative-ai";
import xlsx from "xlsx";
import mysql from "mysql2/promise";
import cors from 'cors';


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
const preferenciasChat = new Map();
const mensajesGeneradosPorIA = new Set();
const sesionesIA = new Map();
const server = http.createServer(app);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', ({ connection, qr }) => {
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'open') console.log("[WhatsApp] MendVox Cerebro y Voz activos. Conectado a MySQL.");
    });

    app.get('/lanzar-campana', async (req, res) => {
        try {
            const workbook = xlsx.readFile('deudores.xlsx');
            const sheetName = workbook.SheetNames[0];
            const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

            res.send("Campaña iniciada con exito. Revisar terminal.");

            for (const cliente of data) {
                if (!cliente.telefono) {
                    console.log(`[Alerta] Fila ignorada. No se encontró la columna 'telefono' para:`, cliente);
                    continue;
                }

                const numeroString = cliente.telefono.toString();

                await pool.query(`
                    INSERT INTO clientes (telefono, nombre, deuda, servicio, vencimiento)
                    VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE deuda = VALUES(deuda), vencimiento = VALUES(vencimiento)
                `, [numeroString, cliente.nombre, cliente.deuda, cliente.servicio, cliente.vencimiento]);

                const numeroFormateado = `${numeroString}@s.whatsapp.net`;
                const mensajeInicial = `Hola ${cliente.nombre}, soy Matias de cobranzas de MendVox. Te escribo por el saldo pendiente de $${cliente.deuda} de tu ${cliente.servicio}. ¿Podemos coordinar el pago para esta semana?`;

                try {
                    await sock.sendMessage(numeroFormateado, { text: mensajeInicial });
                    mensajesGeneradosPorIA.add(mensajeInicial);

                    await pool.query(
                        "INSERT INTO historial_chats (telefono_cliente, remitente, mensaje) VALUES (?, 'bot', ?)",
                        [numeroString, mensajeInicial]
                    );

                    console.log(`[Campaña] Mensaje inicial enviado y guardado en BD a ${numeroString}`);
                    await delay(8000);
                } catch (error) {
                    console.error(`[Error] No se pudo enviar a ${numeroString}`);
                }
            }
        } catch (error) {
            console.error("[Campaña Error] Archivo Excel no encontrado o invalido.", error);
            if (!res.headersSent) res.status(500).send("Error procesando campaña.");
        }
    });

    app.get('/api/clientes', async (req, res) => {
            try {
                const [rows] = await pool.query("SELECT * FROM clientes");
                res.json(rows);
            } catch (error) {
                console.error("Error obteniendo clientes:", error);
                res.status(500).json({ error: "Error interno del servidor" });
            }
        });

        app.get('/api/chats/:telefono', async (req, res) => {
            const telefono = req.params.telefono;
            try {
                const [rows] = await pool.query(
                    "SELECT remitente, mensaje, fecha FROM historial_chats WHERE telefono_cliente = ? ORDER BY fecha ASC",
                    [telefono]
                );
                res.json(rows);
            } catch (error) {
                console.error(`Error obteniendo chats para ${telefono}:`, error);
                res.status(500).json({ error: "Error interno del servidor" });
            }
        });

    sock.ev.on('messages.upsert', async m => {
        if (m.type !== 'notify') return;

        const msg = m.messages[0];
        const userInput = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        const from = msg.key.remoteJid;

        const frasesDelBot = [
            "Listo, a partir de ahora te respondo por texto.",
            "Listo, a partir de ahora te respondo con audios.",
            "Che, el sistema está medio colapsado en este momento. Bancame unos minutitos y probá de nuevo."
        ];

        if (frasesDelBot.includes(userInput) || mensajesGeneradosPorIA.has(userInput)) {
            return;
        }

        if (!userInput || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid?.endsWith('@g.us')) {
            return;
        }

        const userInputLower = userInput.toLowerCase();

        if (msg.key.fromMe && userInputLower === 'modo texto') {
            preferenciasChat.set(from, 'TEXTO');
            await sock.sendMessage(from, { text: "Listo, a partir de ahora te respondo por texto." });
            return;
        }

        if (msg.key.fromMe && userInputLower === 'modo audio') {
            preferenciasChat.set(from, 'AUDIO');
            await sock.sendMessage(from, { text: "Listo, a partir de ahora te respondo con audios." });
            return;
        }

        const numeroDB = from.split('@')[0];

        try {
            const [rows] = await pool.query("SELECT * FROM clientes WHERE telefono = ?", [numeroDB]);
            const cliente = rows[0];

            if (!cliente) {
                console.log(`Bloqueado: el numero ${numeroDB} no esta en MySQL`);
                return;
            }

            await pool.query(
                "INSERT INTO historial_chats (telefono_cliente, remitente, mensaje) VALUES (?, 'cliente', ?)",
                [numeroDB, userInput]
            );

            console.log(`[Mensaje Entrante] ${cliente.nombre}: ${userInput}`);

            if (!preferenciasChat.has(from)) {
                preferenciasChat.set(from, 'TEXTO');
            }

            const estadoActual = preferenciasChat.get(from);

            let chatIA = sesionesIA.get(from);

            if (!chatIA) {
                const promptSistema = `
Sos Matias, un empleado humano del area de cobranzas de MendVox.
Estas hablando por WhatsApp con ${cliente.nombre}.

DATOS DE LA DEUDA:
- Monto adeudado: $${cliente.deuda}
- Servicio: ${cliente.servicio}
- Fecha de vencimiento: ${cliente.vencimiento}

TU OBJETIVO:
Escribirle a ${cliente.nombre} como lo haria una persona real trabajando en una oficina. Queres cobrar la deuda esta semana, ofreciendo 2 cuotas si es necesario.

REGLAS ESTRICTAS DE HUMANIZACION:
1. Habla en argentino informal pero laboral ("Hola que tal", "decime", "fijate").
2. NUNCA digas que sos un bot, una IA, un agente virtual o un sistema. Sos un empleado administrativo.
3. Tus respuestas tienen que sonar como alguien escribiendo rapido desde la pc del trabajo. Directo al punto.
4. Saluda solo la primera vez. Despues segui la charla natural.
5. Usa texto plano, sin negritas, sin asteriscos.
6. Cero emojis.
`;
                chatIA = aiModel.startChat({
                    history: [
                        { role: "user", parts: [{ text: promptSistema }] },
                        { role: "model", parts: [{ text: "Dale, arranco la charla actuando 100% como Matias de cobranzas." }] }
                    ]
                });

                sesionesIA.set(from, chatIA);
            }

            const aiResult = await chatIA.sendMessage(userInput);
            const textoFinal = aiResult.response.text();

            mensajesGeneradosPorIA.add(textoFinal);
            console.log(`[MendVox IA] Matías responde: ${textoFinal}`);

            if (estadoActual === 'TEXTO') {
                await sock.sendMessage(from, { text: textoFinal });
            } else if (estadoActual === 'AUDIO') {
                const response = await axios.post(PYTHON_BACKEND_URL,
                    { text: textoFinal },
                    {
                        responseType: 'arraybuffer',
                        timeout: 120000
                    }
                );

                if (response.data && response.data.byteLength > 5000) {
                    await sock.sendMessage(from, {
                        audio: Buffer.from(response.data),
                        mimetype: 'audio/ogg; codecs=opus',
                        ptt: true
                    }, { quoted: msg });
                }
            }

            await pool.query(
                "INSERT INTO historial_chats (telefono_cliente, remitente, mensaje) VALUES (?, 'bot', ?)",
                [numeroDB, textoFinal]
            );

        } catch (e) {
            console.error(e);
            if (e.message && (e.message.includes("429") || e.message.includes("Quota exceeded") || e.message.includes("503"))) {
                await sock.sendMessage(from, { text: "Che, el sistema está medio colapsado en este momento. Bancame unos minutitos y probá de nuevo." });
            }
        }
    });
}

server.listen(PORT, () => {
    connectToWhatsApp();
});