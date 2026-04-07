package com.example.mendvoxbackend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.HashMap;
import java.util.Map;

@Service
public class TtsService {

    private final HttpClient client = HttpClient.newBuilder().priority(1).build();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public byte[] generateSpeech(String text) {
        try {
            System.out.println("🗣️ [TTS Service] Pidiendo audio a Python para: " + text);

            Map<String, String> requestBody = new HashMap<>();
            requestBody.put("text", text);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("http://localhost:5000/api/tts"))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(requestBody)))
                    .build();

            HttpResponse<byte[]> response = client.send(request, HttpResponse.BodyHandlers.ofByteArray());

            System.out.println("[TTS Service] Audio recibido desde Python.");
            return response.body();

        } catch (Exception e) {
            System.err.println("[TTS Service] Error al conectar con Python: " + e.getMessage());
            return null;
        }
    }
}