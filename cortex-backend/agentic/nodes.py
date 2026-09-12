import os
import json
from dotenv import load_dotenv

from langchain_core.messages import ToolMessage, AIMessage, HumanMessage, SystemMessage
from langchain_fireworks import ChatFireworks
from langgraph.graph import END
from langgraph.prebuilt import ToolNode

from agentic.tools import calculator, web_agent_tool, retrieval_agent_tool, github_agent_tool, gmail_agent_tool
from agentic.state.main_state import AnswerState

SYSTEM_PROMPT = SystemMessage(
    content=(
        "You are a helpful, accurate Cortex AI assistant.\n"
        "You have specialized sub-agent tools and utility tools available:\n"
        "Do not Use subagents if not Necessary , if something is not clear tell the user\n"
        "If Something Fails to get information from subagents , don't make up information , tell the user you don't have that\n"
        "If User says get info from Knowledge Base , don't Web Search for Project Knowledge , use Project base only \n"
        "For any email or Gmail tasks (searching emails, reading messages/threads, drafting, sending emails, replying), ALWAYS delegate to the gmail_agent sub-agent tool.\n"
        "DO NOT make up information. If you don't know the answer, say 'I don't know'.\n"
        "DO NOT Assume anything and provide wrong information"
    )
)

load_dotenv()

MAX_ITERATIONS = 2

llm = ChatFireworks(
    model="accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b",
    api_key=os.getenv("FIREWORKS_API_KEY"),
    temperature=0,
)

tools = [web_agent_tool, retrieval_agent_tool, github_agent_tool, gmail_agent_tool]
llm = llm.bind_tools(tools)
tool_node = ToolNode(tools)


def sanitize_messages(messages: list) -> list:
    """
    Prepare message history for the LLM call by stripping unnecessary metadata,
    sources, reasoning content, and raw provider payloads.
    """
    sanitized_messages = []

    for message in messages:
        if isinstance(message, AIMessage):
            tool_calls = []
            for call in getattr(message, "tool_calls", []):
                tool_calls.append({
                    "name": call.get("name"),
                    "args": call.get("args"),
                    "id": call.get("id"),
                    "type": "tool_call",
                })
            sanitized_messages.append(
                AIMessage(
                    content=message.content or "",
                    tool_calls=tool_calls,
                    id=getattr(message, "id", None),
                )
            )
            continue

        if isinstance(message, ToolMessage):
            content = message.content
            result_text = ""

            if isinstance(content, str):
                try:
                    parsed = json.loads(content)
                    if isinstance(parsed, dict):
                        result_text = parsed.get("answer", content)
                    else:
                        result_text = str(parsed)
                except Exception:
                    result_text = content
            elif isinstance(content, dict):
                result_text = content.get("answer", str(content))
            else:
                result_text = str(content)

            sanitized_messages.append(
                ToolMessage(
                    content=str(result_text),
                    tool_call_id=message.tool_call_id,
                    name=message.name,
                    id=getattr(message, "id", None),
                )
            )
            continue

        sanitized_messages.append(message)

    return sanitized_messages


async def chat_node(state: AnswerState) -> dict:
    print("\n========== CHAT NODE ==========")
    raw_messages = state.get("messages", [])
    clean_messages = sanitize_messages(raw_messages)

    if not clean_messages or not isinstance(clean_messages[0], SystemMessage):
        messages_to_send = [SYSTEM_PROMPT] + clean_messages
    else:
        messages_to_send = clean_messages

    print(f"\n--- MESSAGES SENT TO LLM (Count: {len(messages_to_send)}) ---")
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

    response = await llm.ainvoke(messages_to_send)
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

    if not reasoning and tool_calls:
        desc_list = []
        for tc in tool_calls:
            t_name = tc["name"]
            t_args = tc["args"]
            q_val = t_args.get("query") or t_args.get("prompt") or (json.dumps(t_args) if t_args else "")
            desc_list.append(f"Analyzing request. Delegating task to {t_name}: '{q_val}'")
        reasoning = "\n".join(desc_list)
    elif not reasoning and response.content:
        reasoning = response.content

    return {
        "messages": [response],
        "answer": response.content or "",
        "reasoning": reasoning,
        "tool_calls": tool_calls,
        "input_tokens": state.get("input_tokens", 0) + usage.get("input_tokens", 0),
        "output_tokens": state.get("output_tokens", 0) + usage.get("output_tokens", 0),
        "iterations": state.get("iterations", 0) + 1,
    }


async def collect_tool_results(state: AnswerState) -> dict:
    sources = list(state.get("sources", []))
    existing_urls = {s.get("url") for s in sources if s.get("url")}

    chunks = list(state.get("chunks", []))
    existing_chunk_keys = {
        (c.get("document", {}).get("document_id"), c.get("chunk", {}).get("page_number"))
        for c in chunks
        if isinstance(c, dict)
    }

    additional_input_tokens = 0
    additional_output_tokens = 0
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
                additional_input_tokens += parsed.get("input_tokens", 0)
                additional_output_tokens += parsed.get("output_tokens", 0)

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

                new_chunks = parsed.get("chunks", [])
                if isinstance(new_chunks, list):
                    for chk in new_chunks:
                        if isinstance(chk, dict):
                            doc_id = chk.get("document", {}).get("document_id")
                            page_no = chk.get("chunk", {}).get("page_number")
                            key = (doc_id, page_no)
                            if key in existing_chunk_keys:
                                continue
                            chunks.append(chk)
                            existing_chunk_keys.add(key)

                clean_answer = parsed.get("answer", "")
                if isinstance(clean_answer, (dict, list)):
                    clean_answer = json.dumps(clean_answer)
                else:
                    clean_answer = str(clean_answer)

                if not clean_answer.strip():
                    clean_answer = "Tool execution completed."

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

    res = {
        "sources": sources,
        "chunks": chunks,
        "input_tokens": state.get("input_tokens", 0) + additional_input_tokens,
        "output_tokens": state.get("output_tokens", 0) + additional_output_tokens,
    }
    if updated_messages:
        res["messages"] = updated_messages

    return res


async def force_synthesis_node(state: AnswerState) -> dict:
    """
    Graph-enforced synthesis node for Main Agent.
    Uses base LLM with NO tools bound to force final answer synthesis.
    """
    raw_messages = state.get("messages", [])
    clean_messages = sanitize_messages(raw_messages)

    # If the iteration limit is reached immediately after the model asks for
    # another tool, that tool call has not been executed. Do not send a
    # dangling assistant tool-call message to the synthesis model; it should
    # answer from the tool results already collected in the conversation.
    if clean_messages and isinstance(clean_messages[-1], AIMessage):
        if getattr(clean_messages[-1], "tool_calls", None):
            clean_messages = clean_messages[:-1]

    synthesis_prompt = SystemMessage(
        content=(
            "You have reached maximum tool iterations. "
            "Using ONLY the information gathered so far in the conversation, provide a clear, final answer to the user."
        )
    )

    messages_to_send = [synthesis_prompt] + clean_messages
    llm_base = ChatFireworks(
        model="accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b",
        api_key=os.getenv("FIREWORKS_API_KEY"),
        temperature=0,
    )
    response = await llm_base.ainvoke(messages_to_send)
    usage = response.usage_metadata or {}
    reasoning = response.additional_kwargs.get("reasoning_content", "")

    return {
        "messages": [response],
        "answer": response.content or "",
        "reasoning": reasoning,
        "tool_calls": [],
        "input_tokens": state.get("input_tokens", 0) + usage.get("input_tokens", 0),
        "output_tokens": state.get("output_tokens", 0) + usage.get("output_tokens", 0),
        "iterations": state.get("iterations", 0) + 1,
    }


def route_after_chat(state: AnswerState):
    iterations = state.get("iterations", 0)
    last_message = state["messages"][-1]
    has_tool_calls = bool(getattr(last_message, "tool_calls", None))

    # A normal assistant response is already complete, regardless of the
    # iteration count.
    if not has_tool_calls:
        return END

    # Allow the current tool call to run. Synthesis is only forced when the
    # model asks for another tool after the configured limit is reached.
    if iterations >= MAX_ITERATIONS:
        return "force_synthesis_node"

    return "tool_node"
