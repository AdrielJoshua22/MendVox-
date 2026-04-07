import os
import torch
import functools
import numpy as np
import librosa
from scipy.io import wavfile

old_torch_load = torch.load
@functools.wraps(old_torch_load)
def new_torch_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return old_torch_load(*args, **kwargs)
torch.load = new_torch_load

import TTS.tts.models.xtts as xtts_module
def fake_load_audio(audio_path, sr):
    audio, _ = librosa.load(audio_path, sr=sr)
    return torch.from_numpy(audio).float().unsqueeze(0)
xtts_module.load_audio = fake_load_audio

from fastapi import FastAPI
from fastapi.responses import FileResponse
from pydantic import BaseModel
from TTS.api import TTS

app = FastAPI()

device = "cpu" 
print(f"⏳ Cargando XTTS v2 en {device}...")
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
print("Motor de clonación MendVox listo y parcheado.")

class TextRequest(BaseModel):
    text: str

@app.post("/api/tts")
async def generate_speech(request: TextRequest):
    try:
        output_path = "output_clonado.wav"
        speaker_wav = "mi_voz.wav"
        
        print(f"🎙️ Clonando voz para: {request.text[:30]}...")
        wav = tts.tts(text=request.text, speaker_wav=speaker_wav, language="es")
      
        audio_data = np.array(wav)
        audio_data = (audio_data * 32767).astype(np.int16)
        wavfile.write(output_path, 24000, audio_data)
        
        print(f"¡POR FIN! Archivo generado: {os.path.getsize(output_path)} bytes")
        return FileResponse(output_path, media_type="audio/wav")

    except Exception as e:
        print(f"Error capturado: {str(e)}")
        return {"error": str(e)}