FROM python:3.12-slim

WORKDIR /app

# Install the CPU-only torch wheel first (the default PyPI torch pulls in multi-GB
# CUDA libs we don't need), then the rest.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pre-download the default model into the image so the first request is fast and
# cold starts don't re-download. Override at build with --build-arg MODEL_NAME=...
ARG MODEL_NAME=google/flan-t5-base
ENV MODEL_NAME=${MODEL_NAME}
RUN python -c "from transformers import AutoTokenizer, AutoModelForSeq2SeqLM; \
import os; n=os.environ['MODEL_NAME']; AutoTokenizer.from_pretrained(n); AutoModelForSeq2SeqLM.from_pretrained(n)"

# HF Spaces expects 7860; Render injects $PORT. Bind whichever is set.
EXPOSE 7860
CMD uvicorn app:app --host 0.0.0.0 --port ${PORT:-7860}
