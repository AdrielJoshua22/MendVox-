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
const server = http.createServer(app);

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

        console.log("Detecte algo de:", msg.key.remoteJid);
        console.log("Fui yo?:", msg.key.fromMe);

        const userInput = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        console.log("Texto extraido:", userInput);

        const frasesDelBot = [
            "Che, queres que te mande audio o te escribo?",
            "Dale, te mando audios. Que me decias?",
            "Dale, te escribo. Que me decias?",
            "Mmm, no te entendi bien. Decime 'audio' o 'texto'.",
            "Che, estoy recibiendo muchos mensajes juntos, bancame un ratito y te contesto bien.",
            "Modo laboratorio activado. Hablame normal, no hace falta la contrasena. Para salir, escribi 'desactivar prueba'.",
            "Modo laboratorio cerrado.",
            "Listo, a partir de ahora te respondo por texto.",
            "Listo, a partir de ahora te respondo con audios."
        ];

        if (frasesDelBot.includes(userInput) || mensajesGeneradosPorIA.has(userInput)) {
            console.log("Bloqueado: Es un mensaje del bot o de la IA (Filtro anti-bucle).");
            return;
        }

        if (!userInput || msg.key.remoteJid === 'status@broadcast') {
            console.log("Bloqueado por filtro de basura.");
            return;
        }

        if (msg.key.remoteJid?.endsWith('@g.us')) {
            console.log("Bloqueado por filtro de grupos.");
            return;
        }

        const userInputLower = userInput.toLowerCase();
        const from = msg.key.remoteJid;

        if (msg.key.fromMe && userInputLower === 'activar prueba') {
            chatsEnModoPrueba.add(from);
            console.log(`Modo prueba ACTIVADO para: ${from}`);
            await sock.sendMessage(from, { text: "Modo laboratorio activado. Hablame normal, no hace falta la contrasena. Para salir, escribi 'desactivar prueba'." });
            return;
        }

        if (msg.key.fromMe && userInputLower === 'desactivar prueba') {
            chatsEnModoPrueba.delete(from);
            console.log(`Modo prueba DESACTIVADO para: ${from}`);
            await sock.sendMessage(from, { text: "Modo laboratorio cerrado." });
            return;
        }

        if (msg.key.fromMe && userInputLower === 'modo texto') {
            preferenciasChat.set(from, 'TEXTO');
            console.log(`Modo cambiado a TEXTO para: ${from}`);
            await sock.sendMessage(from, { text: "Listo, a partir de ahora te respondo por texto." });
            return;
        }

        if (msg.key.fromMe && userInputLower === 'modo audio') {
            preferenciasChat.set(from, 'AUDIO');
            console.log(`Modo cambiado a AUDIO para: ${from}`);
            await sock.sendMessage(from, { text: "Listo, a partir de ahora te respondo con audios." });
            return;
        }

        if (msg.key.fromMe && !chatsEnModoPrueba.has(from)) {
            console.log("Bloqueado: Es un mensaje mio y el candado esta cerrado.");
            return;
        }

        const estadoActual = preferenciasChat.get(from);

        if (!estadoActual) {
            preferenciasChat.set(from, 'ESPERANDO');
            await sock.sendMessage(from, { text: "Che, queres que te mande audio o te escribo?" });
            console.log(`[MendVox] Preguntando preferencia a ${from}`);
            return;
        }

        if (estadoActual === 'ESPERANDO') {
            if (userInputLower.includes('audio') || userInputLower.includes('voz')) {
                preferenciasChat.set(from, 'AUDIO');
                await sock.sendMessage(from, { text: "Dale, te mando audios. Que me decias?" });
            } else if (userInputLower.includes('escrib') || userInputLower.includes('texto')) {
                preferenciasChat.set(from, 'TEXTO');
                await sock.sendMessage(from, { text: "Dale, te escribo. Que me decias?" });
            } else {
                await sock.sendMessage(from, { text: "Mmm, no te entendi bien. queres que te envie 'audio' o 'texto'." });
            } s
            return;
        }

        try {
            console.log(`[MendVox] Pensando respuesta para: ${from} (Modo: ${estadoActual})`);

            const prompt = `
Sos Adriel Joshua. Responde a este mensaje de WhatsApp de forma corta, natural y amigable.
REGLAS ESTRICTAS:
1. Escribi en espanol argentino informal (usa "vos", "tenes", "podes","dale").
2. No uses acento neutro ni palabras como "tienes" o "puedes".
3. No uses muletillas.
4. Responde con texto plano. PROHIBIDO usar asteriscos, negritas, vinetas, listas numericas o caracteres especiales.
5. PROHIBIDO usar emojis. Cero emojis.
Mensaje: "${userInput}"
`;

            const aiResult = await aiModel.generateContent(prompt);
            const textoFinal = aiResult.response.text();

            mensajesGeneradosPorIA.add(textoFinal);

            console.log(`[MendVox] Texto generado: ${textoFinal}`);

            if (estadoActual === 'TEXTO') {
                await sock.sendMessage(from, { text: textoFinal });
                console.log('[MendVox] Respuesta de TEXTO enviada con exito.');
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

                    console.log('[MendVox] Respuesta de AUDIO enviada con exito.');
                }
            }

        } catch (e) {
            if (e.message.includes("429 Too Many Requests") || e.message.includes("Quota exceeded")) {
                console.log("[MendVox] Limite de IA alcanzado. Avisando al usuario...");
                await sock.sendMessage(from, { text: "Che, estoy recibiendo muchos mensajes juntos, bancame un ratito y te contesto bien." });
            }
            else if (e.code === 'ECONNABORTED') {
                console.log("[MendVox] Python tardo demasiado en clonar la voz.");
            } else {
                console.error("[Error MendVox]", e.message);
            }
        }
    });
}

server.listen(PORT, () => {
    console.log(`[Sistema] MendVox corriendo en puerto ${PORT}`);
    connectToWhatsApp();
});