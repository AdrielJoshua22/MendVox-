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
app.use(express.json());
const preferenciasChat = new Map();
const mensajesGeneradosPorIA = new Set();
const sesionesIA = new Map();
const server = http.createServer(app);

let sock;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.get('/lanzar-campana', async (req, res) => {
    try {
        const workbook = xlsx.readFile('deudores.xlsx');
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        for (const cliente of data) {
            if (!cliente.telefono) continue;

            const numeroString = cliente.telefono.toString();

            await pool.query(`
                INSERT INTO clientes (telefono, nombre, deuda, servicio, vencimiento, estado_campana)
                VALUES (?, ?, ?, ?, ?, 'pendiente')
                ON DUPLICATE KEY UPDATE deuda = VALUES(deuda), vencimiento = VALUES(vencimiento), estado_campana = 'pendiente'
            `, [numeroString, cliente.nombre, cliente.deuda, cliente.servicio, cliente.vencimiento]);
        }
        res.send("Campaña cargada con éxito. El motor en segundo plano comenzará a enviar los mensajes.");
        console.log("[Campaña] Base de datos actualizada. Clientes en cola.");
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

async function motorDeCampana() {
    if (!sock) return;

    try {
        await pool.query(`
            UPDATE clientes
            SET estado_campana = 'pausada'
            WHERE estado_campana = 'activa'
            AND ultima_interaccion < NOW() - INTERVAL 10 MINUTE
        `);

        const [activos] = await pool.query("SELECT COUNT(*) as total FROM clientes WHERE estado_campana = 'activa'");
        const conversacionesActivas = activos[0].total;
        const cuposDisponibles = 10 - conversacionesActivas;

        if (cuposDisponibles > 0) {
            const [pendientes] = await pool.query("SELECT * FROM clientes WHERE estado_campana = 'pendiente' LIMIT ?", [cuposDisponibles]);

            if (pendientes.length > 0) {
                console.log(`[Motor] Hay ${cuposDisponibles} lugares. Despertando a ${pendientes.length} clientes nuevos...`);
            }

            for (const cliente of pendientes) {
                const numeroFormateado = `${cliente.telefono}@s.whatsapp.net`;
                const mensajeInicial = `Hola ${cliente.nombre}, soy Matias de cobranzas de MendVox. Te escribo por el saldo pendiente de $${cliente.deuda} de tu ${cliente.servicio}. ¿Podemos coordinar el pago para esta semana?`;

                const pausaAleatoria = Math.floor(Math.random() * (28000 - 12000 + 1)) + 12000;
                await delay(pausaAleatoria);

                try {
                    await sock.sendMessage(numeroFormateado, { text: mensajeInicial });
                    mensajesGeneradosPorIA.add(mensajeInicial);

                    await pool.query(
                        "INSERT INTO historial_chats (telefono_cliente, remitente, mensaje) VALUES (?, 'bot', ?)",
                        [cliente.telefono, mensajeInicial]
                    );
                    await pool.query(
                        "UPDATE clientes SET estado_campana = 'activa', ultima_interaccion = NOW() WHERE telefono = ?",
                        [cliente.telefono]
                    );

                    console.log(`[Motor] Mensaje enviado a ${cliente.nombre}.`);
                } catch (error) {
                    console.error(`[Error Motor] No se pudo contactar a ${cliente.telefono}`, error);
                }
            }
        }
    } catch (error) {
        console.error("[Error Fatal del Motor]:", error);
    }
}

setInterval(motorDeCampana, 60000);

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
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
                "UPDATE clientes SET estado_campana = 'activa', ultima_interaccion = NOW() WHERE telefono = ?", [numeroDB]
            );

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
Sos Joshua, del area de cobranzas de MendVox.
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

app.post('/api/campana/disparar', async (req, res) => {
    console.log("\n--> [Disparo Manual] Petición recibida desde React!");
    const { telefonos } = req.body;
    console.log("--> Teléfonos seleccionados:", telefonos);

    if (!telefonos || telefonos.length === 0) {
        return res.status(400).json({ error: "No se seleccionaron clientes" });
    }

    try {
        const placeholders = telefonos.map(() => '?').join(',');
        console.log("--> Buscando clientes en MySQL...");
        const [clientes] = await pool.query(`SELECT * FROM clientes WHERE telefono IN (${placeholders})`, telefonos);
        console.log(`--> Se encontraron ${clientes.length} clientes en la base de datos.`);

        for (const cliente of clientes) {
            if (cliente.estado_campana === 'activa') {
                console.log(`--> ${cliente.nombre} ya está activo. Saltando...`);
                continue;
            }

            const numeroFormateado = `${cliente.telefono}@s.whatsapp.net`;
            const mensajeInicial = `Hola ${cliente.nombre}, soy Matias de cobranzas de MendVox. Te escribo por el saldo pendiente de $${cliente.deuda} de tu ${cliente.servicio}. ¿Podemos coordinar el pago para esta semana?`;

            console.log(`--> Intentando enviar WhatsApp a: ${numeroFormateado} ... (Si se traba acá, es un problema del número)`);

            try {
                // ACA ES DONDE SUELE COLGARSE SI EL NUMERO ESTÁ MAL
                await sock.sendMessage(numeroFormateado, { text: mensajeInicial });
                console.log(`--> ¡WhatsApp enviado con éxito a ${cliente.nombre}!`);

                mensajesGeneradosPorIA.add(mensajeInicial);

                await pool.query(
                    "INSERT INTO historial_chats (telefono_cliente, remitente, mensaje) VALUES (?, 'bot', ?)",
                    [cliente.telefono, mensajeInicial]
                );
                await pool.query(
                    "UPDATE clientes SET estado_campana = 'activa', ultima_interaccion = NOW() WHERE telefono = ?",
                    [cliente.telefono]
                );

            } catch (error) {
                console.error(`[Error Disparo] Falló el envío a ${cliente.telefono}:`, error);
            }

            await delay(3000);
        }

        console.log("--> Finalizó el proceso. Respondiendo a React (¡Acá desaparece el 'Enviando...')!");
        res.json({ success: true, message: "Mensajes disparados correctamente" });
    } catch (error) {
        console.error("Error grave en el disparo manual:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
server.listen(PORT, () => {
    connectToWhatsApp();
});