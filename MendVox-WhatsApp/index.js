import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadContentFromMessage
} from "@whiskeysockets/baileys";
import pino from "pino";
import axios from "axios";
import qrcode from "qrcode-terminal";
import FormData from "form-data";
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";

const NGROK_URL = "https://unmotherly-decenary-bambi.ngrok-free.dev";
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
    res.setHeader('ngrok-skip-browser-warning', 'true');
    next();
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.all('/incoming-call', (req, res) => {
    console.log(`[Telefonía] Petición recibida con método: ${req.method}`);
    res.type('text/xml');
    res.send(`
      <Response>
        <Connect>
          <Stream url="wss://${req.headers.host}/audio-stream" />
        </Connect>
        <Say language="es-ES">Conexión exitosa. MendVox escuchando.</Say>
        <Pause length="40"/>
      </Response>
    `);
});
wss.on('connection', (ws) => {
    console.log('[Telefonía] WebSocket conectado para streaming de audio.');

    ws.on('message', (message) => {
        const msg = JSON.parse(message);

        switch (msg.event) {
            case 'connected':
                console.log('[Telefonía] Protocolo conectado.');
                break;
            case 'start':
                console.log(`[Telefonía] Iniciando recepción de audio (Stream ID: ${msg.start.streamSid})`);
                break;
            case 'media':
                const audioChunk = msg.media.payload;
                break;
            case 'stop':
                console.log('[Telefonía] Llamada finalizada.');
                break;
        }
    });

    ws.on('close', () => console.log('[Telefonía] WebSocket cerrado.'));
});

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

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('Escanea el QR para conectar WhatsApp:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log("[WhatsApp] MendVox conectado");
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        if (msg.key.fromMe && !msg.message.audioMessage) return;

        if (msg.message.audioMessage) {
            try {
                console.log('[WhatsApp] Audio recibido, procesando...');
                const stream = await downloadContentFromMessage(msg.message.audioMessage, 'audio');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

                const form = new FormData();
                form.append('audio', buffer, { filename: 'voice.ogg', contentType: 'audio/ogg' });

            const response = await axios.post('http://localhost:8000/api/tts', {
                text: "Hola, soy MendVox, recibí tu audio pero todavía estoy aprendiendo a escucharlo. Por ahora te respondo con mi voz clonada."
            });

                await sock.sendMessage(from, { text: `Pensamiento: ${response.data.text}` });

                if (response.data.audioBase64) {
                    await sock.sendMessage(from, {
                        audio: Buffer.from(response.data.audioBase64, 'base64'),
                        mimetype: 'audio/mp4',
                        ptt: true
                    });
                }
            } catch (e) {
                console.log("[WhatsApp] Error:", e.message);
            }
        }
    });
}

server.listen(PORT, () => {
    console.log(`[Sistema] Servidor unificado escuchando en puerto ${PORT}`);
    connectToWhatsApp();
});