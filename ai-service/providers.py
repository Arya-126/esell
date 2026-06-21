"""
LLM + embeddings providers.

Two embedders (Gemini hosted / fastembed local) behind one interface, and two
LLM clients: a real Gemini client and a deterministic heuristic fallback used
when no GOOGLE_API_KEY is configured. The fallback keeps the whole agent graph
runnable (and testable) offline with zero keys.
"""
from __future__ import annotations

import re
from functools import lru_cache
from typing import Protocol

from config import get_settings

ROUTES = ("product_search", "order_status", "faq", "other")


# --------------------------------------------------------------------------- #
# Embeddings
# --------------------------------------------------------------------------- #
class Embedder:
    """Uniform embedding interface: .dim, .embed_documents, .embed_query."""

    def __init__(self) -> None:
        s = get_settings()
        self.provider = s.embeddings_provider.lower()
        if self.provider == "gemini":
            from langchain_google_genai import GoogleGenerativeAIEmbeddings

            self._impl = GoogleGenerativeAIEmbeddings(
                model=s.gemini_embed_model, google_api_key=s.google_api_key
            )
            self.dim = 768
        else:  # fastembed (local ONNX, no key, offline)
            from fastembed import TextEmbedding

            self._impl = TextEmbedding(model_name=s.fastembed_model)
            self.dim = 384

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if self.provider == "gemini":
            return self._impl.embed_documents(texts)
        return [vec.tolist() for vec in self._impl.embed(texts)]

    def embed_query(self, text: str) -> list[float]:
        if self.provider == "gemini":
            return self._impl.embed_query(text)
        return next(iter(self._impl.embed([text]))).tolist()


@lru_cache
def get_embedder() -> Embedder:
    return Embedder()


# --------------------------------------------------------------------------- #
# LLM clients
# --------------------------------------------------------------------------- #
class LLMClient(Protocol):
    def classify_route(self, message: str, history: str) -> str: ...
    def grade_context(self, query: str, context: str) -> bool: ...
    def rewrite_query(self, query: str, route: str) -> str: ...
    def compose_answer(self, route: str, message: str, context: str, history: str) -> str: ...


_STOPWORDS = {
    "the", "a", "an", "for", "to", "me", "i", "do", "you", "have", "any",
    "find", "looking", "want", "need", "show", "get", "please", "can",
    "is", "are", "of", "my", "with", "under", "over",
}


class HeuristicLLM:
    """Keyword/rule-based stand-in so the graph works without an API key."""

    PRODUCT = re.compile(
        r"\b(find|looking|recommend|suggest|outfit|wear|buy|jacket|coat|lamp|"
        r"table|guitar|book|shoe|dress|gift|cheap|under \$?\d|below \$?\d|"
        r"show me|do you have)\b",
        re.I,
    )
    HOWTO = re.compile(r"\bhow (do i|to|can i)\b", re.I)
    GREETING = re.compile(
        r"^(hi|hello|hey|yo|sup|thanks|thank you|good (morning|afternoon|evening)|"
        r"how are you|who are you|what can you do|help)\b",
        re.I,
    )
    ORDER = re.compile(
        r"\b(order|where is|track|tracking|shipped|delivered|delivery|"
        r"my purchase|my parcel|package|refund status|arrive)\b",
        re.I,
    )
    FAQ = re.compile(
        r"\b(return|returns|policy|shipping|ship to|how do i|how to sell|"
        r"payment|fees|fee|dispute|warranty|refund policy|verify|account)\b",
        re.I,
    )

    def classify_route(self, message: str, history: str) -> str:
        if self.ORDER.search(message):
            return "order_status"
        # "how do I sell / return / ship …" is a support/FAQ question.
        if self.HOWTO.search(message) and self.FAQ.search(message):
            return "faq"
        if self.FAQ.search(message) and not self.PRODUCT.search(message):
            return "faq"
        if self.GREETING.search(message.strip()):
            return "other"
        # Default to shopping: this is a marketplace assistant and the semantic
        # search handles natural phrasing better than keyword rules.
        return "product_search"

    def grade_context(self, query: str, context: str) -> bool:
        # Trust the vector ranking: if retrieval returned anything, it's the
        # nearest match. (The LLM grader does finer relevance grading when a
        # Gemini key is configured.) Empty context still triggers a rewrite.
        return bool(context.strip())

    def rewrite_query(self, query: str, route: str) -> str:
        # Drop filler/stopwords to broaden the semantic search on retry.
        tokens = [t for t in re.findall(r"[a-z0-9$]+", query.lower()) if t not in _STOPWORDS]
        return " ".join(tokens) or query

    def compose_answer(self, route: str, message: str, context: str, history: str) -> str:
        if route == "product_search":
            return ("Here are some pre-loved items from our marketplace that match what "
                    "you're after:") if context.strip() else \
                   "I couldn't find a close match in our current listings — try different words?"
        if route == "product_qa":
            body = context.replace("Product details:\n", "").replace("\n", " · ").strip()
            return ("Here's what I can tell you about this item — " + body) if body else \
                   "I couldn't load that item's details right now."
        if route == "order_status":
            return context.strip() or "I couldn't find any orders on your account yet."
        if route == "faq":
            return context.strip() or "I don't have that policy detail handy right now."
        return "I'm the ReWear shopping assistant — I can help you find items or check on your orders."


class PromptLLM:
    """
    Shared prompt logic + circuit breaker for real LLM backends. Subclasses only
    implement `_ask(system, user) -> str` (the transport). If any call fails
    (quota, network, timeout, bad model) the breaker trips and every later call
    uses the heuristic fallback — so a flaky backend never breaks the assistant.
    Restart the service to retry the backend.
    """

    name = "LLM"

    def __init__(self) -> None:
        self._fallback = HeuristicLLM()
        self._disabled = False

    def _ask(self, system: str, user: str) -> str:  # pragma: no cover - abstract
        raise NotImplementedError

    def _trip(self, err: Exception) -> None:
        if not self._disabled:
            print(f"[LLM] {self.name} unavailable ({str(err)[:140]}); using heuristic "
                  "fallback until restart.")
        self._disabled = True

    def classify_route(self, message: str, history: str) -> str:
        if self._disabled:
            return self._fallback.classify_route(message, history)
        try:
            out = self._ask(
                "You are a query router for the ReWear second-hand marketplace. "
                "Classify the user's latest message into exactly one label: "
                "product_search (finding items to buy, OR any need/goal/interest that "
                "marketplace items could satisfy — e.g. 'I want to work out at home', "
                "'something for camping'), order_status (their own orders / tracking / "
                "refunds), faq (return/shipping/payment/selling policies), or other "
                "(greetings, thanks, clearly off-topic). When in doubt between "
                "product_search and other, choose product_search. Reply with ONLY the label.",
                f"Conversation so far:\n{history}\n\nLatest message: {message}",
            ).lower()
            for r in ROUTES:
                if r in out:
                    return r
            return "other"
        except Exception as e:
            self._trip(e)
            return self._fallback.classify_route(message, history)

    def grade_context(self, query: str, context: str) -> bool:
        if not context.strip():
            return False
        if self._disabled:
            return self._fallback.grade_context(query, context)
        try:
            out = self._ask(
                "You grade whether retrieved CONTEXT is relevant and sufficient to answer "
                "the QUERY for a shopping assistant. Reply ONLY 'yes' or 'no'.",
                f"QUERY: {query}\n\nCONTEXT:\n{context[:4000]}",
            ).lower()
            return out.startswith("y")
        except Exception as e:
            self._trip(e)
            return self._fallback.grade_context(query, context)

    def rewrite_query(self, query: str, route: str) -> str:
        if self._disabled:
            return self._fallback.rewrite_query(query, route)
        try:
            out = self._ask(
                "Rewrite the shopper's search query to improve semantic retrieval over a "
                "second-hand product catalog. Expand vague terms into concrete item types, "
                "materials and use-cases. Reply with ONLY the rewritten query.",
                f"Original ({route}): {query}",
            )
            return out or query
        except Exception as e:
            self._trip(e)
            return self._fallback.rewrite_query(query, route)

    def compose_answer(self, route: str, message: str, context: str, history: str) -> str:
        if self._disabled:
            return self._fallback.compose_answer(route, message, context, history)
        try:
            system = (
                "You are the ReWear shopping assistant for a sustainable second-hand "
                "marketplace. Answer ONLY from the provided CONTEXT — never invent products, "
                "prices, policies or order details. Be concise, friendly and specific. "
                "If recommending items, briefly say why each fits. If the context is empty, "
                "say you couldn't find a match and suggest a rephrase."
            )
            return self._ask(
                system,
                f"Route: {route}\nConversation:\n{history}\n\nUser: {message}\n\nCONTEXT:\n{context[:6000]}",
            )
        except Exception as e:
            self._trip(e)
            return self._fallback.compose_answer(route, message, context, history)


class GeminiLLM(PromptLLM):
    """Google Gemini backend (fails fast so the breaker trips on quota/errors)."""

    name = "Gemini"

    def __init__(self) -> None:
        super().__init__()
        from langchain_google_genai import ChatGoogleGenerativeAI

        s = get_settings()
        self._chat = ChatGoogleGenerativeAI(
            model=s.llm_model,
            google_api_key=s.google_api_key,
            temperature=s.llm_temperature,
            max_retries=0,
            timeout=20,
        )

    def _ask(self, system: str, user: str) -> str:
        from langchain_core.messages import HumanMessage, SystemMessage

        resp = self._chat.invoke([SystemMessage(content=system), HumanMessage(content=user)])
        return (resp.content or "").strip()


class CustomHTTPLLM(PromptLLM):
    """Self-hosted model server (llm-api/): POST /generate {system,user} -> {text}."""

    name = "Custom LLM"

    def __init__(self) -> None:
        super().__init__()
        s = get_settings()
        self._url = s.custom_llm_base_url
        # When true, route/grade/rewrite use the heuristic; the model writes only
        # the final answer (far fewer calls — better for small/slow models).
        self._generate_only = s.custom_llm_generate_only

    def _ask(self, system: str, user: str) -> str:
        import httpx

        r = httpx.post(f"{self._url}/generate", json={"system": system, "user": user}, timeout=30.0)
        r.raise_for_status()
        return (r.json().get("text") or "").strip()

    def classify_route(self, message: str, history: str) -> str:
        if self._generate_only:
            return self._fallback.classify_route(message, history)
        return super().classify_route(message, history)

    def grade_context(self, query: str, context: str) -> bool:
        if self._generate_only:
            return self._fallback.grade_context(query, context)
        return super().grade_context(query, context)

    def rewrite_query(self, query: str, route: str) -> str:
        if self._generate_only:
            return self._fallback.rewrite_query(query, route)
        return super().rewrite_query(query, route)


@lru_cache
def get_llm() -> LLMClient:
    s = get_settings()
    provider = (s.llm_provider or "auto").lower()
    if provider == "custom" or (provider == "auto" and s.custom_llm_url):
        return CustomHTTPLLM()
    if provider == "gemini" or (provider == "auto" and s.gemini_enabled):
        return GeminiLLM()
    return HeuristicLLM()
