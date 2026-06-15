from rag.agents.intent import detect_intent

from rag.handlers import (
    handle_project_knowledge,
    handle_general_chat,
    handle_suspicious,
    handle_web_search,
    handle_multi_hop
)


def run_pipeline(
    query: str,
    project_id: int,
    user_id: int,
    user_role: str,
    db
):

    # ----------------------------------------
    # Intent Detection
    # ----------------------------------------
    yield {
        "type": "status",
        "step": "intent",
        "message": "Understanding your request..."
    }

    intent_result = detect_intent(query)

    intent = intent_result["intent"]

    yield {
        "type": "debug",
        "step": "intent",
        "intent": intent
    }

    # ========================================
    # PROJECT KNOWLEDGE
    # ========================================
    if intent == "project_knowledge":

        yield from handle_project_knowledge(
            query=query,
            project_id=project_id,
            user_id=user_id,
            user_role=user_role,
            db=db
        )

        return

    # ========================================
    # GENERAL CHAT
    # ========================================
    if intent == "general_chat":

        yield from handle_general_chat(
            query=query
        )

        return

    # ========================================
    # SUSPICIOUS
    # ========================================
    if intent == "suspicious":

        yield from handle_suspicious(
            query=query
        )

        return

    # ========================================
    # WEB SEARCH
    # ========================================
    if intent == "web_search":

        yield from handle_web_search(
            query=query
        )

        return

    # ========================================
    # MULTI-HOP (Universal retrieval)
    # ========================================
    if intent == "multi_hop":

        yield from handle_multi_hop(
            query=query,
            project_id=project_id,
            user_id=user_id,
            user_role=user_role,
            db=db
        )

        return

    # ========================================
    # FALLBACK
    # ========================================
    yield {
        "type": "final",
        "intent": "unknown",
        "answer": (
            "I could not determine how to process "
            "this request."
        )
    }