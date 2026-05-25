import os
import torch
import functools
import subprocess
import numpy as np
import librosa
import whisper
import tempfile
from scipy.io import wavfile
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from TTS.api import TTS
import TTS.tts.models.xtts as xtts_module

# --- PARCHES PARA XTTS ---
old_torch_load = torch.load
@functools.wraps(old_torch_load)
def new_torch_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return old_torch_load(*args, **kwargs)
torch.load = new_torch_load

def fake_load_audio(audio_path, sr):
    audio, _ = librosa.load(audio_path, sr=sr)
    return torch.from_numpy(audio).float().unsqueeze(0)
xtts_module.load_audio = fake_load_audio

app = FastAPI()

# --- CARGA DE MODELOS ---
device = "cpu" 
print(f"Cargando XTTS v2 en {device}...")
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
print("Motor de clonacion MendVox listo y parcheado.")

print("Cargando modelo Whisper (base)...")
modelo_whisper = whisper.load_model("base")
print("Whisper listo para transcribir.")

class TextRequest(BaseModel):
    text: str

# --- RUTAS DE LA API ---

@app.post("/api/tts")
async def generate_speech(request: TextRequest):
    try:
        temp_wav = "temp_clonado.wav"
        output_ogg = "output_clonado.ogg"
        speaker_wav = "mi_voz.wav"
        
        print(f"Clonando voz para: {request.text[:40]}...")
        
        wav = tts.tts(text=request.text, speaker_wav=speaker_wav, language="es")
      
        audio_data = np.array(wav)
        audio_data = (audio_data * 32767).astype(np.int16)
        wavfile.write(temp_wav, 24000, audio_data)
        
        print("Convirtiendo audio a formato WhatsApp (OGG Opus)...")
        subprocess.run([
            "ffmpeg", "-y", "-i", temp_wav, 
            "-c:a", "libopus", output_ogg, 
            "-loglevel", "quiet"
        ], check=True)
        
        print(f"Archivo OGG generado: {os.path.getsize(output_ogg)} bytes")
        
        return FileResponse(output_ogg, media_type="audio/ogg")

    except Exception as e:
        print(f"Error capturado: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/transcribir")
async def transcribir_audio(audio: UploadFile = File(...)):
    print("Recibiendo audio para transcribir con Whisper...")
    # Creamos un archivo temporal para que Whisper lo pueda leer
    with tempfile.NamedTemporaryFile(delete=False, suffix=".ogg") as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name
        
    try:
        # Transcribimos forzando el idioma español
        resultado = modelo_whisper.transcribe(tmp_path, language="es")
        texto_limpio = resultado["text"].strip()
        print(f"Transcripción exitosa: {texto_limpio}")
        
        return {"text": texto_limpio}
    finally:
        # Nos aseguramos de borrar el archivo temporal para no llenar el disco
        if os.path.exists(tmp_path):
            os.remove(tmp_path)