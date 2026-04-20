"""API HTTP compatível com o painel Brspark (Visão IA - Moondream): /v1/query + X-Moondream-Auth.

Moondream2 via Hugging Face Transformers em CPU. Porta padrão 8001.
"""
from __future__ import annotations

import base64
import os
import threading
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Any, Optional

import torch
import uvicorn
from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from PIL import Image, ImageFile
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM

# JPEG de câmera / uploads grandes podem vir truncados no fluxo data: URI
ImageFile.LOAD_TRUNCATED_IMAGES = True

MODEL_ID = os.environ.get("MOONDREAM_HF_MODEL", "vikhyatk/moondream2")
HOST = os.environ.get("MOONDREAM_BIND", "0.0.0.0")
PORT = int(os.environ.get("MOONDREAM_PORT", "8001"))
HTTP_TOKEN = os.environ.get("MOONDREAM_HTTP_TOKEN", "").strip()

_model: Optional[Any] = None
_load_error: Optional[str] = None
_model_lock = threading.Lock()
_security = HTTPBearer(auto_error=False)


def _require_bearer(creds: Optional[HTTPAuthorizationCredentials] = Depends(_security)) -> None:
    if not HTTP_TOKEN:
        return
    if creds is None or creds.credentials != HTTP_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _require_x_moondream_auth(request: Request) -> None:
    """Mesmo esquema da API cloud: header X-Moondream-Auth."""
    if not HTTP_TOKEN:
        return
    got = (request.headers.get("X-Moondream-Auth") or "").strip()
    if got != HTTP_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _load_model_sync() -> None:
    global _model, _load_error
    try:
        _model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            trust_remote_code=True,
            dtype=torch.float32,
            device_map="cpu",
        )
        _load_error = None
    except Exception as e:  # noqa: BLE001
        _load_error = str(e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    threading.Thread(target=_load_model_sync, daemon=True).start()
    yield


app = FastAPI(title="Moondream2 CPU API (Brspark-compatible)", version="1.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MoondreamQueryBody(BaseModel):
    """Contrato alinhado a https://api.moondream.ai/v1/query (VQA)."""

    image_url: str = Field(..., description="data:[mime];base64,...")
    question: str = Field(..., min_length=1)


def _image_from_data_uri(image_url: str) -> Image.Image:
    """Decodifica data:[mime];base64,... com tolerância a whitespace e JPEG truncado."""
    s = image_url.strip()
    if not s.startswith("data:"):
        raise HTTPException(status_code=400, detail="image_url must be a data: URI")
    try:
        comma = s.index(",")
        b64 = s[comma + 1 :]
        # Alguns clientes quebram base64 em linhas; JSON pode preservar \n
        b64 = "".join(b64.split())
        pad = len(b64) % 4
        if pad:
            b64 += "=" * (4 - pad)
        raw = base64.b64decode(b64, validate=False)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid base64 in image_url: {e}") from e

    if len(raw) < 24:
        raise HTTPException(status_code=400, detail="image data too small or empty")

    try:
        bio = BytesIO(raw)
        im = Image.open(bio)
        im.load()
        return im.convert("RGB")
    except Exception as e1:  # noqa: BLE001
        try:
            bio = BytesIO(raw)
            im = Image.open(bio, formats=["JPEG", "PNG", "WEBP", "GIF"])
            im.load()
            return im.convert("RGB")
        except Exception as e2:  # noqa: BLE001
            raise HTTPException(
                status_code=400,
                detail=f"Cannot decode image (bytes={len(raw)}): {e2}",
            ) from e2


@app.get("/health")
async def health() -> dict[str, Any]:
    if _load_error:
        return {"status": "error", "detail": _load_error}
    if _model is None:
        return {"status": "loading"}
    return {"status": "ok", "model": MODEL_ID}


@app.post("/v1/query")
async def moondream_query(body: MoondreamQueryBody, request: Request) -> dict[str, Any]:
    """Compatível com admin-panel `visionMoondreamAnalyze.js` e `integrationTester.testMoondreamVision`."""
    _require_x_moondream_auth(request)
    if _load_error:
        raise HTTPException(status_code=500, detail=_load_error)
    if _model is None:
        raise HTTPException(status_code=503, detail="Model not ready")

    image = _image_from_data_uri(body.image_url)
    q = body.question.strip()

    with _model_lock:
        out = _model.query(image, q)

    if isinstance(out, dict) and out.get("answer") is not None:
        return {"answer": str(out["answer"]).strip()}
    if isinstance(out, str):
        return {"answer": out.strip()}
    return {"answer": str(out).strip()}


@app.post("/v1/caption")
async def caption(
    file: UploadFile = File(...),
    length: str = Query("short", description="short | normal | long"),
    _: None = Depends(_require_bearer),
) -> dict[str, Any]:
    if _load_error:
        raise HTTPException(status_code=500, detail=_load_error)
    if _model is None:
        raise HTTPException(status_code=503, detail="Model not ready")
    if length not in ("short", "normal", "long"):
        raise HTTPException(status_code=400, detail="length must be short|normal|long")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        image = Image.open(BytesIO(data)).convert("RGB")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}") from e

    with _model_lock:
        out = _model.caption(image, length=length)

    if isinstance(out, dict) and "caption" in out:
        return {"caption": out["caption"], "length": length}
    return {"caption": out, "length": length}


def main() -> None:
    uvicorn.run(app, host=HOST, port=PORT, workers=1)


if __name__ == "__main__":
    main()
