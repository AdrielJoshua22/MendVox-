import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import express from "express";
import http from "http";

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);

app.use(express.urlencoded({ extended: false }));

// Webhook para Twilio (Lo dejamos listo por si entra llamada)
app.all('/incoming-call', (req, res) => {
    res.type('text/xml');
    res.send(`<Response><Say language="es-ES">MendVox texto activo.</Say></Response>`);
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
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log("[WhatsApp] MendVox conectado en MODO TEXTO.");
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe || msg.key.remoteJid.includes('status')) return;

        const from = msg.key.remoteJid;
        const userInput = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (userInput) {
            console.log(`[Mensaje] De: ${from} - Contenido: ${userInput}`);

            try {
                // Simulamos una respuesta lógica.
                // Después acá podemos conectar con una API de IA (como Gemini o GPT).
                let respuestaTexto = "¡Hola! Soy MendVox, la IA de Adriel. Estoy en modo mantenimiento (Texto). En breve te responderé.";

                if (userInput.toLowerCase().includes("precio")) {
                    respuestaTexto = "Hola, Adriel me comentó que estás consultando por el precio. Ya mismo le aviso para que te pase el detalle.";
                }

                await sock.sendMessage(from, { text: respuestaTexto }, { quoted: msg });
                console.log('[MendVox] Respuesta de texto enviada.');

            } catch (e) {
                console.error("[Error]", e.message);
            }
        }
    });
}

server.listen(PORT, () => {
    console.log(`[Sistema] Servidor en puerto ${PORT}`);
    connectToWhatsApp();
});