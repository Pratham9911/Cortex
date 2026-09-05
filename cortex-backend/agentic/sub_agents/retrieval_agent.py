import os
import json
from dotenv import load_dotenv

from langchain_core.messages import ToolMessage, AIMessage, HumanMessage, SystemMessage
from langchain_fireworks import ChatFireworks
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode

from agentic.tools import project_search
from agentic.state.retrieval_state import RetrievalState
from agentic.sub_agents.base import SubAgentResult, SubAgentEventCallback

load_dotenv()

MAX_ITERATIONS = 8

SYSTEM_PROMPT = SystemMessage(
    content=(
        "You are a specialized Retrieval Sub-Agent. Your task is to search internal project documents "
        "using the project_search tool to answer all parts of the user's project research query efficiently.\n\n"
        "RULES:\n"
        "1. Execute project_search tool calls to gather necessary facts from internal project files.\n"
        "2. As soon as you have gathered sufficient information to answer the query, STOP calling tools immediately.\n"
        "3. Synthesize your final answer directly as a clear, facts-only text response without making any further tool calls."
    )
)

# LLM with tools — used for iterative project document retrieval
retrieval_llm_with_tools = ChatFireworks(
    model="accounts/fireworks/models/gpt-oss-120b",
    api_key=os.getenv("FIREWORKS_API_KEY"),
    temperature=0,
)

# LLM without tools — used for forced synthesis (graph-level enforcement)
retrieval_llm_base = ChatFireworks(
    model="accounts/fireworks/models/gpt-oss-120b",
    api_key=os.getenv("FIREWORKS_API_KEY"),
    temperature=0,
)

tools = [project_search]
retrieval_llm = retrieval_llm_with_tools.bind_tools(tools)
retrieval_tool_node = ToolNode(tools)


def sanitize_retrieval_messages(messages: list) -> list:
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


def print_retrieval_messages(node_name: str, messages: list, iteration: int):
    print(f"\n==================== RETRIEVAL AGENT [{node_name}] (Iteration: {iteration}) ====================")
    print(f"--- MESSAGES SENT TO RETRIEVAL LLM (Count: {len(messages)}) ---")
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


def retrieval_chat_node(state: RetrievalState) -> dict:
    raw_messages = state.get("messages", [])
    clean_messages = sanitize_retrieval_messages(raw_messages)
    current_iteration = state.get("iterations", 0)

    if not clean_messages or not isinstance(clean_messages[0], SystemMessage):
        messages_to_send = [SYSTEM_PROMPT] + clean_messages
    else:
        messages_to_send = clean_messages

    print_retrieval_messages("retrieval_chat_node", messages_to_send, current_iteration + 1)

    response = retrieval_llm.invoke(messages_to_send)
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
        print(f"[RETRIEVAL AGENT REASONING]: {reasoning}")
    if tool_calls:
        print(f"[RETRIEVAL AGENT TOOL CALLS]: {tool_calls}")
    if response.content:
        print(f"[RETRIEVAL AGENT RESPONSE PREVIEW]: {repr(response.content[:200])}...")

    return {
        "messages": [response],
        "answer": response.content or "",
        "reasoning": reasoning,
        "tool_calls": tool_calls,
        "input_tokens": state.get("input_tokens", 0) + usage.get("input_tokens", 0),
        "output_tokens": state.get("output_tokens", 0) + usage.get("output_tokens", 0),
        "iterations": current_iteration + 1,
    }


def collect_retrieval_tool_results(state: RetrievalState) -> dict:
    chunks = list(state.get("chunks", []))
    existing_chunk_ids = {
        (c.get("document", {}).get("document_id"), c.get("chunk", {}).get("page_number"))
        for c in chunks
        if isinstance(c, dict)
    }
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
                new_chunks = parsed.get("chunks", [])
                if isinstance(new_chunks, list):
                    for chk in new_chunks:
                        if isinstance(chk, dict):
                            doc_id = chk.get("document", {}).get("document_id")
                            page_no = chk.get("chunk", {}).get("page_number")
                            key = (doc_id, page_no)
                            if key in existing_chunk_ids:
                                continue
                            chunks.append(chk)
                            existing_chunk_ids.add(key)

                clean_answer = parsed.get("answer", "")
                if isinstance(clean_answer, (dict, list)):
                    clean_answer = json.dumps(clean_answer)
                else:
                    clean_answer = str(clean_answer)

                if not clean_answer.strip():
                    clean_answer = "Project retrieval tool execution completed."

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

    res = {"chunks": chunks}
    if updated_messages:
        res["messages"] = updated_messages
    return res


def force_synthesis_node(state: RetrievalState) -> dict:
    raw_messages = state.get("messages", [])
    clean_messages = sanitize_retrieval_messages(raw_messages)

    synthesis_prompt = SystemMessage(
        content=(
            "You have completed all allowed project document searches. "
            "Using ONLY the information gathered so far, write a complete, clear, facts-only final answer. "
            "Do not ask for more information or suggest further searches."
        )
    )

    messages_to_send = [synthesis_prompt] + clean_messages
    print_retrieval_messages("force_synthesis_node", messages_to_send, state.get("iterations", 0) + 1)

    response = retrieval_llm_base.invoke(messages_to_send)
    usage = response.usage_metadata or {}
    reasoning = response.additional_kwargs.get("reasoning_content", "")

    if reasoning:
        print(f"[RETRIEVAL AGENT FORCE SYNTHESIS REASONING]: {reasoning}")
    if response.content:
        print(f"[RETRIEVAL AGENT FORCE SYNTHESIS RESPONSE PREVIEW]: {repr(response.content[:200])}...")

    return {
        "messages": [response],
        "answer": response.content or "",
        "reasoning": reasoning,
        "tool_calls": [],
        "input_tokens": state.get("input_tokens", 0) + usage.get("input_tokens", 0),
        "output_tokens": state.get("output_tokens", 0) + usage.get("output_tokens", 0),
        "iterations": state.get("iterations", 0) + 1,
    }


def retrieval_route_after_chat(state: RetrievalState):
    iterations = state.get("iterations", 0)

    if iterations >= MAX_ITERATIONS:
        return END

    if iterations >= MAX_ITERATIONS - 1:
        return "force_synthesis_node"

    last_message = state["messages"][-1]
    if getattr(last_message, "tool_calls", None):
        return "retrieval_tool_node"

    return END


builder = StateGraph(RetrievalState)
builder.add_node("retrieval_chat_node", retrieval_chat_node)
builder.add_node("retrieval_tool_node", retrieval_tool_node)
builder.add_node("collect_retrieval_tool_results", collect_retrieval_tool_results)
builder.add_node("force_synthesis_node", force_synthesis_node)

builder.add_edge(START, "retrieval_chat_node")
builder.add_conditional_edges(
    "retrieval_chat_node",
    retrieval_route_after_chat,
    {
        "retrieval_tool_node": "retrieval_tool_node",
        "force_synthesis_node": "force_synthesis_node",
        END: END,
    },
)
builder.add_edge("retrieval_tool_node", "collect_retrieval_tool_results")
builder.add_edge("collect_retrieval_tool_results", "retrieval_chat_node")
builder.add_edge("force_synthesis_node", END)

retrieval_subgraph = builder.compile()


def run_retrieval_agent(query: str, event_callback: SubAgentEventCallback = None) -> SubAgentResult:
    """
    Execute Retrieval Agent Subgraph, stream events via callback tagged with agent="retrieval_agent",
    and return final SubAgentResult.
    """
    initial_state: RetrievalState = {
        "messages": [HumanMessage(content=query)],
        "question": query,
        "answer": "",
        "reasoning": "",
        "tool_calls": [],
        "chunks": [],
        "input_tokens": 0,
        "output_tokens": 0,
        "iterations": 0,
    }

    if event_callback:
        event_callback("agent_started", agent="retrieval_agent", goal=query)

    final_answer = ""
    final_chunks = []
    input_tokens = 0
    output_tokens = 0

    for update in retrieval_subgraph.stream(initial_state, stream_mode="updates"):
        for node_name, node_update in update.items():
            if node_name in ("retrieval_chat_node", "force_synthesis_node"):
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
                        agent="retrieval_agent",
                        iteration=iteration,
                        content=reasoning,
                    )

                if event_callback and tool_calls:
                    for call in tool_calls:
                        event_callback(
                            "tool_started",
                            agent="retrieval_agent",
                            iteration=iteration,
                            tool=call["name"],
                            args=call["args"],
                            call_id=call.get("id"),
                        )

            elif node_name == "retrieval_tool_node":
                if event_callback:
                    event_callback("tool_completed", agent="retrieval_agent", tool="project_search")

            elif node_name == "collect_retrieval_tool_results":
                chunks = node_update.get("chunks", [])
                if chunks:
                    final_chunks = chunks

    if not final_answer.strip():
        if final_chunks:
            final_answer = (
                "Project document search completed. Retrieved relevant passages from project files."
            )
        else:
            final_answer = "No relevant information found in the project documents for the given query."

    if event_callback:
        event_callback(
            "agent_completed",
            agent="retrieval_agent",
            answer=final_answer,
            chunks=final_chunks,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )

    return {
        "agent_name": "retrieval_agent",
        "answer": final_answer,
        "chunks": final_chunks,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
    }
