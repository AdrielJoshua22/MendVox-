package com.example.mendvoxbackend.service;

import com.example.mendvoxbackend.model.MendMessage;
import com.example.mendvoxbackend.repository.MendRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class MendService {

    @Autowired
    private MendRepository repository;
    @Autowired
    private VoskTranscriptionService voskService;
    @Autowired
    private LlamaInferenceService llamaService;
    @Autowired
    private TtsService ttsService;

    public List<MendMessage> getAllMessages() {
        return repository.findAllByOrderByIdDesc();
    }

    public Map<String, String> repairText(String dirtyText) {
        return processAndPackage(dirtyText);
    }

    public Map<String, String> processAudioFile(MultipartFile file) {
        try {
            String rawText = voskService.transcribeAudio(file);
            return processAndPackage(rawText);
        } catch (Exception e) {
            return Map.of("text", "Error al procesar audio: " + e.getMessage());
        }
    }

    private Map<String, String> processAndPackage(String rawText) {
        Map<String, String> responsePayload = new HashMap<>();
        try {

            String cleanText = llamaService.cleanText(rawText);

            saveToHistory(rawText, cleanText);

            responsePayload.put("text", cleanText);
            byte[] audioBytes = ttsService.generateSpeech(cleanText);

            if (audioBytes != null) {
                String base64Audio = Base64.getEncoder().encodeToString(audioBytes);
                responsePayload.put("audioBase64", base64Audio);
            }

            return responsePayload;
        } catch (Exception e) {
            responsePayload.put("text", "Error en el procesamiento: " + e.getMessage());
            return responsePayload;
        }
    }

    private void saveToHistory(String original, String repaired) {
        MendMessage msg = MendMessage.builder()
                .originalText(original)
                .repairedText(repaired)
                .build();

        repository.save(msg);
        System.out.println("💾 [MendVox-DB] Pensamiento guardado con éxito.");
    }
}