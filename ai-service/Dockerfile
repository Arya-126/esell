# Python 3.12 (safer prebuilt wheels for onnxruntime/fastembed than 3.13).
FROM python:3.12-slim

WORKDIR /app

# Install deps first for better layer caching.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# For production prefer EMBEDDINGS_PROVIDER=gemini so no model is downloaded at
# runtime. If you keep fastembed, the model is fetched on first request (needs
# outbound network + a writable cache).
# Shell form so $PORT (injected by Render/Railway/etc.) is honoured; 8000 locally.
CMD uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}
