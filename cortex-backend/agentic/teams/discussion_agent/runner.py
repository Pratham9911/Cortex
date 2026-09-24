import asyncio
from typing import Callable, Optional
from sqlalchemy.orm import Session

from agentic.tools import set_active_project_context, set_active_event_callback
from agentic.teams.discussion_agent.stm import (
    get_team_document_ids,
    check_and_summarize_discussion_db,
    build_discussion_llm_messages,
)
from agentic.teams.discussion_agent.graph import discussion_graph
from agentic.teams.discussion_agent.state import DiscussionAgentState


async def run_discussion_agent(
    question: str,
    project_id: int,
    team_id: int,
    discussion_id: int,
    user_id: int,
    user_role: str,
    db: Session,
    event_callback: Optional[Callable] = None,
) -> dict:
    """
    Execute Discussion Supervisory Agent:
    1. Scope document search strictly to team_id.
    2. Maintain and check Discussion STM (1000 tokens threshold + 5-section summarizer).
    3. Stream sub-agent progress updates via event_callback (excluding CoT reasoning).
    4. Return final formatted answer, sources, and chunks.
    """
    # 1. Document scoping for this team
    team_doc_ids = get_team_document_ids(db, project_id, team_id)

    # 2. Context setup
    set_active_project_context(
        project_id=project_id,
        user_id=user_id,
        user_role=user_role,
        db=db,
        document_ids=team_doc_ids,
    )

    # Filtered event callback wrapper that ignores reasoning / CoT
    def filtered_callback(event_type: str, **data):
        if event_type == "reasoning":
            return  # Do NOT yield CoT reasoning
        if event_callback:
            event_callback(event_type, **data)

    set_active_event_callback(filtered_callback)

    # 3. Maintain Discussion STM (summarizes if active context exceeds 1000 tokens)
    history = check_and_summarize_discussion_db(db, discussion_id)

    # 4. Build LLM message sequence: [History (Summary + prior turns)] + [_HISTORY_BRIDGE] + [HumanMessage(question)]
    messages = build_discussion_llm_messages(history, latest_query=question)

    initial_state: DiscussionAgentState = {
        "messages": messages,
        "question": question,
        "answer": "",
        "reasoning": "",
        "tool_calls": [],
        "sources": [],
        "chunks": [],
        "input_tokens": 0,
        "output_tokens": 0,
        "iterations": 0,
    }

    if filtered_callback:
        filtered_callback(
            "agent_started",
            agent="discussion_agent",
            goal=f"Answering team query: {question}",
        )

    final_answer = ""
    final_sources = []
    final_chunks = []
    input_tokens = 0
    output_tokens = 0

    async for update in discussion_graph.astream(initial_state, stream_mode="updates"):
        for node_name, node_update in update.items():
            if node_name in ("discussion_chat_node", "discussion_force_synthesis_node"):
                answer = node_update.get("answer", "")
                tool_calls = node_update.get("tool_calls", [])
                iteration = node_update.get("iterations", 1)

                if answer:
                    final_answer = answer

                input_tokens = node_update.get("input_tokens", input_tokens)
                output_tokens = node_update.get("output_tokens", output_tokens)

                if filtered_callback and tool_calls:
                    for call in tool_calls:
                        filtered_callback(
                            "tool_started",
                            agent="discussion_agent",
                            iteration=iteration,
                            tool=call["name"],
                            args=call["args"],
                            call_id=call.get("id"),
                        )

            elif node_name == "collect_discussion_tool_results":
                sources = node_update.get("sources", [])
                chunks = node_update.get("chunks", [])
                if sources:
                    final_sources = sources
                if chunks:
                    final_chunks = chunks

    if not final_answer.strip():
        final_answer = "I've analyzed the team discussion and documents, but could not formulate a complete answer."

    # Process and format ai_sources & ai_chunks for storage
    formatted_sources = {"web": [], "documents": []}
    if final_sources:
        for s in final_sources[:5]:
            formatted_sources["web"].append({
                "url": s.get("url", ""),
                "title": s.get("title", s.get("url", "")),
                "favicon": s.get("favicon"),
                "score": s.get("score"),
            })
    if final_chunks:
        for c in final_chunks[:5]:
            doc_meta = c.get("document", {})
            chk_meta = c.get("chunk", {})
            file_name = doc_meta.get("file_name") or doc_meta.get("title") or ""
            page_no = chk_meta.get("page_number")
            formatted_sources["documents"].append({
                "document_id": doc_meta.get("document_id"),
                "document_title": doc_meta.get("title"),
                "file_name": file_name,
                "page_number": page_no,
                "page_numbers": [page_no] if page_no else [],
            })

    if filtered_callback:
        filtered_callback(
            "agent_completed",
            agent="discussion_agent",
            answer=final_answer,
            sources=formatted_sources,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )

    return {
        "answer": final_answer,
        "sources": formatted_sources,
        "chunks": final_chunks,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
    }
