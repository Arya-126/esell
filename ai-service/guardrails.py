"""
Input guardrails: block unsafe content, prompt-injection and clearly off-topic
how-to questions before they reach retrieval/generation. Conservative by design —
genuine marketplace queries must pass through.
"""
from __future__ import annotations

import re

SAFE_OFF_TOPIC = (
    "I'm the ReWear shopping assistant, so I can only help with finding items, "
    "your orders, and our store policies. For anything else I'd point you to a "
    "general search engine. Is there something on ReWear I can help you with?"
)
SAFE_BLOCKED = (
    "I can't help with that here. I'm ReWear's shopping assistant — I can help you "
    "find pre-loved items, track an order, or answer questions about returns and "
    "shipping. Our support team is available if you need more."
)

# Strong unsafe / abuse signals.
_UNSAFE = re.compile(
    r"\b(make a bomb|build a bomb|kill|suicide|self[- ]harm|how to hack|"
    r"steal a|launder|child|explicit sexual|weapon to)\b",
    re.I,
)

# Prompt-injection / jailbreak attempts.
_INJECTION = re.compile(
    r"(ignore (all |the )?(previous|prior) instructions|disregard your |"
    r"you are now |system prompt|reveal your (prompt|instructions|api key)|"
    r"act as (an?|the) )",
    re.I,
)

# Clearly non-marketplace how-to domains (car repair, coding, medical, etc.).
_OFF_TOPIC = re.compile(
    r"\b(change (a |my )?(car )?tire|fix my car|write (me )?(some )?code|"
    r"python script|medical advice|diagnose|stock tip|crypto price|"
    r"capital of|weather (today|tomorrow)|recipe for)\b",
    re.I,
)


def check(message: str) -> tuple[bool, str | None]:
    """Return (blocked, safe_response). blocked=True means stop the graph."""
    text = message or ""
    if _UNSAFE.search(text) or _INJECTION.search(text):
        return True, SAFE_BLOCKED
    if _OFF_TOPIC.search(text):
        return True, SAFE_OFF_TOPIC
    return False, None
