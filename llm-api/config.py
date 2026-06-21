"""Settings for the self-hosted LLM inference server."""
import os


class Settings:
    # Hugging Face model id. Default is a small, CPU-friendly instruction model.
    model_name: str = os.getenv("MODEL_NAME", "google/flan-t5-base")
    # "text2text" (T5/Flan family) or "causal" (Llama/Qwen/Phi instruct models).
    model_type: str = os.getenv("MODEL_TYPE", "text2text")
    max_new_tokens: int = int(os.getenv("MAX_NEW_TOKENS", "256"))
    temperature: float = float(os.getenv("TEMPERATURE", "0.3"))


settings = Settings()
