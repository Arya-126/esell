"""
Qdrant vector store access for products + FAQ.

Uses Qdrant Cloud when QDRANT_URL is set, otherwise falls back to an in-memory
local instance so the service runs and tests pass with zero infrastructure.

ReWear product ids are short base36 strings, which are not valid Qdrant point
ids (uint64/UUID only), so we derive a deterministic UUIDv5 for the point id and
keep the real id in the payload.
"""
from __future__ import annotations

import uuid
from functools import lru_cache

from qdrant_client import QdrantClient, models

from config import get_settings

# Fixed namespace for deriving stable point ids from ReWear's string ids.
_NS = uuid.UUID("a3f1c2d4-0000-4000-8000-abcdef000000")


def point_id(raw: str) -> str:
    return str(uuid.uuid5(_NS, raw))


@lru_cache
def get_client() -> QdrantClient:
    s = get_settings()
    if s.qdrant_url:
        return QdrantClient(url=s.qdrant_url, api_key=s.qdrant_api_key or None)
    if s.qdrant_path:
        return QdrantClient(path=s.qdrant_path)  # on-disk, shared across processes
    # Offline / test fallback — fully in-memory, no server required.
    return QdrantClient(location=":memory:")


# Fields the product filter conditions on. Qdrant Cloud requires a payload index
# on every filtered field (in-memory mode doesn't, which is why tests pass there).
_PRODUCT_INDEXES = {
    "status": models.PayloadSchemaType.KEYWORD,
    "category": models.PayloadSchemaType.KEYWORD,
    "condition": models.PayloadSchemaType.KEYWORD,
    "price": models.PayloadSchemaType.FLOAT,
}


def drop_collections() -> None:
    """Delete both collections (used by `indexer.py --recreate` for a clean rebuild)."""
    s = get_settings()
    client = get_client()
    for name in (s.products_collection, s.faq_collection):
        try:
            if client.collection_exists(name):
                client.delete_collection(name)
        except Exception:
            pass


def ensure_collections(dim: int) -> None:
    s = get_settings()
    client = get_client()
    for name in (s.products_collection, s.faq_collection):
        if not client.collection_exists(name):
            client.create_collection(
                collection_name=name,
                vectors_config=models.VectorParams(size=dim, distance=models.Distance.COSINE),
            )
    # Idempotent: creating an index that already exists is a no-op / harmless error.
    for field, schema in _PRODUCT_INDEXES.items():
        try:
            client.create_payload_index(
                collection_name=s.products_collection, field_name=field, field_schema=schema
            )
        except Exception:
            pass


def upsert(collection: str, items: list[dict], vectors: list[list[float]]) -> int:
    """items: list of payload dicts (each must include an 'id'); vectors aligned by index."""
    client = get_client()
    points = [
        models.PointStruct(id=point_id(str(item["id"])), vector=vec, payload=item)
        for item, vec in zip(items, vectors)
    ]
    client.upsert(collection_name=collection, points=points)
    return len(points)


def _product_filter(category: str | None, condition: str | None, max_price: float | None) -> models.Filter:
    must: list[models.Condition] = [
        models.FieldCondition(key="status", match=models.MatchValue(value="available"))
    ]
    if category:
        must.append(models.FieldCondition(key="category", match=models.MatchValue(value=category)))
    if condition:
        must.append(models.FieldCondition(key="condition", match=models.MatchValue(value=condition)))
    if max_price is not None:
        must.append(models.FieldCondition(key="price", range=models.Range(lte=max_price)))
    return models.Filter(must=must)


def search_products(
    query_vector: list[float],
    top_k: int,
    category: str | None = None,
    condition: str | None = None,
    max_price: float | None = None,
) -> list[dict]:
    s = get_settings()
    res = get_client().query_points(
        collection_name=s.products_collection,
        query=query_vector,
        query_filter=_product_filter(category, condition, max_price),
        limit=top_k,
        with_payload=True,
    )
    return [{**p.payload, "_score": p.score} for p in res.points]


def search_faq(query_vector: list[float], top_k: int) -> list[dict]:
    s = get_settings()
    res = get_client().query_points(
        collection_name=s.faq_collection,
        query=query_vector,
        limit=top_k,
        with_payload=True,
    )
    return [{**p.payload, "_score": p.score} for p in res.points]
