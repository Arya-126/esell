"""
Authenticated callbacks into the ReWear Node REST API.

Identity is taken from the forwarded JWT (verified with the shared secret); order
data is fetched by replaying the same Bearer token against ReWear, so the host app
remains the single source of truth for authorization.
"""
from __future__ import annotations

import httpx
from jose import jwt, JWTError

from config import get_settings

STATUS_LABEL = {
    "pending_payment": "awaiting payment",
    "paid": "paid — awaiting shipment",
    "shipped": "shipped",
    "delivered": "delivered",
    "cancelled": "cancelled",
    "refunded": "refunded",
}


def verify_token(token: str | None) -> dict | None:
    """Return the JWT payload {id, role} if valid, else None."""
    if not token:
        return None
    try:
        return jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except JWTError:
        return None


def fetch_product(product_id: str) -> dict | None:
    """Fetch one product's full decorated details (public endpoint)."""
    if not product_id:
        return None
    s = get_settings()
    try:
        with httpx.Client(base_url=s.rewear_base_url, timeout=10.0) as client:
            r = client.get(f"/api/products/{product_id}")
            if r.status_code != 200:
                return None
            return r.json().get("product")
    except Exception:
        return None


def format_product(p: dict) -> str:
    """Compact, groundable detail block for a single product."""
    seller = p.get("seller") or {}
    fair = p.get("fair") or {}
    rows = [
        f'Title: {p.get("title")}',
        f'Price: ${p.get("price")} USD' + (f' ({fair.get("label")})' if fair.get("label") and fair.get("label") != "No data" else ""),
        f'Condition: {p.get("condition")}',
        f'Category: {p.get("category")}',
        f'Location: {p.get("location")}' if p.get("location") else "",
        f'Seller: {seller.get("name", "?")} (trust score {seller.get("trustScore") or "new seller"})',
        f'Eco impact: saves about {p.get("ecoSaved", "?")}kg CO2 vs buying new',
        f'Availability: {p.get("status", "available")}',
        f'Description: {p.get("description") or "(none provided)"}',
    ]
    return "Product details:\n" + "\n".join(r for r in rows if r)


def fetch_my_orders(token: str) -> dict:
    s = get_settings()
    with httpx.Client(base_url=s.rewear_base_url, timeout=10.0) as client:
        r = client.get("/api/orders/mine", headers={"Authorization": f"Bearer {token}"})
        r.raise_for_status()
        return r.json()


def format_orders(data: dict) -> str:
    """Turn /api/orders/mine into a compact, groundable context block."""
    purchases = data.get("purchases", [])
    if not purchases:
        return ""
    lines = []
    for o in purchases[:10]:
        title = (o.get("product") or {}).get("title", "Item")
        status = STATUS_LABEL.get(o.get("status", ""), o.get("status", "unknown"))
        charged = o.get("charged") or f"${o.get('amount')}"
        bits = [f'"{title}" — {status}', f"total {charged}", f"#{str(o.get('id',''))[-6:]}"]
        if o.get("tracking"):
            bits.append(f"tracking {o['tracking']}")
        if o.get("shippedAt"):
            bits.append(f"shipped {o['shippedAt'][:10]}")
        if o.get("deliveredAt"):
            bits.append(f"delivered {o['deliveredAt'][:10]}")
        if o.get("refundStatus") and o["refundStatus"] != "none":
            bits.append(f"refund {o['refundStatus']}")
        lines.append(" · ".join(bits))
    return "Your recent orders:\n- " + "\n- ".join(lines)
