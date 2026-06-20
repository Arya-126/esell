"""
The multi-agent RAG graph (LangGraph).

    guardrail ─▶ router ─┬─▶ product_retrieve ─▶ scorer ─┬─▶ generate ─▶ END
                        │                                ├─▶ rewrite ─▶ (re-retrieve)
                        ├─▶ faq_retrieve ─────▶ scorer ──┘
                        ├─▶ order_retrieve ───▶ generate
                        └─▶ other ────────────▶ fallback ─▶ END

Self-RAG: the scorer grades retrieved context; if it's weak it rewrites the query
and retries (up to settings.max_rewrites) before giving up to the fallback.
"""
from __future__ import annotations

import re
from typing import Optional, TypedDict

from langgraph.graph import StateGraph, START, END

import guardrails
import retrieval
import rewear_client
from config import get_settings
from providers import get_embedder, get_llm

CATEGORIES = ["Electronics", "Clothing", "Furniture", "Books", "Toys", "Sports", "Home", "Other"]
CONDITIONS = ["New", "Like New", "Good", "Fair", "For Parts"]
_CATEGORY_SYNONYMS = {
    "clothes": "Clothing", "clothing": "Clothing", "jacket": "Clothing", "coat": "Clothing",
    "dress": "Clothing", "shoe": "Clothing", "outfit": "Clothing",
    "furniture": "Furniture", "table": "Furniture", "chair": "Furniture", "lamp": "Furniture",
    "electronics": "Electronics", "laptop": "Electronics", "phone": "Electronics",
    "headphone": "Electronics", "kindle": "Electronics",
    "book": "Books", "books": "Books", "toy": "Toys", "toys": "Toys",
    "sport": "Sports", "sports": "Sports", "yoga": "Sports", "guitar": "Other",
    "home": "Home",
}


class State(TypedDict, total=False):
    message: str
    history: str
    token: Optional[str]
    user_id: Optional[str]
    product_id: Optional[str]  # set when the user is viewing a product page
    route: str
    query: str
    attempts: int
    context: str
    products: list[dict]
    answer: str
    decision: str
    blocked: bool
    cards: list[dict]


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def parse_filters(message: str) -> tuple[Optional[str], Optional[str], Optional[float]]:
    msg = message.lower()
    max_price = None
    m = re.search(r"(?:under|below|less than|max|up ?to|cheaper than)\s*\$?\s*(\d+(?:\.\d+)?)", msg)
    if not m:
        m = re.search(r"\$\s*(\d+(?:\.\d+)?)", msg)
    if m:
        max_price = float(m.group(1))

    category = next((c for c in CATEGORIES if re.search(rf"\b{c.lower()}\b", msg)), None)
    if not category:
        for word, cat in _CATEGORY_SYNONYMS.items():
            if re.search(rf"\b{word}\b", msg):
                category = cat
                break

    condition = next((c for c in CONDITIONS if c.lower() in msg), None)
    return category, condition, max_price


def products_to_context(products: list[dict]) -> str:
    if not products:
        return ""
    lines = []
    for p in products:
        desc = (p.get("description") or "")[:160]
        lines.append(
            f'- {p.get("title")} | ${p.get("price")} | {p.get("condition")} | '
            f'{p.get("category")} | seller {p.get("sellerName","?")} | {desc}'
        )
    return "Matching listings:\n" + "\n".join(lines)


def why_fits(p: dict) -> str:
    parts = [f'{p.get("condition","Good")} condition', f'${p.get("price")}']
    if p.get("category"):
        parts.append(p["category"].lower())
    return "Good match — " + ", ".join(parts) + "."


def to_cards(products: list[dict]) -> list[dict]:
    return [
        {
            "id": p.get("id"),
            "title": p.get("title"),
            "price": p.get("price"),
            "image": p.get("thumb") or p.get("image"),
            "category": p.get("category"),
            "condition": p.get("condition"),
            "whyItFits": why_fits(p),
        }
        for p in products
    ]


# --------------------------------------------------------------------------- #
# Nodes
# --------------------------------------------------------------------------- #
def guardrail_node(state: State) -> dict:
    blocked, safe = guardrails.check(state["message"])
    if blocked:
        return {"blocked": True, "answer": safe, "route": "blocked"}
    return {"blocked": False}


_EXPLICIT_SEARCH = re.compile(
    r"\b(find|search|show me|browse|another|other one|cheaper|instead|"
    r"something else|recommend|looking for)\b",
    re.I,
)


def router_node(state: State) -> dict:
    msg = state["message"]
    base = get_llm().classify_route(msg, state.get("history", ""))
    # When the user is on a product page, treat questions as being ABOUT that
    # item ("is this warm?", "is this a good deal?") unless they're explicitly
    # searching for something else ("find me a cheaper one").
    if state.get("product_id") and base not in ("order_status", "faq"):
        base = "product_search" if _EXPLICIT_SEARCH.search(msg) else "product_qa"
    return {"route": base, "query": msg, "attempts": 0}


def product_qa_node(state: State) -> dict:
    p = rewear_client.fetch_product(state.get("product_id") or "")
    if not p:
        return {
            "context": "",
            "answer": "I couldn't load that item's details right now — try reopening the "
            "product page and asking again.",
            "decision": "terminal",
        }
    return {"context": rewear_client.format_product(p), "products": [p], "route": "product_qa"}


def product_retrieve_node(state: State) -> dict:
    s = get_settings()
    category, condition, max_price = parse_filters(state["message"])
    vec = get_embedder().embed_query(state["query"])
    products = search_safe(
        lambda: retrieval.search_products(
            vec, s.top_k, category=category, condition=condition, max_price=max_price
        )
    )
    return {"products": products, "context": products_to_context(products)}


def faq_retrieve_node(state: State) -> dict:
    s = get_settings()
    vec = get_embedder().embed_query(state["query"])
    hits = search_safe(lambda: retrieval.search_faq(vec, s.top_k))
    context = "\n\n".join(h.get("text", "") for h in hits)
    return {"context": context}


def order_retrieve_node(state: State) -> dict:
    if not state.get("user_id") or not state.get("token"):
        return {
            "context": "",
            "answer": "To check your orders, please sign in first — then ask me again and "
            "I'll pull up your order status and tracking.",
            "decision": "terminal",
        }
    try:
        data = rewear_client.fetch_my_orders(state["token"])
        return {"context": rewear_client.format_orders(data)}
    except Exception:
        return {
            "context": "",
            "answer": "I couldn't reach your order history just now. Please try again in a moment.",
            "decision": "terminal",
        }


def scorer_node(state: State) -> dict:
    """Self-RAG: grade context; pass / rewrite / fail."""
    ok = get_llm().grade_context(state["query"], state.get("context", ""))
    if ok and state.get("context", "").strip():
        return {"decision": "pass"}
    if state.get("attempts", 0) < get_settings().max_rewrites:
        return {"decision": "rewrite"}
    return {"decision": "fail"}


def rewrite_node(state: State) -> dict:
    new_q = get_llm().rewrite_query(state["query"], state.get("route", ""))
    return {"query": new_q, "attempts": state.get("attempts", 0) + 1}


def generate_node(state: State) -> dict:
    if state.get("answer") and state.get("decision") == "terminal":
        return {}  # order node already produced a terminal answer
    reply = get_llm().compose_answer(
        state.get("route", "other"),
        state["message"],
        state.get("context", ""),
        state.get("history", ""),
    )
    out: dict = {"answer": reply}
    if state.get("route") in ("product_search", "product_qa"):
        out["cards"] = to_cards(state.get("products", []))
    return out


def fallback_node(state: State) -> dict:
    if state.get("answer"):
        return {}  # guardrail / terminal answer already set
    route = state.get("route")
    if route == "product_search":
        return {"answer": "I couldn't find a matching item in our current listings — "
                "try different words, or remove a filter like price or category?"}
    if route == "faq":
        return {"answer": "I couldn't find that in our help info. You can ask me about "
                "returns & refunds, shipping & delivery, payments & currency, or selling."}
    if route == "order_status":
        return {"answer": "I couldn't find any orders to show right now. If you're signed in "
                "and expecting one, please try again in a moment."}
    return {"answer": "I'm the ReWear assistant — I can help you find pre-loved items, check "
            "on an order, or answer questions about returns, shipping and selling. What are "
            "you after?"}


def search_safe(fn):
    """Retrieval must never crash the graph (e.g. empty/missing collection)."""
    try:
        return fn()
    except Exception:
        return []


# --------------------------------------------------------------------------- #
# Edges
# --------------------------------------------------------------------------- #
def after_guardrail(state: State) -> str:
    return "fallback" if state.get("blocked") else "router"


def after_router(state: State) -> str:
    return {
        "product_search": "product_retrieve",
        "faq": "faq_retrieve",
        "order_status": "order_retrieve",
        "product_qa": "product_qa",
    }.get(state.get("route", "other"), "fallback")


def after_order(state: State) -> str:
    return "generate"  # generate passes through a terminal answer if set


def after_scorer(state: State) -> str:
    return {"pass": "generate", "rewrite": "rewrite", "fail": "fallback"}[state["decision"]]


def after_rewrite(state: State) -> str:
    return "product_retrieve" if state.get("route") == "product_search" else "faq_retrieve"


def build_graph():
    g = StateGraph(State)
    g.add_node("guardrail", guardrail_node)
    g.add_node("router", router_node)
    g.add_node("product_retrieve", product_retrieve_node)
    g.add_node("faq_retrieve", faq_retrieve_node)
    g.add_node("order_retrieve", order_retrieve_node)
    g.add_node("product_qa", product_qa_node)
    g.add_node("scorer", scorer_node)
    g.add_node("rewrite", rewrite_node)
    g.add_node("generate", generate_node)
    g.add_node("fallback", fallback_node)

    g.add_edge(START, "guardrail")
    g.add_conditional_edges("guardrail", after_guardrail, {"fallback": "fallback", "router": "router"})
    g.add_conditional_edges("router", after_router, {
        "product_retrieve": "product_retrieve",
        "faq_retrieve": "faq_retrieve",
        "order_retrieve": "order_retrieve",
        "product_qa": "product_qa",
        "fallback": "fallback",
    })
    g.add_edge("product_retrieve", "scorer")
    g.add_edge("faq_retrieve", "scorer")
    g.add_conditional_edges("order_retrieve", after_order, {"generate": "generate"})
    g.add_conditional_edges("product_qa", after_order, {"generate": "generate"})
    g.add_conditional_edges("scorer", after_scorer, {
        "generate": "generate", "rewrite": "rewrite", "fallback": "fallback",
    })
    g.add_conditional_edges("rewrite", after_rewrite, {
        "product_retrieve": "product_retrieve", "faq_retrieve": "faq_retrieve",
    })
    g.add_edge("generate", END)
    g.add_edge("fallback", END)
    return g.compile()


GRAPH = build_graph()


def run_turn(message: str, history: str = "", token: str | None = None,
             product_id: str | None = None) -> dict:
    """Execute one conversational turn; returns {answer, route, cards, attempts, trace}."""
    user = rewear_client.verify_token(token)
    init: State = {
        "message": message,
        "history": history,
        "token": token,
        "user_id": user.get("id") if user else None,
        "product_id": product_id,
        "attempts": 0,
    }
    final = GRAPH.invoke(init)
    return {
        "reply": final.get("answer", ""),
        "route": final.get("route", "other"),
        "products": final.get("cards", []),
        "attempts": final.get("attempts", 0),
        "blocked": final.get("blocked", False),
    }
