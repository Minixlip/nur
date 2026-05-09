from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
import threading

import torch

from .constants import DEFAULT_CHATTERBOX_STATUS_MESSAGE


@dataclass
class SessionState:
    active_session_id: str | None = None


@dataclass
class ChatterboxRuntime:
    model: Any = None
    state: str = 'missing'
    message: str = DEFAULT_CHATTERBOX_STATUS_MESSAGE
    conditionals_cache: dict[str, Any] = field(default_factory=dict)
    conditionals_cache_keys: list[str] = field(default_factory=list)


@dataclass
class PiperRuntime:
    voice: Any = None
    loaded_path: str | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)


@dataclass
class RuntimeContext:
    device: str
    gpu_lock: threading.Lock = field(default_factory=threading.Lock)
    chatterbox_status_lock: threading.Lock = field(default_factory=threading.Lock)
    chatterbox_prepare_lock: threading.Lock = field(default_factory=threading.Lock)
    session: SessionState = field(default_factory=SessionState)
    chatterbox: ChatterboxRuntime = field(default_factory=ChatterboxRuntime)
    piper: PiperRuntime = field(default_factory=PiperRuntime)


def detect_device() -> str:
    if torch.cuda.is_available():
        return 'cuda'
    if torch.backends.mps.is_available():
        return 'mps'
    return 'cpu'


def configure_torch(device: str) -> None:
    if device != 'cuda':
        return

    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    if hasattr(torch, 'set_float32_matmul_precision'):
        torch.set_float32_matmul_precision('high')


def create_runtime_context() -> RuntimeContext:
    device = detect_device()
    configure_torch(device)
    print(f'Initializing TTS Engine on: {device.upper()}')
    return RuntimeContext(device=device)


def set_active_session(context: RuntimeContext, session_id: str) -> None:
    context.session.active_session_id = session_id


def is_request_cancelled(context: RuntimeContext, session_id: str) -> bool:
    return session_id != context.session.active_session_id


def set_chatterbox_status(
    context: RuntimeContext, state_name: str, message: str
) -> None:
    with context.chatterbox_status_lock:
        context.chatterbox.state = state_name
        context.chatterbox.message = message


def get_chatterbox_status(context: RuntimeContext) -> dict[str, Any]:
    with context.chatterbox_status_lock:
        return {
            'state': context.chatterbox.state,
            'message': context.chatterbox.message,
            'device': context.device,
            'ready': context.chatterbox.state == 'ready'
        }
