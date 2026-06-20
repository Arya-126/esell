"""Environment-driven settings for the ReWear AI microservice."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- LLM (Google Gemini, free tier) ---
    google_api_key: str = ""
    llm_model: str = "gemini-2.5-flash"
    llm_temperature: float = 0.2

    # --- Embeddings: "gemini" (text-embedding-004) or "fastembed" (local, no key) ---
    embeddings_provider: str = "fastembed"
    gemini_embed_model: str = "models/text-embedding-004"
    fastembed_model: str = "BAAI/bge-small-en-v1.5"

    # --- Qdrant. Priority: cloud URL > on-disk path > in-memory. ---
    qdrant_url: str = ""
    qdrant_api_key: str = ""
    # On-disk local mode (no server, no key). Lets `indexer.py` and the running
    # service share an index across processes (open them one at a time — local
    # mode takes an exclusive lock).
    qdrant_path: str = ""
    products_collection: str = "rewear_products"
    faq_collection: str = "rewear_faq"

    # --- ReWear host app callback ---
    rewear_api_url: str = "http://localhost:3000"
    # Must match the Node app's JWT_SECRET so we can verify forwarded tokens.
    jwt_secret: str = "rewear-dev-secret-change-me"

    # Index the catalog into Qdrant on startup if the collection is empty (waits
    # for ReWear to be reachable + seeded). Handy for a hands-off deploy.
    auto_index: bool = False

    # --- Retrieval / agent behaviour ---
    top_k: int = 5
    max_rewrites: int = 2  # Self-RAG: how many times to rewrite + retry retrieval
    score_threshold: float = 0.0  # min cosine score to keep a product hit

    @property
    def gemini_enabled(self) -> bool:
        return bool(self.google_api_key)

    @property
    def rewear_base_url(self) -> str:
        """ReWear URL with a scheme guaranteed (Render's host refs omit https://)."""
        u = (self.rewear_api_url or "").strip()
        if u and not u.startswith(("http://", "https://")):
            u = "https://" + u
        return u.rstrip("/")


@lru_cache
def get_settings() -> "Settings":
    return Settings()
