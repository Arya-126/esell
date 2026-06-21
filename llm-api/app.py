"""
Self-hosted LLM inference API (FastAPI + HuggingFace Transformers).

A small, owned alternative to a hosted LLM. The ReWear AI assistant's
CustomHTTPLLM provider calls POST /generate with {system, user} and reads
{text}. Model + tokenizer are loaded once at startup and reused.

Default model is google/flan-t5-base (seq2seq, CPU-friendly). Set MODEL_TYPE=causal
plus a causal MODEL_NAME (e.g. Qwen2.5-1.5B-Instruct) for a chat-style model.
"""
from __future__ import annotations

import threading

from fastapi import FastAPI
from pydantic import BaseModel, Field

from config import settings

app = FastAPI(title="ReWear LLM API", version="1.0.0")

_lock = threading.Lock()  # transformers generate() isn't reentrant; serialise calls
_tokenizer = None
_model = None
_generate = None  # set at startup to the type-specific function


def _load() -> None:
    global _tokenizer, _model, _generate
    import torch
    from transformers import AutoTokenizer

    name = settings.model_name
    _tokenizer = AutoTokenizer.from_pretrained(name)

    if settings.model_type == "causal":
        from transformers import AutoModelForCausalLM
        _model = AutoModelForCausalLM.from_pretrained(name, torch_dtype="auto")
        if _tokenizer.pad_token_id is None:
            _tokenizer.pad_token = _tokenizer.eos_token

        def gen(system: str, user: str, max_new_tokens: int) -> str:
            messages = [{"role": "system", "content": system or ""},
                        {"role": "user", "content": user or " "}]
            prompt = _tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            inputs = _tokenizer(prompt, return_tensors="pt", truncation=True, max_length=2048)
            with torch.no_grad():
                out = _model.generate(
                    **inputs, max_new_tokens=max_new_tokens,
                    do_sample=settings.temperature > 0, temperature=max(settings.temperature, 1e-4),
                    pad_token_id=_tokenizer.pad_token_id,
                )
            return _tokenizer.decode(out[0][inputs.input_ids.shape[1]:], skip_special_tokens=True).strip()
    else:  # text2text (T5 / Flan)
        from transformers import AutoModelForSeq2SeqLM
        _model = AutoModelForSeq2SeqLM.from_pretrained(name)

        def gen(system: str, user: str, max_new_tokens: int) -> str:
            prompt = f"{system}\n\n{user}".strip()
            inputs = _tokenizer(prompt, return_tensors="pt", truncation=True, max_length=1024)
            with torch.no_grad():
                out = _model.generate(
                    **inputs, max_new_tokens=max_new_tokens,
                    do_sample=settings.temperature > 0, temperature=max(settings.temperature, 1e-4),
                )
            return _tokenizer.decode(out[0], skip_special_tokens=True).strip()

    _generate = gen


@app.on_event("startup")
def startup() -> None:
    _load()
    print(f"[LLM-API] loaded {settings.model_name} ({settings.model_type})")


class GenerateRequest(BaseModel):
    system: str = Field("", max_length=8000)
    user: str = Field("", max_length=8000)
    max_new_tokens: int | None = Field(None, ge=1, le=1024)


class GenerateResponse(BaseModel):
    text: str


@app.get("/health")
def health() -> dict:
    return {"ok": _model is not None, "model": settings.model_name, "type": settings.model_type}


@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest) -> GenerateResponse:
    if _generate is None:
        return GenerateResponse(text="")
    n = req.max_new_tokens or settings.max_new_tokens
    with _lock:
        text = _generate(req.system, req.user, n)
    return GenerateResponse(text=text)
