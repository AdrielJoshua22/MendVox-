import 'dotenv/config';

async function verModelos() {
    const apiKey = process.env.GEMINI_API_KEY.trim();
    // Le pegamos directo a la API de Google sin intermediarios
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    console.log("🔍 Consultando los servidores de Google...");

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("❌ Error de permisos de Google:", data.error.message);
            return;
        }

        console.log("✅ Tu API Key tiene acceso a estos modelos:");
        // Filtramos para que solo muestre los nombres limpios
        const nombresModelos = data.models.map(m => m.name.replace('models/', ''));
        console.log(nombresModelos.join('\n'));

    } catch (error) {
        console.error("❌ Falló la conexión HTTP:", error.message);
    }
}

verModelos();