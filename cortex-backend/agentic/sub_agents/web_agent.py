import os
import json
from dotenv import load_dotenv

from langchain_core.messages import ToolMessage, AIMessage, HumanMessage, SystemMessage
from langchain_fireworks import ChatFireworks
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode

from agentic.tools import web_search
from agentic.state.web_state import WebSearchState
from agentic.sub_agents.base import SubAgentResult, SubAgentEventCallback

load_dotenv()

MAX_ITERATIONS = 8

SYSTEM_PROMPT = SystemMessage(
    content=(
        "You are a specialized Web Search Sub-Agent. Your task is to perform targeted web searches "
        "using the web_search tool to answer all parts of the user's research query efficiently.\n\n"
        "RULES:\n"
        "1. Execute web_search tool calls to gather necessary facts.\n"
        "2. As soon as you have gathered sufficient information to answer the query, STOP calling tools immediately.\n"
        "3. Synthesize your final answer directly as a clear, facts-only text response without making any further tool calls."
    )
)


# LLM with tools — used for iterative web search
web_llm_with_tools = ChatFireworks(
    model="accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b",
    api_key=os.getenv("FIREWORKS_API_KEY"),
    temperature=0,
)

# LLM without tools — used for forced synthesis (graph-level enforcement)
web_llm_base = ChatFireworks(
    model="accounts/fireworks/models/gpt-oss-120b",
    api_key=os.getenv("FIREWORKS_API_KEY"),
    temperature=0,
)

tools = [web_search]
web_llm = web_llm_with_tools.bind_tools(tools)
web_tool_node = ToolNode(tools)


def sanitize_web_messages(messages: list) -> list:
    sanitized = []
    for msg in messages:
        if isinstance(msg, AIMessage):
            tool_calls = [
                {
                    "name": call.get("name"),
                    "args": call.get("args"),
                    "id": call.get("id"),
                    "type": "tool_call",
                }
                for call in getattr(msg, "tool_calls", [])
            ]
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
                        result_text = parsed.get("answer", content)
                except Exception:
                    result_text = content
            elif isinstance(content, dict):
                result_text = content.get("answer", str(content))

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


def print_web_messages(node_name: str, messages: list, iteration: int):
    print(f"\n==================== WEB AGENT [{node_name}] (Iteration: {iteration}) ====================")
    print(f"--- MESSAGES SENT TO WEB LLM (Count: {len(messages)}) ---")
    for i, msg in enumerate(messages):
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
    print("--------------------------------------------------------------------------------")


def web_chat_node(state: WebSearchState) -> dict:
    raw_messages = state.get("messages", [])
    clean_messages = sanitize_web_messages(raw_messages)
    current_iteration = state.get("iterations", 0)

    if not clean_messages or not isinstance(clean_messages[0], SystemMessage):
        messages_to_send = [SYSTEM_PROMPT] + clean_messages
    else:
        messages_to_send = clean_messages

    print_web_messages("web_chat_node", messages_to_send, current_iteration + 1)

    response = web_llm.invoke(messages_to_send)
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

    if reasoning:
        print(f"[WEB AGENT REASONING]: {reasoning}")
    if tool_calls:
        print(f"[WEB AGENT TOOL CALLS]: {tool_calls}")
    if response.content:
        print(f"[WEB AGENT RESPONSE PREVIEW]: {repr(response.content[:200])}...")

    return {
        "messages": [response],
        "answer": response.content or "",
        "reasoning": reasoning,
        "tool_calls": tool_calls,
        "input_tokens": state.get("input_tokens", 0) + usage.get("input_tokens", 0),
        "output_tokens": state.get("output_tokens", 0) + usage.get("output_tokens", 0),
        "iterations": current_iteration + 1,
    }



def collect_web_tool_results(state: WebSearchState) -> dict:
    sources = list(state.get("sources", []))
    existing_urls = {s.get("url") for s in sources if s.get("url")}
    updated_messages = []

    for message in state.get("messages", []):
        if isinstance(message, ToolMessage):
            content = message.content
            parsed = None
            if isinstance(content, str):
                try:
                    parsed = json.loads(content)
                except Exception:
                    parsed = None
            elif isinstance(content, dict):
                parsed = content

            if isinstance(parsed, dict):
                new_sources = parsed.get("sources", [])
                if isinstance(new_sources, list):
                    for src in new_sources:
                        if isinstance(src, dict):
                            url = src.get("url")
                            if url and url in existing_urls:
                                continue
                            sources.append(src)
                            if url:
                                existing_urls.add(url)

                clean_answer = parsed.get("answer", content)
                if isinstance(clean_answer, (dict, list)):
                    clean_answer = json.dumps(clean_answer)
                else:
                    clean_answer = str(clean_answer)

                # Guard: never overwrite with empty string
                if not clean_answer.strip():
                    clean_answer = content if isinstance(content, str) else json.dumps(parsed)

                msg_id = getattr(message, "id", None)
                if clean_answer != content and msg_id:
                    updated_messages.append(
                        ToolMessage(
                            content=clean_answer,
                            tool_call_id=message.tool_call_id,
                            name=message.name,
                            id=msg_id,
                        )
                    )

    res = {"sources": sources}
    if updated_messages:
        res["messages"] = updated_messages
    return res


def force_synthesis_node(state: WebSearchState) -> dict:
    """
    Graph-enforced synthesis node — called when MAX_ITERATIONS-1 is reached.
    Uses the base LLM (NO tools bound) so the model physically cannot call
    any tool regardless of what it wants to do.
    """
    raw_messages = state.get("messages", [])
    clean_messages = sanitize_web_messages(raw_messages)

    synthesis_prompt = SystemMessage(
        content=(
            "You have completed all allowed web searches. "
            "Using ONLY the information gathered so far, write a complete, clear, facts-only final answer. "
            "Do not ask for more information or suggest further searches."
        )
    )

    messages_to_send = [synthesis_prompt] + clean_messages
    print_web_messages("force_synthesis_node", messages_to_send, state.get("iterations", 0) + 1)

    # web_llm_base has NO tools bound — LLM cannot call tools even if it tries
    response = web_llm_base.invoke(messages_to_send)
    usage = response.usage_metadata or {}
    reasoning = response.additional_kwargs.get("reasoning_content", "")

    if reasoning:
        print(f"[WEB AGENT FORCE SYNTHESIS REASONING]: {reasoning}")
    if response.content:
        print(f"[WEB AGENT FORCE SYNTHESIS RESPONSE PREVIEW]: {repr(response.content[:200])}...")


    return {
        "messages": [response],
        "answer": response.content or "",
        "reasoning": reasoning,
        "tool_calls": [],
        "input_tokens": state.get("input_tokens", 0) + usage.get("input_tokens", 0),
        "output_tokens": state.get("output_tokens", 0) + usage.get("output_tokens", 0),
        "iterations": state.get("iterations", 0) + 1,
    }


def web_route_after_chat(state: WebSearchState):
    iterations = state.get("iterations", 0)

    # Hard limit
    if iterations >= MAX_ITERATIONS:
        return END

    # At MAX_ITERATIONS-1, force synthesis via dedicated node (no tool calls possible)
    if iterations >= MAX_ITERATIONS - 1:
        return "force_synthesis_node"

    last_message = state["messages"][-1]
    if getattr(last_message, "tool_calls", None):
        return "web_tool_node"

    return END



builder = StateGraph(WebSearchState)
builder.add_node("web_chat_node", web_chat_node)
builder.add_node("web_tool_node", web_tool_node)
builder.add_node("collect_web_tool_results", collect_web_tool_results)
builder.add_node("force_synthesis_node", force_synthesis_node)

builder.add_edge(START, "web_chat_node")
builder.add_conditional_edges(
    "web_chat_node",
    web_route_after_chat,
    {
        "web_tool_node": "web_tool_node",
        "force_synthesis_node": "force_synthesis_node",
        END: END,
    },
)
builder.add_edge("web_tool_node", "collect_web_tool_results")
builder.add_edge("collect_web_tool_results", "web_chat_node")
builder.add_edge("force_synthesis_node", END)

web_subgraph = builder.compile()


def run_web_agent(query: str, event_callback: SubAgentEventCallback = None) -> SubAgentResult:
    """
    Execute Web Agent Subgraph, stream events via callback tagged with agent="web_agent",
    and return final SubAgentResult.
    """
    initial_state: WebSearchState = {
        "messages": [HumanMessage(content=query)],
        "question": query,
        "answer": "",
        "reasoning": "",
        "tool_calls": [],
        "sources": [],
        "input_tokens": 0,
        "output_tokens": 0,
        "iterations": 0,
    }

    if event_callback:
        event_callback("agent_started", agent="web_agent", goal=query)

    final_answer = ""
    final_sources = []
    input_tokens = 0
    output_tokens = 0

    for update in web_subgraph.stream(initial_state, stream_mode="updates"):
        for node_name, node_update in update.items():
            if node_name in ("web_chat_node", "force_synthesis_node"):
                reasoning = node_update.get("reasoning", "")
                answer = node_update.get("answer", "")
                tool_calls = node_update.get("tool_calls", [])
                iteration = node_update.get("iterations", 1)

                if answer:
                    final_answer = answer

                input_tokens = node_update.get("input_tokens", input_tokens)
                output_tokens = node_update.get("output_tokens", output_tokens)

                if event_callback and reasoning:
                    event_callback(
                        "reasoning",
                        agent="web_agent",
                        iteration=iteration,
                        content=reasoning,
                    )

                if event_callback and tool_calls:
                    for call in tool_calls:
                        event_callback(
                            "tool_started",
                            agent="web_agent",
                            iteration=iteration,
                            tool=call["name"],
                            args=call["args"],
                            call_id=call.get("id"),
                        )

            elif node_name == "web_tool_node":
                if event_callback:
                    event_callback("tool_completed", agent="web_agent", tool="web_search")

            elif node_name == "collect_web_tool_results":
                sources = node_update.get("sources", [])
                if sources:
                    final_sources = sources

    # Fallback: if web agent never emitted a text answer, use a placeholder
    # so the ToolMessage is never empty and the main agent doesn't loop again
    if not final_answer.strip():
        if final_sources:
            final_answer = (
                "Web research completed. Gathered sources are listed. "
                "Please synthesize the answer from the collected sources."
            )
        else:
            final_answer = "No relevant web results were found for the given query."

    if event_callback:
        event_callback(
            "agent_completed",
            agent="web_agent",
            answer=final_answer,
            sources=final_sources,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )

    return {
        "agent_name": "web_agent",
        "answer": final_answer,
        "sources": final_sources,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
    }

