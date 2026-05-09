from __future__ import annotations

from .bootstrap import bootstrap_runtime_environment

bootstrap_runtime_environment()

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from .audio import encode_wav_bytes, trim_silence_int16
from .chatterbox_engine import (
    generate_chatterbox_audio,
    is_chatterbox_engine,
    start_chatterbox_prepare,
    validate_prepare_engine,
)
from .context import (
    create_runtime_context,
    get_chatterbox_status,
    is_request_cancelled,
    set_active_session,
)
from .piper_engine import (
    collect_piper_audio_bytes,
    ensure_piper_voice,
    iter_piper_audio_bytes,
)
from .schemas import (
    PrepareModelRequest,
    SessionControl,
    SpeakRequest,
    SummarizeRequest,
    TranslateRequest,
)
from .summarization_engine import summarize_book_text
from .translation_engine import translate_text

runtime = create_runtime_context()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
    expose_headers=['X-Sample-Rate', 'X-Audio-Encoding', 'X-Audio-Channels'],
)


@app.post('/session')
def set_session(control: SessionControl):
    set_active_session(runtime, control.session_id)
    print(f'Session updated to: {runtime.session.active_session_id}')
    return {'status': 'ok', 'active_session': runtime.session.active_session_id}


@app.get('/health')
def health_check():
    chatterbox = get_chatterbox_status(runtime)
    return {
        'status': 'ok',
        'tts_ready': True,
        'device': runtime.device,
        'chatterbox': chatterbox,
        'xtts': chatterbox,
    }


@app.get('/models/status')
def models_status():
    chatterbox = get_chatterbox_status(runtime)
    return {
        'status': 'ok',
        'device': runtime.device,
        'chatterbox': chatterbox,
        'xtts': chatterbox,
    }


@app.post('/models/prepare')
def prepare_model(request: PrepareModelRequest):
    validate_prepare_engine(request.engine)
    chatterbox = start_chatterbox_prepare(runtime)
    return {'status': 'ok', 'chatterbox': chatterbox, 'xtts': chatterbox}


@app.post('/translate')
def translate_page(request: TranslateRequest):
    translated_text = translate_text(request.text, request.target_language)
    return {
        'status': 'ok',
        'translated_text': translated_text,
        'target_language': request.target_language,
    }


@app.post('/summarize')
def summarize_book(request: SummarizeRequest):
    summary_payload = summarize_book_text(request.text, request.title, runtime.device)
    return {'status': 'ok', **summary_payload}


@app.post('/tts/stream')
def stream_piper_speech(request: SpeakRequest):
    if is_request_cancelled(runtime, request.session_id):
        print('Dropping orphaned stream request')
        raise HTTPException(status_code=499, detail='Request cancelled')

    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail='Text cannot be empty')

    if request.engine != 'piper':
        raise HTTPException(
            status_code=400, detail='Streaming is only supported for Piper'
        )

    voice = ensure_piper_voice(runtime, request.piper_model_path)

    def pcm_stream():
        try:
            for chunk_bytes in iter_piper_audio_bytes(
                runtime,
                request.text,
                request.session_id,
                request.piper_model_path,
            ):
                yield chunk_bytes
        except Exception as error:
            print(f'PIPER streaming error: {error}')
            raise

    return StreamingResponse(
        pcm_stream(),
        media_type='application/octet-stream',
        headers={
            'X-Sample-Rate': str(voice.config.sample_rate),
            'X-Audio-Encoding': 'pcm_s16le',
            'X-Audio-Channels': '1',
        },
    )


@app.post('/tts')
def generate_speech(request: SpeakRequest):
    if is_request_cancelled(runtime, request.session_id):
        print('Dropping orphaned request')
        raise HTTPException(status_code=499, detail='Request cancelled')

    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail='Text cannot be empty')

    try:
        if request.engine == 'piper':
            raw_audio, sample_rate = collect_piper_audio_bytes(
                runtime,
                request.text,
                request.session_id,
                request.piper_model_path,
            )
            audio_np = np.frombuffer(raw_audio, dtype=np.int16)
            audio_np = trim_silence_int16(audio_np, sample_rate)
            audio_data = encode_wav_bytes(audio_np, sample_rate)
        elif is_chatterbox_engine(request.engine):
            audio_data = generate_chatterbox_audio(
                runtime,
                request.text,
                request.session_id,
                request.speaker_wav,
                request.quality_mode,
            )
        else:
            raise HTTPException(status_code=400, detail='Unknown engine')

        return Response(content=audio_data, media_type='audio/wav')
    except HTTPException as error:
        raise error
    except Exception as error:
        print(f'Error: {error}')
        raise HTTPException(status_code=500, detail=str(error)) from error
