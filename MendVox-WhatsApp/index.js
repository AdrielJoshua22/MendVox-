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

        console.log("Detecté algo de:", msg.key.remoteJid);
        console.log("¿Fui yo?:", msg.key.fromMe);

        const userInput = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        console.log("Texto extraído:", userInput);

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
            await sock.sendMessage(from, { text: "Modo laboratorio activado. Hablame normal, no hace falta la contraseña. Para salir, escribí 'desactivar prueba'." });
            return;
        }

        if (msg.key.fromMe && userInputLower === 'desactivar prueba') {
            chatsEnModoPrueba.delete(from);
            console.log(`Modo prueba DESACTIVADO para: ${from}`);
            await sock.sendMessage(from, { text: "Modo laboratorio cerrado." });
            return;
        }

        if (msg.key.fromMe && !chatsEnModoPrueba.has(from)) {
            console.log("Bloqueado: Es un mensaje mío y el candado está cerrado.");
            return;
        }

        try {
            console.log(`[MendVox] Pensando respuesta para: ${from}`);

const prompt = `
Sos Adriel Joshua. Respondé a este mensaje de WhatsApp de forma corta, natural y amigable.
REGLAS ESTRICTAS:
1. Escribí en español argentino informal (usá "vos", "tenés", "podés", "che", "dale").
2. No uses acento neutro ni palabras como "tienes" o "puedes".
3. No uses muletillas.
4. Respondé con texto plano. PROHIBIDO usar asteriscos, negritas, viñetas, listas numéricas o caracteres especiales.
5. PROHIBIDO usar emojis. Cero emojis.
Mensaje: "${userInput}"
`;

            const aiResult = await aiModel.generateContent(prompt);
            const textoFinal = aiResult.response.text();

            console.log(`[MendVox] Texto generado: ${textoFinal}`);

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

                console.log('[MendVox] Respuesta de voz enviada con éxito.');
            }
        } catch (e) {
            if (e.message.includes("429 Too Many Requests") || e.message.includes("Quota exceeded")) {
                console.log("[MendVox] Límite de IA alcanzado. Avisando al usuario...");
                await sock.sendMessage(from, { text: "Che, estoy recibiendo muchos mensajes juntos, bancame un ratito y te contesto bien." });
            }
            else if (e.code === 'ECONNABORTED') {
                console.log("[MendVox] Python tardó demasiado en clonar la voz.");
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