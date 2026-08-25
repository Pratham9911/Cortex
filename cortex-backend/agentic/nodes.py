import os
import json

from typing import TypedDict, Annotated

from dotenv import load_dotenv

from langchain_core.messages import HumanMessage
from langchain_fireworks import ChatFireworks
from langgraph.graph import END

from langgraph.prebuilt import ToolNode


from langchain_core.messages import ToolMessage, AIMessage, HumanMessage, SystemMessage

from agentic.tools import calculator , web_search
from agentic.state.main_state import AnswerState

SYSTEM_PROMPT = SystemMessage(
    content="You are a helpful, accurate AI assistant. do not waste tokens , Use available tools when necessary to provide precise and up-to-date answers." 
    
    
)

load_dotenv()



MAX_ITERATIONS = 10


llm = ChatFireworks(
    model="accounts/fireworks/models/gpt-oss-20b",
    api_key=os.getenv("FIREWORKS_API_KEY"),
    temperature=0,
)


tools = [calculator, web_search]

llm = llm.bind_tools(tools)

tool_node = ToolNode(tools)

#__________________NODES FOR GRAPH_____________________

def sanitize_messages(messages: list) -> list:
    """
    Prepare message history for the LLM call by stripping unnecessary metadata,
    sources, reasoning content, and raw provider payloads.

    AIMessage:
        - keep content
        - keep clean tool_calls (name, args, id)
        - strip reasoning_content and extra provider kwargs
    ToolMessage:
        - if content is dict/json containing 'answer' and 'sources', extract ONLY 'answer'
        - remove raw sources array and metadata
    HumanMessage / SystemMessage:
        - keep intact
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


def chat_node(state: AnswerState) -> dict:
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

    response = llm.invoke(messages_to_send)



    usage = response.usage_metadata or {}

    reasoning = response.additional_kwargs.get(
        "reasoning_content",
        ""
    )

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
        "iterations": state.get("iterations", 0) + 1,
    }


def collect_tool_results(state: AnswerState) -> dict:
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


def route_after_chat(state: AnswerState):

    if state.get("iterations", 0) >= MAX_ITERATIONS:
        return END

    last_message = state["messages"][-1]

    if getattr(last_message, "tool_calls", None):
        return "tool_node"

    return END


