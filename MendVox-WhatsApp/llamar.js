import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

client.calls.create({
    url: 'http://demo.twilio.com/docs/voice.xml', // Audio de prueba de Twilio
    to: process.env.MI_CELULAR,
    from: process.env.NUMERO_TWILIO
})
.then(call => console.log(`📞 Llamada disparada! ID: ${call.sid}`))
.catch(err => console.error('Error al llamar:', err));