import os
import json
from dotenv import load_dotenv

from langchain_core.messages import ToolMessage, AIMessage, HumanMessage, SystemMessage
from langchain_fireworks import ChatFireworks
from langgraph.graph import END
from langgraph.prebuilt import ToolNode

from agentic.teams.discussion_agent.tools import (
    discussion_retrieval_agent_tool,
    discussion_web_agent_tool,
    discussion_decision_agent_tool,
)
from agentic.teams.discussion_agent.state import DiscussionAgentState

load_dotenv()

MAX_ITERATIONS = 6

DISCUSSION_SYSTEM_PROMPT = SystemMessage(
    content=(
        "You are Cortex AI, an intelligent, team-aware assistant operating inside team discussions.\n"
        "You have access to specialized sub-agents:\n"
        "1. discussion_retrieval_agent: Only Use When user asks for internal Team Knowledge, ask it exact what to get\n"
        "2. discussion_web_agent: Only Use When user asks for External Web Knowledge\n"
        "3. discussion_decision_agent: Only Use When user asks to store/record a new team decision or search past team decisions (action='store' or action='search'). When storing a decision, pass participants list if specified in context (e.g. participants=[{'user_id': 1, 'role': 'Lead'}] or list of user IDs).\n"
        "USE Sub-Agents only when really needed and tell them properly what to look, use them as search bar with clear query.\n"

        "Citation Rule only for Project Knowledge: if Project Info contains Citations then use them as it is otherwise don't invent citations.\n"
        "- CRITICAL: Never wrap citation tags in backticks (do NOT write `[cite: doc_12:p4]`). Write plain [cite: doc_12:p4] and then newLine \n."
        "Place every citation at the end of it's relevent paragraph, sentence, bullet, or point, so that the citation is immediately followed by a new line character .\n"

        "Now important: Never search in web or Kb unless user asks, understand the conversation and answer based on it (NEVER ASSUME ANYTHING, ASK USER IF UNSURE).\n"
        "Your main task is to be an Assistant to Team and handle decisions."
    )
)

discussion_tools = [
    discussion_retrieval_agent_tool,
    discussion_web_agent_tool,
    discussion_decision_agent_tool,
]

discussion_llm_base = ChatFireworks(
    model=os.getenv("MAIN_MODEL"),
    api_key=os.getenv("FIREWORKS_API_KEY"),
    temperature=0,
    reasoning_effort="low"
)

discussion_llm = discussion_llm_base.bind_tools(discussion_tools)
discussion_tool_node = ToolNode(discussion_tools)


def sanitize_discussion_messages(messages: list) -> list:
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


async def discussion_chat_node(state: DiscussionAgentState) -> dict:
    raw_messages = state.get("messages", [])
    clean_messages = sanitize_discussion_messages(raw_messages)

    if not clean_messages or not isinstance(clean_messages[0], SystemMessage):
        messages_to_send = [DISCUSSION_SYSTEM_PROMPT] + clean_messages
    else:
        messages_to_send = clean_messages

    current_iteration = state.get("iterations", 0)
    response = await discussion_llm.ainvoke(messages_to_send)
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


async def collect_discussion_tool_results(state: DiscussionAgentState) -> dict:
    sources = list(state.get("sources", []))
    existing_urls = {s.get("url") for s in sources if s.get("url")}

    chunks = list(state.get("chunks", []))
    existing_chunk_keys = {
        (c.get("document", {}).get("document_id"), c.get("chunk", {}).get("page_number"))
        for c in chunks
        if isinstance(c, dict)
    }

    decision_proposal = state.get("decision_proposal")
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

                if parsed.get("decision_proposal"):
                    decision_proposal = parsed["decision_proposal"]

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
                    clean_answer = "Sub-agent tool execution completed."

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
        "decision_proposal": decision_proposal,
        "input_tokens": state.get("input_tokens", 0) + additional_input_tokens,
        "output_tokens": state.get("output_tokens", 0) + additional_output_tokens,
    }
    if updated_messages:
        res["messages"] = updated_messages

    return res


async def discussion_force_synthesis_node(state: DiscussionAgentState) -> dict:
    raw_messages = state.get("messages", [])
    clean_messages = sanitize_discussion_messages(raw_messages)

    if clean_messages and isinstance(clean_messages[-1], AIMessage):
        if getattr(clean_messages[-1], "tool_calls", None):
            clean_messages = clean_messages[:-1]

    synthesis_prompt = SystemMessage(
        content=(
            "You have completed all allowed sub-agent searches. "
            "Using ONLY the information gathered so far in the conversation, provide a clear, final answer."
        )
    )

    messages_to_send = [synthesis_prompt] + clean_messages
    response = await discussion_llm_base.ainvoke(messages_to_send)
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


def discussion_route_after_chat(state: DiscussionAgentState):
    iterations = state.get("iterations", 0)
    last_message = state["messages"][-1]
    has_tool_calls = bool(getattr(last_message, "tool_calls", None))

    if not has_tool_calls:
        return END

    if iterations >= MAX_ITERATIONS:
        return "discussion_force_synthesis_node"

    return "discussion_tool_node"
