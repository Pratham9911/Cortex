import os
import json
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

from langchain_core.messages import ToolMessage, AIMessage, HumanMessage, SystemMessage
from langchain_fireworks import ChatFireworks
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt

from database import SessionLocal
from agentic.github.github_service import (
    get_github_mcp_client_for_user,
    filter_github_mcp_tools,
    load_github_tool_config,
)
from agentic.sub_agents.base import SubAgentResult, SubAgentEventCallback

load_dotenv()

MAX_ITERATIONS = 8

# The main graph re-enters a tool node when an interrupt is resumed. Keep the
# in-flight GitHub runtime so that re-entry resumes the approval request
# instead of rediscovering the user's GitHub state from scratch.
_PENDING_GITHUB_RUNS: dict[str, dict] = {}

SYSTEM_PROMPT = SystemMessage(
    content=(
        "You are a specialized GitHub Sub-Agent for Cortex. Your task is to interact with GitHub "
        "repositories, issues, pull requests, files, and branches on behalf of the user using the available GitHub tools.\n\n"
        "RULES:\n"
        "1. Always use get_me() to know User's account if you can't find user ask him back and don't proceed\n"
        "2. Stop calling tools immediately once you have gathered sufficient information or completed the task.\n"
        "3. Provide a clear, structured final answer without repeating raw API outputs unnecessarily."
        "4. If something is failling again and again , stop and tell user to be more specific and provide more information about the request\n"
    )
)


def get_github_llm():
    return ChatFireworks(
        model="accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b",
        api_key=os.getenv("FIREWORKS_API_KEY"),
        temperature=0,
    )


def sanitize_github_messages(messages: list) -> list:
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
            result_text = str(content)
            if isinstance(content, (dict, list)):
                result_text = json.dumps(content)

            sanitized.append(
                ToolMessage(
                    content=result_text,
                    tool_call_id=msg.tool_call_id,
                    name=msg.name,
                    id=getattr(msg, "id", None),
                )
            )
            continue

        sanitized.append(msg)
    return sanitized


def get_clean_tool_name(raw_name: str) -> str:
    clean = raw_name
    for prefix in ["github__", "github_", "mcp__"]:
        if clean.startswith(prefix):
            clean = clean[len(prefix):]
    return clean


async def run_github_agent(
    query: str,
    user_id: int = 1,
    db: Optional[Any] = None,
    thread_id: Optional[str] = None,
    resume_action: Optional[str] = None,
    resume_feedback: Optional[str] = None,
    event_callback: SubAgentEventCallback = None,
) -> SubAgentResult:
    """
    Execute GitHub Sub-Agent graph for a user query.
    Handles MCP tool discovery, risk classification (read vs write/destructive),
    emits real-time streaming events, and enforces HITL tool approval for write operations.
    """
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        pending_key = thread_id
        pending_run = _PENDING_GITHUB_RUNS.get(pending_key) if pending_key else None

        if pending_run:
            # Reuse the already discovered MCP tools and conversation state.
            tool_map = pending_run["tool_map"]
            tool_config = pending_run["tool_config"]
            tool_risk_map = pending_run["tool_risk_map"]
            llm = pending_run["llm"]
        else:
            # Step 1: Connect to the user's GitHub MCP client and load tools.
            try:
                client = await get_github_mcp_client_for_user(user_id=user_id, db=db)
                discovered_tools = await client.get_tools()
                selected_tools, config = filter_github_mcp_tools(discovered_tools, log_summary=False)
            except (ValueError, Exception) as conn_err:
                print(f"[GitHub Sub-Agent] Connection exception: {conn_err}")
                not_connected_msg = (
                    "GitHub is not connected for your Cortex account. "
                    "Please go to Settings > Connectors in Cortex and connect your GitHub App integration."
                )
                if event_callback:
                    event_callback(
                        "agent_completed",
                        agent="github_agent",
                        answer=not_connected_msg,
                        input_tokens=0,
                        output_tokens=0,
                    )
                return {
                    "agent_name": "github_agent",
                    "answer": not_connected_msg,
                    "sources": [],
                    "input_tokens": 0,
                    "output_tokens": 0,
                }

            tool_map = {t.name: t for t in selected_tools}
            tool_config = config.get("github", {}).get("tools", {})
            tool_risk_map = {}
            for t in selected_tools:
                raw = t.name
                clean = get_clean_tool_name(raw)
                entry = tool_config.get(clean) or tool_config.get(raw) or {}
                risk = entry.get("risk") or getattr(t, "metadata", {}).get("risk_level") or "write"
                tool_risk_map[raw] = risk
                tool_risk_map[clean] = risk

            llm = get_github_llm().bind_tools(selected_tools)

        if event_callback and not pending_run:
            event_callback("agent_started", agent="github_agent", goal=query)

        if pending_run:
            messages = pending_run["messages"]
            input_tokens = pending_run["input_tokens"]
            output_tokens = pending_run["output_tokens"]
            final_answer = pending_run["final_answer"]
            iteration = pending_run["iteration"]
            last_response_had_tool_calls = True
            pending_call = pending_run["pending_call"]
            _PENDING_GITHUB_RUNS.pop(pending_key, None)
        else:
            messages = [SYSTEM_PROMPT, HumanMessage(content=query)]
            input_tokens = 0
            output_tokens = 0
            final_answer = ""
            iteration = 0
            last_response_had_tool_calls = False
            pending_call = None

        # Some nested-interrupt runtimes return the original interrupt payload
        # when the main tool node is re-entered. Keep the explicit resume
        # decision as a one-time fallback for that case.
        resume_action_for_interrupt = (resume_action or "").strip().lower() or None
        resume_feedback_for_interrupt = resume_feedback or ""

        while iteration < MAX_ITERATIONS:
            if pending_call is not None:
                tool_calls = [pending_call]
                pending_call = None
            else:
                iteration += 1
                clean_messages = sanitize_github_messages(messages)

                # LLM Invocation
                response = await llm.ainvoke(clean_messages)
                usage = getattr(response, "usage_metadata", {}) or {}
                input_tokens += usage.get("input_tokens", 0)
                output_tokens += usage.get("output_tokens", 0)
                reasoning = response.additional_kwargs.get("reasoning_content", "")

                messages.append(response)

                if response.content:
                    final_answer = response.content

                if event_callback and reasoning:
                    event_callback(
                        "reasoning",
                        agent="github_agent",
                        iteration=iteration,
                        content=reasoning,
                    )

                tool_calls = getattr(response, "tool_calls", [])
                if not tool_calls:
                    # Agent decided to finish and return text answer
                    last_response_had_tool_calls = False
                    break

                last_response_had_tool_calls = True

            # Execute tool calls sequentially
            for call in tool_calls:
                call_id = call.get("id")
                tool_name = call.get("name")
                clean_name = get_clean_tool_name(tool_name)
                tool_args = call.get("args", {})
                risk_level = tool_risk_map.get(tool_name) or tool_risk_map.get(clean_name) or tool_config.get(clean_name, {}).get("risk", "write")

                if event_callback:
                    event_callback(
                        "tool_started",
                        agent="github_agent",
                        iteration=iteration,
                        tool=tool_name,
                        args=tool_args,
                        call_id=call_id,
                    )

                # Check tool risk: if risk is NOT read -> PUT HITL IN FRONT OF USER!
                if risk_level != "read":

                    # Trigger Human-in-The-Loop interrupt for permission approval
                    approval_request = {
                        "action": "tool_approval",
                        "agent": "github_agent",
                        "tool": tool_name,
                        "args": tool_args,
                        "risk": risk_level,
                        "description": tool_config.get(clean_name, {}).get(
                            "description", tool_config.get(tool_name, {}).get("description", "GitHub action request")
                        ),
                    }
                    if pending_key:
                        _PENDING_GITHUB_RUNS[pending_key] = {
                            "messages": messages,
                            "input_tokens": input_tokens,
                            "output_tokens": output_tokens,
                            "final_answer": final_answer,
                            "iteration": iteration,
                            "pending_call": call,
                            "tool_map": tool_map,
                            "tool_config": tool_config,
                            "tool_risk_map": tool_risk_map,
                            "llm": llm,
                        }

                    approval_res = interrupt(approval_request)

                    decision = ""
                    feedback = ""
                    if isinstance(approval_res, dict):
                        decision = str(
                            approval_res.get("action")
                            or approval_res.get("decision")
                            or approval_res.get("approval")
                            or ""
                        ).lower()
                        feedback = str(approval_res.get("feedback", "")).strip()
                    elif isinstance(approval_res, str):
                        decision = str(approval_res).lower()

                    recognized_decisions = {
                        "yes", "approve", "approved", "accept", "true",
                        "no", "reject", "rejected", "false", "tell_agent",
                    }
                    if decision not in recognized_decisions and resume_action_for_interrupt:
                        decision = resume_action_for_interrupt
                        feedback = resume_feedback_for_interrupt
                    resume_action_for_interrupt = None

                    approved = decision in ["yes", "approve", "approved", "accept", "true"]
                    is_rejection = decision in ["no", "reject", "rejected", "false"]

                    if approved:
                        # Executed by system upon approval
                        try:
                            mcp_tool = tool_map.get(tool_name)
                            if mcp_tool:
                                res = await mcp_tool.ainvoke(tool_args)
                                res_text = f"Tool executed successfully. Result:\n{str(res)}"
                            else:
                                res_text = f"Error: Tool '{tool_name}' not found."
                        except Exception as ex:
                            res_text = f"Error executing tool '{tool_name}': {str(ex)}"
                    elif is_rejection:
                        res_text = (
                            f"Execution of tool '{tool_name}' was REJECTED by the user. "
                            "Do NOT retry calling this tool. Adapt your response accordingly."
                        )
                    else:
                        # User provided feedback / instructions without approving the tool call
                        res_text = (
                            f"Tool '{tool_name}' was not approved. "
                            f"The user provided this instruction instead: '{feedback or decision}'. "
                            "Do not retry the tool unless the user explicitly asks for it."
                        )

                else:
                    # Read tool: execute automatically
                    try:
                        mcp_tool = tool_map.get(tool_name)
                        if mcp_tool:
                            res = await mcp_tool.ainvoke(tool_args)
                            res_text = str(res)
                        else:
                            res_text = f"Error: Tool '{tool_name}' not found."
                    except Exception as ex:
                        res_text = f"Error executing tool '{tool_name}': {str(ex)}"

                # Append tool response message
                tool_msg = ToolMessage(
                    content=res_text,
                    tool_call_id=call_id,
                    name=tool_name,
                )
                messages.append(tool_msg)

                if event_callback:
                    event_callback(
                        "tool_completed",
                        agent="github_agent",
                        tool=tool_name,
                    )

        # The final allowed LLM turn may have requested tools successfully,
        # but there is no next turn available to turn those results into prose.
        # Synthesize once with the base model, which has no tools bound.
        if last_response_had_tool_calls and iteration >= MAX_ITERATIONS:
            clean_messages = sanitize_github_messages(messages)
            synthesis_prompt = SystemMessage(
                content=(
                    "You have reached the GitHub agent iteration limit. "
                    "Using ONLY the GitHub tool results gathered so far, provide a clear, complete final answer. "
                    "Do not request more tools and do not mention the iteration limit."
                )
            )
            synthesis_response = await get_github_llm().ainvoke(
                [synthesis_prompt] + clean_messages
            )
            synthesis_usage = getattr(synthesis_response, "usage_metadata", {}) or {}
            input_tokens += synthesis_usage.get("input_tokens", 0)
            output_tokens += synthesis_usage.get("output_tokens", 0)
            if synthesis_response.content:
                final_answer = synthesis_response.content

        if not final_answer.strip():
            final_answer = "GitHub agent completed tasks."

        if event_callback:
            event_callback(
                "agent_completed",
                agent="github_agent",
                answer=final_answer,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )

        return {
            "agent_name": "github_agent",
            "answer": final_answer,
            "sources": [],
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }

    finally:
        if close_db and db is not None:
            try:
                db.close()
            except Exception:
                pass
