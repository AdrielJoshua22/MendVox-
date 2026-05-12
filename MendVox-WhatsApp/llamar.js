import twilio from 'twilio';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const app = express();
const port = 3001;
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Pegá acá el link que te dio la terminal de Ngrok
const NGROK_URL = 'https://unmotherly-decenary-bambi.ngrok-free.dev';

// 1. El Webhook: Twilio va a consultar esta ruta exacta en el milisegundo que vos atiendas la llamada
app.post('/twiml', (req, res) => {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    // Por ahora le hacemos leer un texto en español para probar la conexión
    twiml.say({ voice: 'alice', language: 'es-MX' }, 'Hola Adriel. El puente entre Twilio y tu servidor local está funcionando a la perfección.');

    res.type('text/xml');
    res.send(twiml.toString());
});

// 2. Levantamos el servidor y disparamos la llamada
app.listen(port, () => {
    console.log(`Servidor de llamadas escuchando en puerto ${port}`);

    client.calls.create({
        url: `${NGROK_URL}/twiml`,
        to: process.env.MI_CELULAR,
        from: process.env.NUMERO_TWILIO
    })
    .then(call => console.log(`Llamada disparada! ID: ${call.sid}`))
    .catch(err => console.error('Error al llamar:', err));
});