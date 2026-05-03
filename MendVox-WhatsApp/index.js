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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const PYTHON_BACKEND_URL = "http://localhost:8000/api/tts";
const PORT = process.env.PORT || 3000;

const app = express();
const chatsEnModoPrueba = new Set();
const preferenciasChat = new Map();
const mensajesGeneradosPorIA = new Set();
const sesionesIA = new Map();
const server = http.createServer(app);

const deudores = [
    {
        telefono: "223703539409004",
        nombre: "Adriel",
        deuda: 150000,
        servicio: "Tarjeta de Credito",
        vencimiento: "10 de Abril",
        estado: "mora"
    },
    {
        telefono: "5492216782464",
        nombre: "Adriel",
        deuda: 150000,
        servicio: "Tarjeta de Credito",
        vencimiento: "10 de Abril",
        estado: "mora"
    }
];

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
        if (connection === 'open') console.log("[WhatsApp] MendVox Cerebro y Voz activos.");
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];

        const userInput = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        const from = msg.key.remoteJid;

        console.log("Remitente:", from);
        console.log("Texto:", userInput);
        console.log("fromMe:", msg.key.fromMe);

        const frasesDelBot = [
            "Modo laboratorio activado. Hablame normal, no hace falta la contrasena. Para salir, escribi 'desactivar prueba'.",
            "Modo laboratorio cerrado.",
            "Listo, a partir de ahora te respondo por texto.",
            "Listo, a partir de ahora te respondo con audios.",
            "Che, el sistema está medio colapsado en este momento. Bancame unos minutitos y probá de nuevo."
        ];

        if (frasesDelBot.includes(userInput) || mensajesGeneradosPorIA.has(userInput)) {
            return;
        }

        if (!userInput || msg.key.remoteJid === 'status@broadcast') {
            return;
        }

        if (msg.key.remoteJid?.endsWith('@g.us')) {
            return;
        }

        const userInputLower = userInput.toLowerCase();

        if (msg.key.fromMe && userInputLower === 'activar prueba') {
            chatsEnModoPrueba.add(from);
            await sock.sendMessage(from, { text: "Modo laboratorio activado. Hablame normal, no hace falta la contrasena. Para salir, escribi 'desactivar prueba'." });
            return;
        }

        if (msg.key.fromMe && userInputLower === 'desactivar prueba') {
            chatsEnModoPrueba.delete(from);
            sesionesIA.delete(from);
            await sock.sendMessage(from, { text: "Modo laboratorio cerrado." });
            return;
        }

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

        if (msg.key.fromMe && !chatsEnModoPrueba.has(from)) {
            return;
        }

        const cliente = deudores.find(d => from && from.includes(d.telefono));

        if (!cliente) {
            console.log("Bloqueado: numero no esta en deudores");
            return;
        }

        if (!preferenciasChat.has(from)) {
            preferenciasChat.set(from, 'TEXTO');
        }

        const estadoActual = preferenciasChat.get(from);

        try {
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

        } catch (e) {
            if (e.message.includes("429") || e.message.includes("Quota exceeded") || e.message.includes("503")) {
                await sock.sendMessage(from, { text: "Che, el sistema está medio colapsado en este momento. Bancame unos minutitos y probá de nuevo." });
            }
        }
    });
}

server.listen(PORT, () => {
    connectToWhatsApp();
});