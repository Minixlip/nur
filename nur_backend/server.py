# -*- coding: utf-8 -*-
from nur_tts_backend.app import app


if __name__ == '__main__':
    import os
    import uvicorn

    host = os.environ.get('NUR_BACKEND_HOST', '127.0.0.1')
    port = int(os.environ.get('NUR_BACKEND_PORT', '8000'))
    uvicorn.run(app, host=host, port=port)
