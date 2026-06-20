"""
Index ReWear's catalog + FAQ knowledge base into Qdrant.

Run on demand:  python indexer.py
Pulls live products from the ReWear REST API (public endpoint), embeds them, and
upserts into the products collection. Re-runs are idempotent (point id derived
from the product id). Also chunks and indexes the markdown in knowledge/.
"""
from __future__ import annotations

import glob
import os
import re
import sys

import httpx

from config import get_settings
from providers import get_embedder
from retrieval import drop_collections, ensure_collections, get_client, upsert

KNOWLEDGE_DIR = os.path.join(os.path.dirname(__file__), "knowledge")


def fetch_products() -> list[dict]:
    s = get_settings()
    with httpx.Client(base_url=s.rewear_base_url, timeout=20.0) as client:
        r = client.get("/api/products", params={"sort": "new"})
        r.raise_for_status()
        return r.json().get("products", [])


def product_payload(p: dict) -> dict:
    return {
        "id": p["id"],
        "title": p.get("title", ""),
        "description": p.get("description", ""),
        "price": p.get("price", 0),
        "category": p.get("category", ""),
        "condition": p.get("condition", ""),
        "location": p.get("location", ""),
        "image": p.get("image"),
        "thumb": p.get("thumb"),
        "status": p.get("status", "available"),
        "sellerName": (p.get("seller") or {}).get("name", ""),
        "trustScore": (p.get("seller") or {}).get("trustScore"),
    }


def product_text(p: dict) -> str:
    return (
        f"{p.get('title','')}. {p.get('description','')}. "
        f"Category: {p.get('category','')}. Condition: {p.get('condition','')}. "
        f"Location: {p.get('location','')}."
    )


def chunk_markdown(text: str) -> list[str]:
    # Split on blank lines, keep non-trivial chunks.
    parts = [c.strip() for c in re.split(r"\n\s*\n", text)]
    return [c for c in parts if len(c) > 25]


def index_products(embedder) -> int:
    products = fetch_products()
    if not products:
        print("  (no products returned from ReWear)")
        return 0
    payloads = [product_payload(p) for p in products]
    vectors = embedder.embed_documents([product_text(p) for p in payloads])
    n = upsert(get_settings().products_collection, payloads, vectors)
    print(f"  indexed {n} products")
    return n


def index_faq(embedder) -> int:
    files = sorted(glob.glob(os.path.join(KNOWLEDGE_DIR, "*.md")))
    items, texts = [], []
    for path in files:
        source = os.path.basename(path)
        with open(path, "r", encoding="utf-8") as fh:
            for i, chunk in enumerate(chunk_markdown(fh.read())):
                items.append({"id": f"{source}#{i}", "text": chunk, "source": source})
                texts.append(chunk)
    if not items:
        print("  (no FAQ chunks found)")
        return 0
    vectors = embedder.embed_documents(texts)
    n = upsert(get_settings().faq_collection, items, vectors)
    print(f"  indexed {n} FAQ chunks from {len(files)} files")
    return n


def products_count() -> int:
    s = get_settings()
    try:
        client = get_client()
        if not client.collection_exists(s.products_collection):
            return 0
        return client.get_collection(s.products_collection).points_count or 0
    except Exception:
        return 0


def auto_index_if_empty() -> str:
    """Index only when the products collection is empty. Returns a status string;
    'no-products' means ReWear returned nothing yet (caller should retry)."""
    if products_count() > 0:
        return "already-indexed"
    embedder = get_embedder()
    ensure_collections(embedder.dim)
    n = index_products(embedder)
    if n == 0:
        return "no-products"
    index_faq(embedder)
    return f"indexed {n} products"


def main() -> None:
    s = get_settings()
    embedder = get_embedder()
    print(f"Embeddings: {s.embeddings_provider} (dim {embedder.dim}) | "
          f"Qdrant: {'cloud' if s.qdrant_url else 'in-memory'}")
    if "--recreate" in sys.argv:
        print("Recreating collections (dropping any existing data)…")
        drop_collections()
    ensure_collections(embedder.dim)
    print("Indexing catalog…")
    index_products(embedder)
    print("Indexing knowledge base…")
    index_faq(embedder)
    print("Done.")


if __name__ == "__main__":
    main()
