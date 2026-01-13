# -*- coding: utf-8 -*-
import os
import warnings
import threading
import torch
import numpy as np
import io
import scipy.io.wavfile
import inspect
from functools import lru_cache

from piper import PiperVoice
from TTS.api import TTS
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

# --- CONFIGURATION ---
warnings.filterwarnings("ignore", category=FutureWarning)
os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = '1'

gpu_lock = threading.Lock()

# --- STATE MANAGEMENT ---
class AppState:
    active_session_id: str = None

state = AppState()

# --- SETUP DEVICE ---
if torch.cuda.is_available():
    device = "cuda"
elif torch.backends.mps.is_available():
    device = "mps"
else:
    device = "cpu"

print(f"Initializing TTS Engine on: {device.upper()}")

# --- LOAD MODELS ---

# 1. Load XTTS (GPU/Heavy)
print("Loading XTTS Model...")
xtts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
print("XTTS Ready")

# 2. Piper State (Loaded Dynamically)
piper_voice = None
loaded_piper_path = None

def trim_silence_int16(samples, sample_rate, threshold=500, pad_ms=30):
    if samples is None or len(samples) == 0:
        return samples
    abs_samples = np.abs(samples)
    non_silent = np.where(abs_samples > threshold)[0]
    if non_silent.size == 0:
        return samples
    start = int(non_silent[0])
    end = int(non_silent[-1]) + 1
    pad = int(sample_rate * (pad_ms / 1000.0))
    start = max(0, start - pad)
    end = min(len(samples), end + pad)
    return samples[start:end]

# Warmup XTTS
print("Warming up XTTS...")
try:
    with gpu_lock:
        if os.path.exists("default_speaker.wav"):
            with torch.inference_mode():
                # Avoid autocast in warmup to prevent CUDA assert on some drivers.
                xtts_model.tts(
                    "Ready.",
                    language="en",
                    speaker_wav="default_speaker.wav",
                    speed=1.2
                )
            if device == "cuda":
                torch.cuda.synchronize()
            print("Engine is warm and ready!")
        else:
            print("Warmup skipped: 'default_speaker.wav' not found in backend folder.")
except RuntimeError as e:
    # If CUDA asserts, skip warmup so the server can still start.
    print(f"Warmup failed (skipped): {e}")

@lru_cache(maxsize=8)
def get_speaker_embedding(speaker_wav: str):
    if not speaker_wav:
        return None
    try:
        if hasattr(xtts_model, "get_conditioning_latents"):
            latents = xtts_model.get_conditioning_latents(speaker_wav=speaker_wav)
            if isinstance(latents, (list, tuple)) and len(latents) >= 2:
                return latents[0], latents[1]
            return latents
    except Exception as e:
        print(f"Speaker embed cache failed: {e}")
    return None

app = FastAPI()

# --- INPUT MODELS ---
class SessionControl(BaseModel):
    session_id: str

class SpeakRequest(BaseModel):
    text: str
    session_id: str
    engine: str = "xtts"
    speaker_wav: str = "default_speaker.wav"
    piper_model_path: str = ""
    language: str = "en"
    speed: float = 1.0

# --- ENDPOINTS ---

@app.post("/session")
def set_session(control: SessionControl):
    state.active_session_id = control.session_id
    print(f"Session updated to: {state.active_session_id}")
    return {"status": "ok", "active_session": state.active_session_id}

@app.post("/tts")
def generate_speech(request: SpeakRequest):
    global piper_voice, loaded_piper_path

    if request.session_id != state.active_session_id:
        print("Dropping orphaned request")
        raise HTTPException(status_code=499, detail="Request cancelled")

    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    try:
        audio_data = None

        # --- ENGINE: PIPER (CPU) ---
        if request.engine == "piper":
            if not request.piper_model_path or not os.path.exists(request.piper_model_path):
                print(f"Piper Error: Path not found: {request.piper_model_path}")
                raise HTTPException(status_code=400, detail="Piper model path invalid")

            if loaded_piper_path != request.piper_model_path:
                print(f"Loading Piper Model: {request.piper_model_path}")
                try:
                    piper_voice = PiperVoice.load(request.piper_model_path)
                    loaded_piper_path = request.piper_model_path
                except Exception as e:
                    print(f"Failed to load Piper: {e}")
                    raise HTTPException(status_code=500, detail=f"Failed to load Piper: {e}")

            try:
                stream = piper_voice.synthesize(request.text, None)
                raw_audio = b""

                for chunk in stream:
                    if hasattr(chunk, 'audio_int16_bytes'):
                        raw_audio += chunk.audio_int16_bytes
                    elif hasattr(chunk, 'bytes'):
                        raw_audio += chunk.bytes
                    else:
                        print(f"Unknown chunk structure: {dir(chunk)}")
                        raise Exception("Cannot extract bytes from AudioChunk")

                if len(raw_audio) == 0:
                    raise Exception("Piper generation yielded no audio data")

                audio_np = np.frombuffer(raw_audio, dtype=np.int16)
                audio_np = trim_silence_int16(audio_np, piper_voice.config.sample_rate)

                out_buf = io.BytesIO()
                scipy.io.wavfile.write(out_buf, piper_voice.config.sample_rate, audio_np)
                audio_data = out_buf.getvalue()
                out_buf.close()

            except Exception as e:
                print(f"Piper internal error: {e}")
                import traceback
                traceback.print_exc()
                raise e

        # --- ENGINE: XTTS (GPU) ---
        else:
            with gpu_lock:
                if request.session_id != state.active_session_id:
                    raise HTTPException(status_code=499, detail="Request cancelled")

                tts_kwargs = {
                    "text": request.text,
                    "language": request.language,
                    "speed": request.speed
                }

                speaker_latents = get_speaker_embedding(request.speaker_wav)
                if speaker_latents:
                    if isinstance(speaker_latents, tuple) and len(speaker_latents) == 2:
                        tts_kwargs["gpt_cond_latent"] = speaker_latents[0]
                        tts_kwargs["speaker_embedding"] = speaker_latents[1]
                    else:
                        tts_kwargs["speaker_embedding"] = speaker_latents
                else:
                    tts_kwargs["speaker_wav"] = request.speaker_wav

                # Allow XTTS to handle long text splitting internally.

                with torch.inference_mode():
                    wav_out = xtts_model.tts(**tts_kwargs)
                if device == "cuda":
                    torch.cuda.synchronize()

                wav_np = np.array(wav_out)
                wav_np = np.clip(wav_np, -1, 1)
                wav_int16 = (wav_np * 32767).astype(np.int16)
                # Avoid trimming XTTS to prevent cutting initial phonemes.
                # wav_int16 = trim_silence_int16(wav_int16, 24000)

                out_buf = io.BytesIO()
                scipy.io.wavfile.write(out_buf, 24000, wav_int16)
                audio_data = out_buf.getvalue()
                out_buf.close()

        return Response(content=audio_data, media_type="audio/wav")

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
