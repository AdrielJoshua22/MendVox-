import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadContentFromMessage
} from "@whiskeysockets/baileys";
import pino from "pino";
import axios from "axios";
import qrcode from "qrcode-terminal";
import fs from "fs";
import FormData from "form-data";

const NGROK_URL = "https://unmotherly-decenary-bambi.ngrok-free.dev";

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: "silent" }),
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log("MendVox conectado a WhatsApp!");
        }
    });

    sock.ev.on('messages.upsert', async m => {
            const msg = m.messages[0];
            if (!msg.message) return;
            const from = msg.key.remoteJid;

            console.log("¡ENTRÓ ALGO! De:", from, " ¿Es mío?:", msg.key.fromMe);

            // Si el mensaje es mío Y NO ES un audio, lo ignoro (Evita loops de texto)
            if (msg.key.fromMe && !msg.message.audioMessage) return;

            if (msg.message.audioMessage) {
                console.log("PROCESANDO AUDIO...");
                try {
                    const stream = await downloadContentFromMessage(msg.message.audioMessage, 'audio');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

                    const form = new FormData();
                    form.append('audio', buffer, { filename: 'voice.ogg', contentType: 'audio/ogg' });

                    const response = await axios.post(`${NGROK_URL}/api/v1/mend/audio`, form, {
                        headers: { ...form.getHeaders() }
                    });

                    console.log("Java respondió:", response.data.text);

                    await sock.sendMessage(from, { text: ` Pensamiento: ${response.data.text}` });

                    if (response.data.audioBase64) {
                        await sock.sendMessage(from, {
                            audio: Buffer.from(response.data.audioBase64, 'base64'),
                            mimetype: 'audio/mp4',
                            ptt: true
                        });
                        console.log("Audio enviado al celu.");
                    }
                } catch (e) {
                    console.log("Error en el puente:", e.message);
                }
            }
        });
}

connectToWhatsApp();