from rag.agents.intent import detect_intent

from rag.handlers import (
    handle_project_knowledge,
    handle_general_chat,
    handle_suspicious,
    handle_web_search,
    handle_multi_hop
)


from typing import Optional
from langchain_core.messages import BaseMessage


def run_pipeline(
    query: str,
    project_id: int,
    user_id: int,
    user_role: str,
    db,
    history: Optional[list[BaseMessage]] = None,
    summary_context: Optional[str] = None,
):

    # ----------------------------------------
    # Intent Detection
    # ----------------------------------------
    yield {
        "type": "status",
        "step": "intent",
        "message": "Understanding your request..."
    }

    intent_result = detect_intent(query, history=history)

    intent = intent_result["intent"]
    search_query = intent_result.get("query") or query
    intent_input_tokens = intent_result.get("input_tokens", 0) or 0
    intent_output_tokens = intent_result.get("output_tokens", 0) or 0

    yield {
        "type": "debug",
        "step": "intent",
        "intent": intent,
        "query": search_query if intent in {"project_knowledge", "web_search", "multi_hop"} else None,
        "input_tokens": intent_input_tokens,
        "output_tokens": intent_output_tokens,
        "total_tokens": intent_input_tokens + intent_output_tokens,
    }

    def emit_handler_events(events):
        for event in events:
            if event.get("type") != "final":
                yield event
                continue

            input_tokens = intent_input_tokens + (event.get("input_tokens", 0) or 0)
            output_tokens = intent_output_tokens + (event.get("output_tokens", 0) or 0)
            yield {
                **event,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens,
            }

    # ========================================
    # PROJECT KNOWLEDGE
    # ========================================
    if intent == "project_knowledge":

        yield from emit_handler_events(handle_project_knowledge(
            query=search_query,
            project_id=project_id,
            user_id=user_id,
            user_role=user_role,
            db=db,
            summary_context=summary_context
        ))

        return

    # ========================================
    # GENERAL CHAT
    # ========================================
    if intent == "general_chat":

        yield from emit_handler_events(handle_general_chat(
            query=query,
            history=history
        ))

        return

    # ========================================
    # SUSPICIOUS
    # ========================================
    if intent == "suspicious":

        yield from emit_handler_events(handle_suspicious(
            query=query
        ))

        return

    # ========================================
    # WEB SEARCH
    # ========================================
    if intent == "web_search":

        yield from emit_handler_events(handle_web_search(search_query))

        return

    # ========================================
    # MULTI-HOP (Universal retrieval)
    # ========================================
    if intent == "multi_hop":

        yield from emit_handler_events(handle_multi_hop(
            query=search_query,
            project_id=project_id,
            user_id=user_id,
            user_role=user_role,
            db=db
        ))

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
