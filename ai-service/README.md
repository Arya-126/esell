# ReWear AI Assistant — Multi-Agent RAG microservice

A self-correcting, multi-agent **Retrieval-Augmented Generation** service that powers
ReWear's floating chat widget. Built with **FastAPI + LangGraph + Qdrant**, it runs as
an isolated microservice — the Node app talks to it over a thin same-origin proxy.

One **Query Router** serves these use cases:
- **Personal Shopper** — semantic product discovery ("a warm winter jacket under $50").
- **Product Q&A** — detailed questions about a specific item ("is this a good deal?",
  "what condition is it in?"), grounded in that product's live details. The widget
  passes the product id when you're on a product page.
- **Customer Support** — FAQ/policy answers and "where is my order?" lookups.

## The agent graph (`graph.py`)

```
guardrail ─▶ router ─┬─▶ product_retrieve ─▶ scorer ─┬─▶ generate ─▶ END
                     │                                ├─▶ rewrite ─▶ (re-retrieve)
                     ├─▶ faq_retrieve ──────▶ scorer ─┘
                     ├─▶ order_retrieve ────▶ generate
                     └─▶ other ─────────────▶ fallback ─▶ END
```

- **Guardrail** blocks unsafe / prompt-injection / off-topic input → safe scripted reply.
- **Router** classifies the message (product / order / faq / other).
- **Self-RAG scorer** grades retrieved context; if weak it **rewrites the query and
  retries** (up to `MAX_REWRITES`) before falling back.
- **Generator** answers *only* from retrieved context (no hallucinated items/prices).
- **Order tool** calls back into ReWear's REST API using the user's forwarded JWT.

## Providers (cost-free by default)

| Concern | Default | Upgrade |
|---|---|---|
| LLM | Heuristic rules (no key) | **Google Gemini** (`GOOGLE_API_KEY`) or your **own model server** (`CUSTOM_LLM_URL`) |
| Embeddings | **fastembed** local ONNX (no key) | Gemini `text-embedding-004` |
| Vector DB | In-memory Qdrant | **Qdrant Cloud** (`QDRANT_URL` + key) |

The LLM is pluggable via `LLM_PROVIDER` (`auto` | `custom` | `gemini` | `heuristic`).
Set `CUSTOM_LLM_URL` to point at your self-hosted [`llm-api/`](../llm-api) server
(FastAPI + HuggingFace Transformers) to run your own model instead of Gemini — any
backend failure degrades gracefully to the heuristic. It runs end-to-end with zero keys
for a quick demo; add Gemini/custom + Qdrant Cloud for the full experience.

## Run it

```bash
cd ai-service
python -m venv .venv && .venv\Scripts\activate     # Windows
pip install -r requirements.txt
copy .env.example .env                              # then edit .env

# 1) With ReWear (Node) running on :3000, index the catalog + FAQ:
python indexer.py

# 2) Start the service:
uvicorn app:app --port 8000 --reload
```

Then set `AI_SERVICE_URL=http://localhost:8000` in the ReWear `.env` and restart Node.
The chat widget appears automatically (it's gated on `/api/config` → `aiEnabled`).

## API

- `POST /chat` — body `{ "message": "...", "sessionId": "..." }`, optional
  `Authorization: Bearer <jwt>` header. Returns
  `{ reply, route, products[], attempts, blocked }`.
- `GET /health` — reports active LLM / embeddings / Qdrant mode.

Only the ReWear Node proxy should call this service; it forwards the end user's JWT.

## Tests

```bash
pytest            # offline: guardrails, routing, filter parsing, Self-RAG decisions
```

The end-to-end product-discovery test downloads the local embedding model on first
run; it self-skips if no network is available.

## Security notes

- The service is never exposed to the browser directly — the Node proxy hides its URL
  and forwards auth.
- Identity comes from the JWT (shared `JWT_SECRET`, HS256); order data is fetched by
  replaying the same token against ReWear, so authorization stays centralized.
- Guardrails run before any retrieval/generation. Message length is capped.
