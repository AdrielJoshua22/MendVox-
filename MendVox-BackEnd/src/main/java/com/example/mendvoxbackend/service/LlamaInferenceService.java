package com.example.mendvoxbackend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.HashMap;
import java.util.Map;

@Service
public class LlamaInferenceService {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient client = HttpClient.newBuilder().priority(1).build();

    public String cleanText(String dirtyText) {
        try {
            System.out.println("[Llama Service] Limpiando texto...");

            Map<String, Object> bodyMap = new HashMap<>();
            bodyMap.put("model", "llama3.1");
            bodyMap.put("prompt", "Corrige muletillas y haz este texto amigable y directo. Solo devuelve el resultado final: " + dirtyText);
            bodyMap.put("stream", false);

            Map<String, Object> options = new HashMap<>();
            options.put("temperature", 0.1);
            options.put("num_predict", 150);
            bodyMap.put("options", options);

            String jsonBody = objectMapper.writeValueAsString(bodyMap);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("http://localhost:11434/api/generate"))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            JsonNode rootNode = objectMapper.readTree(response.body());

            if (rootNode.has("error")) {
                throw new RuntimeException("Error de Ollama: " + rootNode.get("error").asText());
            }

            return rootNode.path("response").asText().trim();

        } catch (Exception e) {
            e.printStackTrace();
            throw new RuntimeException("Error al procesar con Llama: " + e.getMessage());
        }
    }
}