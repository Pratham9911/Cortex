"""
agentic.teams.decisions.agent
==============================
Decision Agent module.

Implements a dedicated LangGraph workflow for handling team decisions:
- Formatting and storing new decisions into persistent memory via `store_decision_tool`.
- Searching existing decisions via hybrid vector + full text retrieval via `search_decisions_tool`.
"""

import os
import json
from dotenv import load_dotenv

from langchain_core.messages import ToolMessage, AIMessage, HumanMessage, SystemMessage
from langchain_fireworks import ChatFireworks
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode

from agentic.teams.decisions.tools import store_decision_tool, search_decisions_tool
from agentic.teams.decisions.state import DecisionAgentState

load_dotenv()

MAX_ITERATIONS = 6

DECISION_SYSTEM_PROMPT = SystemMessage(
    content=(
        "You are the Cortex Decision Agent, a specialized sub-agent responsible for team decisions memory.\n"
        "You accept requests to either STORE a new team decision or SEARCH existing team decisions.\n\n"
        "=== YOUR TOOLS ===\n"
        "1. store_decision_tool:\n"
        "   - Use when user/caller wants to record/store a decision.\n"
        "   - Format a clear, searchable, concise title.\n"
        "   - Write a rich, detailed description containing the full decision context, rationale, and scope.\n"
        "   - Pass created_by user_id and participants list if provided.\n\n"
        "2. search_decisions_tool:\n"
        "   - Use when user/caller wants to query/find past team decisions.\n"
        "   - Formulate a clear search query representing what decision to retrieve , Don't just use keywords for searching.\n\n"
        "=== RULES ===\n"
        "- ALWAYS use one of your tools to execute the requested action.\n"
        "- Do NOT invent decisions or assume facts not present in the input.\n"
        "- If Tool repeatedly failed to get relevent info stop calling it and return \"No information found\"\n"
        "- After tool execution, provide a clear, user-friendly summary of the action result."
    )
)

decision_tools = [store_decision_tool, search_decisions_tool]

decision_llm_base = ChatFireworks(
    model=os.getenv("MAIN_MODEL", "accounts/fireworks/models/qwen2p5-coder-32b-instruct"),
    api_key=os.getenv("FIREWORKS_API_KEY"),
    temperature=0,
    reasoning_effort="none"
)

decision_llm = decision_llm_base.bind_tools(decision_tools)
decision_tool_node = ToolNode(decision_tools)


def sanitize_decision_messages(messages: list) -> list:
    """Sanitize message payload for tool execution and LLM invocation compatibility."""
    sanitized = []
    for msg in messages:
        if isinstance(msg, AIMessage):
            tool_calls = []
            for call in getattr(msg, "tool_calls", []):
                tool_calls.append({
                    "name": call.get("name"),
                    "args": call.get("args"),
                    "id": call.get("id"),
                    "type": "tool_call",
                })
            sanitized.append(
                AIMessage(
                    content=msg.content or "",
                    tool_calls=tool_calls,
                    id=getattr(msg, "id", None),
                )
            )
            continue

        if isinstance(msg, ToolMessage):
            content = msg.content
            result_text = content
            if isinstance(content, str):
                try:
                    parsed = json.loads(content)
                    if isinstance(parsed, dict):
                        if "synthesized_answer" in parsed:
                            result_text = parsed["synthesized_answer"]
                        elif "message" in parsed:
                            result_text = parsed["message"]
                except Exception:
                    pass
            sanitized.append(
                ToolMessage(
                    content=str(result_text),
                    tool_call_id=msg.tool_call_id,
                    name=msg.name,
                    id=getattr(msg, "id", None),
                )
            )
            continue

        sanitized.append(msg)
    return sanitized


async def decision_chat_node(state: DecisionAgentState) -> dict:
    """LLM reasoning node that decides whether to invoke store_decision_tool or search_decisions_tool."""
    print("\n========== DECISION CHAT NODE ==========")
    raw_messages = state.get("messages", [])
    clean_messages = sanitize_decision_messages(raw_messages)

    if not clean_messages or not isinstance(clean_messages[0], SystemMessage):
        messages_to_send = [DECISION_SYSTEM_PROMPT] + clean_messages
    else:
        messages_to_send = clean_messages

    print(f"\n--- MESSAGES SENT TO DECISION LLM (Count: {len(messages_to_send)}) ---")
    for i, msg in enumerate(messages_to_send):
        msg_type = type(msg).__name__
        content_preview = repr(msg.content)
        extra_info = ""
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            extra_info += f" tool_calls={msg.tool_calls}"
        if hasattr(msg, "tool_call_id") and msg.tool_call_id:
            extra_info += f" tool_call_id={msg.tool_call_id}"
        line_str = f"  [{i+1}] {msg_type}: {content_preview}{extra_info}"
        try:
            print(line_str)
        except UnicodeEncodeError:
            print(line_str.encode("ascii", errors="backslashreplace").decode("ascii"))
    print("---------------------------------------------------\n")

    current_iteration = state.get("iterations", 0)
    response = await decision_llm.ainvoke(messages_to_send)
    usage = response.usage_metadata or {}
    reasoning = response.additional_kwargs.get("reasoning_content", "")

    tool_calls = [
        {
            "id": call["id"],
            "name": call["name"],
            "args": call["args"],
        }
        for call in getattr(response, "tool_calls", [])
    ]

    return {
        "messages": [response],
        "answer": response.content or "",
        "reasoning": reasoning,
        "tool_calls": tool_calls,
        "input_tokens": state.get("input_tokens", 0) + usage.get("input_tokens", 0),
        "output_tokens": state.get("output_tokens", 0) + usage.get("output_tokens", 0),
        "iterations": current_iteration + 1,
    }


async def collect_decision_tool_results(state: DecisionAgentState) -> dict:
    """Extract tool output details (stored decision or synthesized search results) into state."""
    decision_result = state.get("decision_result")
    add_input_tokens = 0
    add_output_tokens = 0

    for message in state.get("messages", []):
        if isinstance(message, ToolMessage):
            content = message.content
            parsed = None
            if isinstance(content, str):
                try:
                    parsed = json.loads(content)
                except Exception:
                    pass
            elif isinstance(content, dict):
                parsed = content

            if isinstance(parsed, dict):
                if "usage" in parsed:
                    add_input_tokens += parsed["usage"].get("input_tokens", 0)
                    add_output_tokens += parsed["usage"].get("output_tokens", 0)

                if "decision_proposal" in parsed:
                    decision_result = parsed["decision_proposal"]
                elif "synthesized_answer" in parsed:
                    decision_result = {
                        "synthesized_answer": parsed.get("synthesized_answer"),
                        "matching_decisions": parsed.get("matching_decisions", [])
                    }

    return {
        "decision_result": decision_result,
        "input_tokens": state.get("input_tokens", 0) + add_input_tokens,
        "output_tokens": state.get("output_tokens", 0) + add_output_tokens,
    }


def decision_route_after_chat(state: DecisionAgentState):
    """Route after chat node to tool node or END."""
    iterations = state.get("iterations", 0)
    last_message = state["messages"][-1]
    has_tool_calls = bool(getattr(last_message, "tool_calls", None))

    if not has_tool_calls:
        return END

    if iterations >= MAX_ITERATIONS:
        return END

    return "decision_tool_node"


def build_decision_workflow():
    """Build and compile the Decision Agent StateGraph."""
    builder = StateGraph(DecisionAgentState)

    builder.add_node("decision_chat_node", decision_chat_node)
    builder.add_node("decision_tool_node", decision_tool_node)
    builder.add_node("collect_decision_tool_results", collect_decision_tool_results)

    builder.add_edge(START, "decision_chat_node")
    builder.add_conditional_edges(
        "decision_chat_node",
        decision_route_after_chat,
        {
            "decision_tool_node": "decision_tool_node",
            END: END,
        },
    )
    builder.add_edge("decision_tool_node", "collect_decision_tool_results")
    builder.add_edge("collect_decision_tool_results", "decision_chat_node")

    return builder.compile()


decision_graph = build_decision_workflow()
