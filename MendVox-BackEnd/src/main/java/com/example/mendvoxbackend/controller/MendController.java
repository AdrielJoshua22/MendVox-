package com.example.mendvoxbackend.controller;

import com.example.mendvoxbackend.model.MendMessage;
import com.example.mendvoxbackend.service.MendService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/mend")
@CrossOrigin(originPatterns = "*", allowCredentials = "true")
public class MendController {

    @Autowired
    private MendService mendService;

    @GetMapping("/history")
    public List<MendMessage> getHistory() {
        return mendService.getAllMessages();
    }

    @PostMapping("/text")
    public Map<String, String> processText(@RequestBody Map<String, String> payload) {
        String text = payload.get("text");
        return mendService.repairText(text);
    }

    @PostMapping("/audio")
    public Map<String, String> processAudio(@RequestParam("audio") MultipartFile file) {
        return mendService.processAudioFile(file);
    }
}