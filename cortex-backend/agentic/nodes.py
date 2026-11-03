import os
import json
import re
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
        "Do not Use subagents if not Necessary.\n"
        "Do not keep on calling subagents if they fail to full fill work , tell the user you don't have that.\n"
        "\n"
        "=== CONTEXT RESOLUTION (CRITICAL) ===\n"
        "Before saying 'I don't understand' or asking for clarification, ALWAYS check the conversation history above.\n"
        "When the user uses references like 'these', 'those', 'it', 'the above', 'the 2nd point', 'previous answer', 'expand on that', etc.:\n"
        "  1. Look at your previous assistant response in the conversation history.\n"
        "  2. Identify the exact topics, items, or points the user is referring to.\n"
        "  3. Use those concrete topics when calling sub-agent tools (e.g. retrieval_agent with each specific topic).\n"
        "  Example: If you previously listed 'QA vs QC, Alpha vs Beta Testing, Integration Testing'\n"
        "  and the user says 'answer these from KB', call retrieval_agent for each of those 3 topics.\n"
        "  NEVER respond with 'what do you want?' if the answer is clearly in the conversation history.\n"
        "\n"
        "=== PROJECT KNOWLEDGE (retrieval_agent) ===\n"
        "Treat KB info as Highest valid information and output the info from KB as it is with citations (eg: [cite: doc_12:p4]) included if subagent provides it.\n"
        "Citation Rule only for Project Knowledge: if Project Info contains Citations then use them as it is otherwise don't invent citations.\n"
        "- CRITICAL: Never wrap citation tags in backticks (do NOT write `[cite: doc_12:p4]`). Write plain [cite: doc_12:p4] and then newLine \n."
        "Place every citation at the end of it's relevent paragraph, sentence, bullet, or point, so that the citation is immediately followed by a new line character."
    )
)

load_dotenv()

# At max 5 tool iterations; on the 6th iteration force final synthesis of collected findings
MAX_ITERATIONS = 6

# LLM with tools — used for iterative reasoning and tool invocation
llm_with_tools = ChatFireworks(
    model=os.getenv("MAIN_MODEL"),
    api_key=os.getenv("FIREWORKS_API_KEY"),
    temperature=0,
    reasoning_effort="low",
)

# LLM without tools — used for forced synthesis (graph-level enforcement)
llm_base = ChatFireworks(
    model=os.getenv("MAIN_MODEL"),
    api_key=os.getenv("FIREWORKS_API_KEY"),
    temperature=0,
)

tools = [web_agent_tool, retrieval_agent_tool, github_agent_tool, gmail_agent_tool]
llm = llm_with_tools.bind_tools(tools)
tool_node = ToolNode(tools)


def clean_agent_output(text: str) -> str:
    """Strip reasoning artifacts, unclosed think tags, and DeepSeek DSML tool syntax."""
    if not text:
        return ""
    text = re.sub(r"</?｜DSML｜[^>]*>", "", text)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = re.sub(r"</?think>", "", text)
    text = text.strip()
    if re.fullmatch(r"[#\-\*\s]+", text):
        return ""
    return text


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
                    content=clean_agent_output(message.content or ""),
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


from agentic.memory.short_term.stm_db import _HISTORY_BRIDGE

async def chat_node(state: AnswerState) -> dict:
    raw_messages = state.get("messages", [])
    clean_messages = sanitize_messages(raw_messages)
    current_iteration = state.get("iterations", 0)

    # Ensure SYSTEM_PROMPT is always at index 0 if not present
    if not clean_messages or clean_messages[0].content != SYSTEM_PROMPT.content:
        messages_to_send = [SYSTEM_PROMPT] + clean_messages
    else:
        messages_to_send = clean_messages

    # If there is conversation history before the latest HumanMessage, inject _HISTORY_BRIDGE
    if len(messages_to_send) >= 3:
        # Check if bridge is already in messages
        has_bridge = any(
            isinstance(m, SystemMessage) and "Above is the conversation history" in (m.content or "")
            for m in messages_to_send
        )
        if not has_bridge and isinstance(messages_to_send[-1], HumanMessage):
            messages_to_send = messages_to_send[:-1] + [_HISTORY_BRIDGE, messages_to_send[-1]]

    print(f"\n==================== MAIN AGENT [chat_node] (Iteration: {current_iteration + 1}) ====================")
    print(f"--- MESSAGES SENT TO LLM (Count: {len(messages_to_send)}) ---")
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

    has_tools = bool(tool_calls)
    clean_content = clean_agent_output(response.content or "")
    # When issuing tool calls, preamble text like "Let me search..." is NOT the final answer.
    # Only treat content as answer when no tools are called.
    answer = "" if has_tools else clean_content

    if not reasoning and tool_calls:
        desc_list = []
        for tc in tool_calls:
            t_name = tc["name"]
            t_args = tc["args"]
            q_val = t_args.get("query") or t_args.get("prompt") or (json.dumps(t_args) if t_args else "")
            desc_list.append(f"Analyzing request. Delegating task to {t_name}: '{q_val}'")
        reasoning = "\n".join(desc_list)
    elif not reasoning and clean_content:
        reasoning = clean_content

    if reasoning:
        print(f"[MAIN AGENT REASONING]: {reasoning}")
    if tool_calls:
        print(f"[MAIN AGENT TOOL CALLS]: {tool_calls}")
    if response.content:
        print(f"[MAIN AGENT RESPONSE PREVIEW]: {repr(response.content[:200])}...")

    return {
        "messages": [response],
        "answer": answer,
        "reasoning": reasoning,
        "tool_calls": tool_calls,
        "input_tokens": state.get("input_tokens", 0) + usage.get("input_tokens", 0),
        "output_tokens": state.get("output_tokens", 0) + usage.get("output_tokens", 0),
        "iterations": current_iteration + 1,
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

                clean_answer = parsed.get("answer", content)
                if isinstance(clean_answer, (dict, list)):
                    clean_answer = json.dumps(clean_answer)
                else:
                    clean_answer = str(clean_answer)

                if not clean_answer.strip():
                    clean_answer = content if isinstance(content, str) else json.dumps(parsed)
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
    Graph-enforced synthesis node for Main Agent — called when MAX_ITERATIONS-1 (5)
    tool iterations are completed, or if iteration limit is reached.
    Uses the base LLM (NO tools bound) so the model physically cannot call
    any tool and is forced to summarize all collected results.
    """
    raw_messages = state.get("messages", [])
    clean_messages = sanitize_messages(raw_messages)

    # CRITICAL: Strip any trailing assistant messages (especially unexecuted tool calls or preamble)
    # so the synthesis LLM is presented with clean message history ending with tool results.
    clean_messages_for_synthesis = list(clean_messages)
    while clean_messages_for_synthesis and isinstance(clean_messages_for_synthesis[-1], AIMessage):
        clean_messages_for_synthesis.pop()

    synthesis_prompt = SystemMessage(
        content=(
            "You are a helpful, accurate Cortex AI assistant. You have completed all research and tool operations.\n"
            "Using the gathered information and results from tools and sub-agents provided above, write a comprehensive, factual final answer addressing all parts of the user's request.\n\n"
            "RULES:\n"
            "1. Synthesize all concrete details, findings, project knowledge citations, and data collected across all tool executions.\n"
            "2. Citation Rule: If project knowledge was retrieved with citations (e.g. [cite: doc_12:p4]), include citations exactly as provided. Never wrap citation tags in backticks.\n"
            "3. If some requested items could not be found or fulfilled, report all verified facts for the items found, and clearly state what was missing. Never return an empty answer.\n"
            "4. Do not ask for more information or suggest running more tools. Do not mention iteration limits."
        )
    )

    messages_to_send = [synthesis_prompt] + clean_messages_for_synthesis + [
        HumanMessage(
            content="Synthesize all the gathered information and tool results above and provide a complete, well-structured final answer now."
        )
    ]

    current_iteration = state.get("iterations", 0)
    print(f"\n==================== MAIN AGENT [force_synthesis_node] (Iteration: {current_iteration + 1}) ====================")
    print(f"--- MESSAGES SENT TO SYNTHESIS LLM (Count: {len(messages_to_send)}) ---")
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

    # llm_base has NO tools bound — LLM cannot call tools even if it tries
    response = await llm_base.ainvoke(messages_to_send)
    usage = response.usage_metadata or {}
    reasoning = response.additional_kwargs.get("reasoning_content", "")
    answer_text = clean_agent_output(response.content or "")

    # Robust fallback: if LLM returned empty or whitespace, synthesize directly from ToolMessages
    if not answer_text:
        findings = []
        for msg in clean_messages_for_synthesis:
            if isinstance(msg, ToolMessage) and msg.content:
                text = msg.content.strip()
                if text and text != "Tool execution completed.":
                    findings.append(text)
        if findings:
            answer_text = "Summary of gathered findings:\n\n" + "\n\n---\n\n".join(findings)
        elif state.get("chunks"):
            answer_text = f"Retrieved {len(state['chunks'])} relevant project document passages."
        elif state.get("sources"):
            urls = [s.get("url") for s in state["sources"] if s.get("url")]
            answer_text = "Web research gathered sources: " + ", ".join(urls[:5])
        else:
            answer_text = "I have completed the operations but no detailed results were returned."

    if reasoning:
        print(f"[MAIN AGENT FORCE SYNTHESIS REASONING]: {reasoning}")
    if answer_text:
        print(f"[MAIN AGENT FORCE SYNTHESIS RESPONSE PREVIEW]: {repr(answer_text[:200])}...")

    return {
        "messages": [response],
        "answer": answer_text,
        "reasoning": reasoning,
        "tool_calls": [],
        "input_tokens": state.get("input_tokens", 0) + usage.get("input_tokens", 0),
        "output_tokens": state.get("output_tokens", 0) + usage.get("output_tokens", 0),
        "iterations": current_iteration + 1,
    }


def route_after_chat(state: AnswerState):
    iterations = state.get("iterations", 0)
    last_message = state["messages"][-1]
    has_tool_calls = bool(getattr(last_message, "tool_calls", None))

    # A normal answer without tool calls is complete.
    if not has_tool_calls:
        return END

    # Safety net: If iteration limit reached while requesting a tool, route to synthesis
    if iterations >= MAX_ITERATIONS:
        return "force_synthesis_node"

    return "tool_node"


def route_after_tools(state: AnswerState):
    iterations = state.get("iterations", 0)
    # If we have reached MAX_ITERATIONS - 1 (5 iterations), we have performed the maximum allowed tool runs.
    # Do NOT go back to chat_node (which has tools bound and would waste a turn requesting another tool).
    # Instead, route directly to force_synthesis_node on the 6th iteration so the base LLM synthesizes all gathered results!
    if iterations >= MAX_ITERATIONS - 1:
        return "force_synthesis_node"
    return "chat_node"
