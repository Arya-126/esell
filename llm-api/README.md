# ReWear LLM API — self-hosted inference server

A small, **owned** LLM endpoint (FastAPI + HuggingFace Transformers) that replaces the
hosted Gemini API for the ReWear AI assistant. The assistant's `CustomHTTPLLM` provider
calls it; everything else (routing graph, retrieval, embeddings) is unchanged.

## API

- `POST /generate` — body `{ "system": "...", "user": "...", "max_new_tokens": 256 }`
  → `{ "text": "..." }`
- `GET /health` → `{ ok, model, type }`

## Model

Default **`google/flan-t5-base`** (~250M, instruction-tuned, seq2seq, CPU-friendly) — a
good fit for the assistant's short structured tasks (route classification, yes/no
grading, query rewrite, grounded answers). Configure via env (see `.env.example`):

| Env | Default | Notes |
|---|---|---|
| `MODEL_NAME` | `google/flan-t5-base` | any HF model id |
| `MODEL_TYPE` | `text2text` | `text2text` (T5/Flan) or `causal` (Llama/Qwen/Phi) |
| `MAX_NEW_TOKENS` | `256` | |
| `TEMPERATURE` | `0.3` | 0 = greedy |

Lighter: `google/flan-t5-small`. Better answers (more RAM, slower on CPU):
`Qwen/Qwen2.5-1.5B-Instruct` with `MODEL_TYPE=causal`.

## Run locally

```bash
cd llm-api
python -m venv .venv && .venv\Scripts\activate     # Windows
pip install -r requirements.txt
uvicorn app:app --port 8001
```

Then point the assistant at it — in `ai-service/.env`:
```
LLM_PROVIDER=custom
CUSTOM_LLM_URL=http://localhost:8001
```

## Deploy (production)

A Transformers model needs real RAM, so it **cannot** run on Render's free tier (512MB).
Recommended host: a **free HuggingFace Space** (Docker SDK, ~16GB RAM).

1. Create a new Space → **Docker** → blank.
2. Add this folder's files (or point the Space at this repo subdir). Add a Space
   `README.md` header so HF knows the port:
   ```
   ---
   title: ReWear LLM API
   sdk: docker
   app_port: 7860
   ---
   ```
3. The Space builds the Dockerfile and gives you a URL like
   `https://<user>-rewear-llm-api.hf.space`.
4. On the Render `rewear-ai` service set:
   ```
   LLM_PROVIDER=custom
   CUSTOM_LLM_URL=https://<user>-rewear-llm-api.hf.space
   ```

Alternative: a Render **Standard (2GB+)** paid instance using this Dockerfile.

## Notes

- The assistant makes a few LLM calls per chat turn; on a small CPU model that's a few
  seconds. If you want it snappier, set `CUSTOM_LLM_GENERATE_ONLY=true` on the assistant
  (`ai-service`): the model then writes only the final answer (~1 call/turn) while
  routing/grading use the fast built-in heuristic.
- If this server is unreachable, the assistant degrades gracefully to its heuristic mode
  (no crash).
