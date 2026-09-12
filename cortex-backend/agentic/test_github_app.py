"""
test_github_app.py — Isolated test agent for the GitHub App integration.

Tests the full GitHub App flow:
  - Loads user's GitHub App token from DB (integration_type="github_app")
  - Proactively refreshes ghu_ token if near expiry
  - Connects to GitHub Remote MCP via MultiServerMCPClient
  - Filters tools through allowed_tools.json registry
  - Runs LangGraph agent loop with per-turn input logging

Usage:
    python agentic/test_github_app.py <user_id> "<prompt>"
    python agentic/test_github_app.py 9 "List my GitHub repositories"
"""
import os
import sys
import json
import asyncio
from typing import Annotated, TypedDict

# Ensure backend root is in path when run directly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from database import SessionLocal
from agentic.github.github_service import (
    get_github_mcp_client_for_user,
    filter_github_mcp_tools,
    get_github_connection,
)
from langchain_core.messages import (
    BaseMessage, HumanMessage, AIMessage, ToolMessage, SystemMessage
)
from langchain_core.utils.function_calling import convert_to_openai_tool
from langchain_fireworks import ChatFireworks
from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

load_dotenv()


class ChatState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    input_tokens: int
    output_tokens: int


def get_llm():
    """Returns ChatFireworks LLM aligned with Cortex agentic setup."""
    fireworks_key = os.getenv("FIREWORKS_API_KEY")
    if not fireworks_key:
        raise ValueError("FIREWORKS_API_KEY not found in environment (.env).")
    return ChatFireworks(
        model="accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b",
        api_key=fireworks_key,
        temperature=0,
    )


async def run_github_app_test(user_id: int, prompt: str):
    db = SessionLocal()
    try:
        # ── Pre-flight: show connection info ────────────────────────────────
        conn = get_github_connection(user_id=user_id, db=db)
        if conn:
            print("\n" + "=" * 70)
            print("=== GITHUB APP CONNECTION INFO ===")
            print(f"  User ID:          {user_id}")
            print(f"  Integration type: {conn['integration_type']}")
            print(f"  GitHub login:     {conn.get('github_login') or conn.get('account_email')}")
            print(f"  Installation ID:  {conn.get('installation_id', 'N/A')}")
            print(f"  Token expires:    {conn.get('token_expires_at', 'N/A (no expiry set)')}")
            token_preview = conn["access_token"][:8] + "..."
            print(f"  Token prefix:     {token_preview}")
            print("=" * 70 + "\n")

        # ── 1. Obtain MCP Client ─────────────────────────────────────────────
        try:
            client = await get_github_mcp_client_for_user(user_id=user_id, db=db)
        except ValueError:
            # GitHub not connected — let agent explain naturally
            llm = get_llm()
            system_ctx = SystemMessage(
                content=(
                    "The user's GitHub account is not connected to Cortex. "
                    "Tell the user their GitHub is not connected and guide them: "
                    "go to Settings → Connectors and click Connect next to GitHub."
                )
            )
            response = await llm.ainvoke([system_ctx, HumanMessage(content=prompt)])
            print("\n=== AGENT RESPONSE ===")
            print(response.content)
            print("=" * 70 + "\n")
            return

        # ── 2. MCP tool discovery ────────────────────────────────────────────
        print("Discovering GitHub MCP tools...")
        all_discovered_tools = await client.get_tools()

        # ── 3. Filter with allowed_tools.json registry ───────────────────────
        selected_tools, tool_config = filter_github_mcp_tools(
            discovered_tools=all_discovered_tools,
            log_summary=True,
        )

        # ── 4. Context reduction diagnostic ─────────────────────────────────
        schema_chars_all = 0
        for t in all_discovered_tools:
            try:
                schema_chars_all += len(json.dumps(convert_to_openai_tool(t)))
            except Exception:
                schema_chars_all += 500

        schema_chars_selected = 0
        for t in selected_tools:
            try:
                schema_chars_selected += len(json.dumps(convert_to_openai_tool(t)))
            except Exception:
                schema_chars_selected += 500

        saved_chars = schema_chars_all - schema_chars_selected
        saved_est_tokens = saved_chars // 4

        print("=== CONTEXT SCHEMAS REDUCTION DIAGNOSTIC ===")
        print(f"Discovered MCP tools:            {len(all_discovered_tools)} tools (~{schema_chars_all // 4} tokens)")
        print(f"Tools exposed to LLM (Enabled):  {len(selected_tools)} tools (~{schema_chars_selected // 4} tokens)")
        print(f"Context Saved Per Turn:          ~{saved_chars} chars (~{saved_est_tokens} tokens)")
        print("=" * 60 + "\n")

        print("=== ENABLED GITHUB MCP TOOLS ===")
        for i, tool in enumerate(selected_tools, 1):
            name = getattr(tool, "name", "unknown")
            meta = getattr(tool, "metadata", {}) or {}
            risk = meta.get("risk_level", "read")
            desc = meta.get("registry_description", "") or getattr(tool, "description", "") or ""
            desc_line = desc.strip().split("\n")[0]
            print(f"[{i:02d}] {name} (risk={risk}): {desc_line}")
        print("=" * 60 + "\n")

        # ── 5. Build LangGraph agent ─────────────────────────────────────────
        llm = get_llm()
        llm_with_tools = llm.bind_tools(selected_tools)
        turn_counter = 0

        async def chat_node(state: ChatState):
            nonlocal turn_counter
            turn_counter += 1
            messages = state["messages"]

            print(f"\n{'=' * 70}")
            print(f">>> [LLM CALL #{turn_counter}] — INPUT MESSAGES ({len(messages)} total) <<<")
            print(f"{'=' * 70}")
            for idx, msg in enumerate(messages, 1):
                role = type(msg).__name__.replace("Message", "").upper()
                raw_content = msg.content if isinstance(msg.content, str) else str(msg.content)
                content_preview = raw_content[:2400] + ("..." if len(raw_content) > 2400 else "")

                print(f"\n  [{idx}] {role}")
                if content_preview.strip():
                    print(f"       Content: {content_preview}")

                tool_calls = getattr(msg, "tool_calls", None)
                if tool_calls:
                    for tc in tool_calls:
                        args_str = json.dumps(tc.get("args", {}), indent=10)[:300]
                        print(f"       ToolCall → {tc['name']}({args_str})")

                tool_call_id = getattr(msg, "tool_call_id", None)
                if tool_call_id:
                    print(f"       ToolCallID: {tool_call_id}")

            print(f"\n{'─' * 70}")

            response = await llm_with_tools.ainvoke(messages)

            usage = getattr(response, "usage_metadata", None) or {}
            if not usage and hasattr(response, "response_metadata"):
                resp_meta = getattr(response, "response_metadata", {}) or {}
                usage = resp_meta.get("token_usage") or resp_meta.get("usage") or {}

            in_tok = usage.get("input_tokens", 0) or usage.get("prompt_tokens", 0)
            out_tok = usage.get("output_tokens", 0) or usage.get("completion_tokens", 0)

            print(f"  -> Turn #{turn_counter} Token Usage: Input={in_tok} | Output={out_tok} | Turn Total={in_tok + out_tok}")

            return {
                "messages": [response],
                "input_tokens": state.get("input_tokens", 0) + in_tok,
                "output_tokens": state.get("output_tokens", 0) + out_tok,
            }

        tool_node = ToolNode(selected_tools)

        graph = StateGraph(ChatState)
        graph.add_node("chat_node", chat_node)
        graph.add_node("tools", tool_node)
        graph.add_edge(START, "chat_node")
        graph.add_conditional_edges("chat_node", tools_condition)
        graph.add_edge("tools", "chat_node")
        chatbot = graph.compile()

        # ── 6. Execute prompt ────────────────────────────────────────────────
        print("=" * 70)
        print(f"[PROMPT]: {prompt}")
        print("=" * 70)

        final_response = ""
        seen_tool_call_ids = set()
        total_input_tokens = 0
        total_output_tokens = 0

        async for event in chatbot.astream(
            {
                "messages": [HumanMessage(content=prompt)],
                "input_tokens": 0,
                "output_tokens": 0,
            },
            stream_mode="values",
        ):
            if "input_tokens" in event:
                total_input_tokens = event["input_tokens"]
            if "output_tokens" in event:
                total_output_tokens = event["output_tokens"]

            messages = event.get("messages", [])
            if not messages:
                continue

            latest_msg = messages[-1]

            if isinstance(latest_msg, AIMessage) and latest_msg.tool_calls:
                for call in latest_msg.tool_calls:
                    call_id = call.get("id") or f"{call['name']}_{call.get('args')}"
                    if call_id not in seen_tool_call_ids:
                        seen_tool_call_ids.add(call_id)
                        print("\n=== MCP TOOL CALL ===")
                        print(f"Tool: {call['name']}")
                        print(f"Arguments: {json.dumps(call['args'], indent=2)}")

            if isinstance(latest_msg, AIMessage) and latest_msg.content and not latest_msg.tool_calls:
                final_response = latest_msg.content

        print("\n" + "=" * 70)
        print("=== FINAL RESPONSE ===")
        print(final_response if final_response else "(No text response)")
        print("=" * 70)

        print("\n=== AGGREGATED TOKEN USAGE ===")
        print(f"Total Input Tokens:  {total_input_tokens}")
        print(f"Total Output Tokens: {total_output_tokens}")
        print(f"Total Tokens:        {total_input_tokens + total_output_tokens}")
        print("=" * 70)

    finally:
        db.close()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    user_id_arg = 9
    prompt_arg = "List the GitHub repositories I have access to."

    if len(sys.argv) > 1:
        try:
            user_id_arg = int(sys.argv[1])
            if len(sys.argv) > 2:
                prompt_arg = " ".join(sys.argv[2:])
        except ValueError:
            prompt_arg = " ".join(sys.argv[1:])

    asyncio.run(run_github_app_test(user_id=user_id_arg, prompt=prompt_arg))
