package com.example.mendvoxbackend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.vosk.Model;
import org.vosk.Recognizer;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

@Service
public class VoskTranscriptionService {

    private Model voskModel;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Ahora la ruta se puede configurar desde application.properties
    @Value("${vosk.model.path:/Users/adrieljoshua/IdeaProjects/MendVox/MendVox-BackEnd/src/main/resources/vosk-model}")
    private String modelPath;

    @PostConstruct
    public void init() {
        try {
            if (!Files.exists(Path.of(modelPath))) {
                throw new FileNotFoundException("Modelo Vosk no encontrado en: " + modelPath);
            }
            this.voskModel = new Model(modelPath);
            System.out.println("✅ [Vosk Service] Modelo cargado exitosamente en M4.");
        } catch (Exception e) {
            System.err.println("❌ [Vosk Service] Error fatal al cargar el modelo: " + e.getMessage());
        }
    }

    public String transcribeAudio(MultipartFile file) {
        validateModel();

        Path tempOgg = null;
        Path tempWav = null;

        try {
            // 1. Creamos archivos temporales con nombres únicos (evita colisiones)
            String sessionId = UUID.randomUUID().toString();
            tempOgg = Files.createTempFile("wa_" + sessionId, ".ogg");
            tempWav = Files.createTempFile("conv_" + sessionId, ".wav");

            file.transferTo(tempOgg.toFile());

            // 2. Ejecutamos la conversión
            convertOggToWav(tempOgg, tempWav);

            // 3. Procesamos el resultado con Vosk
            return performTranscription(tempWav);

        } catch (Exception e) {
            System.err.println("❌ Error en el proceso: " + e.getMessage());
            throw new RuntimeException("Fallo en la transcripción: " + e.getMessage());
        } finally {
            cleanup(tempOgg, tempWav);
        }
    }

    private void convertOggToWav(Path input, Path output) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(
                "ffmpeg", "-y", "-i", input.toString(),
                "-ar", "16000", "-ac", "1", "-f", "wav", output.toString()
        );

        pb.redirectErrorStream(true);
        Process process = pb.start();

        // Leemos el output para asegurar que el proceso no se bloquee
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            while (reader.readLine() != null) { /* Consumir logs si es necesario */ }
        }

        if (process.waitFor() != 0) {
            throw new RuntimeException("FFmpeg falló en la conversión.");
        }
    }

    private String performTranscription(Path wavPath) throws Exception {
        try (InputStream ais = new FileInputStream(wavPath.toFile());
             Recognizer recognizer = new Recognizer(voskModel, 16000)) {

            byte[] buffer = new byte[4096];
            int nbytes;
            while ((nbytes = ais.read(buffer)) >= 0) {
                recognizer.acceptWaveForm(buffer, nbytes);
            }

            JsonNode rootNode = objectMapper.readTree(recognizer.getFinalResult());
            String text = rootNode.path("text").asText().trim();

            System.out.println("🗣️ [Vosk] Resultado: " + (text.isEmpty() ? "(silencio)" : text));

            if (text.isEmpty()) throw new RuntimeException("No se detectó voz.");
            return text;
        }
    }

    private void validateModel() {
        if (voskModel == null) throw new RuntimeException("Modelo no inicializado.");
    }

    private void cleanup(Path... paths) {
        for (Path p : paths) {
            if (p != null) {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {}
            }
        }
    }
}