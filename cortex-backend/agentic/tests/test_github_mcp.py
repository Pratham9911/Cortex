import os
import sys
import json
import asyncio
from typing import Annotated, TypedDict

# Ensure backend root directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from dotenv import load_dotenv
from agentic.github.github_service import filter_github_mcp_tools
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, ToolMessage
from langchain_core.utils.function_calling import convert_to_openai_tool
from langchain_fireworks import ChatFireworks
from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_mcp_adapters.client import MultiServerMCPClient

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


async def run_github_mcp_test(prompt: str):
    pat = os.getenv("GITHUB_MCP_PAT")
    if not pat:
        print("[ERROR] GITHUB_MCP_PAT environment variable is not set in .env!")
        print("Please set GITHUB_MCP_PAT=<your_personal_access_token> in your .env file.")
        sys.exit(1)

    print("Connecting to GitHub Remote MCP Server (https://api.githubcopilot.com/mcp/)...")

    # 1. MultiServerMCPClient connection to GitHub's remote MCP server using Streamable HTTP
    client = MultiServerMCPClient(
        {
            "github": {
                "transport": "streamable_http",
                "url": "https://api.githubcopilot.com/mcp/",
                "headers": {
                    "Authorization": f"Bearer {pat}"
                },
            }
        }
    )

    # 2. MCP tool discovery & Registry filtering
    all_tools = await client.get_tools()
    selected_tools, tool_config = filter_github_mcp_tools(discovered_tools=all_tools, log_summary=True)

    # 3. Context & Token Schema reduction diagnostic
    schema_chars_all = 0
    for t in all_tools:
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
    print(f"Discovered MCP tools:            {len(all_tools)} tools (~{schema_chars_all // 4} tokens)")
    print(f"Tools exposed to LLM (Enabled):  {len(selected_tools)} tools (~{schema_chars_selected // 4} tokens)")
    print(f"Context Saved Per Turn:          ~{saved_chars} chars (~{saved_est_tokens} tokens)")
    print("=" * 60 + "\n")

    # 4. LangGraph integration
    llm = get_llm()
    llm_with_tools = llm.bind_tools(selected_tools)

    turn_counter = 0

    async def chat_node(state: ChatState):
        nonlocal turn_counter
        turn_counter += 1

        messages = state["messages"]

        print(f"\n>>> [LLM CALL #{turn_counter}] <<<")
        print(f"Message Count in Context: {len(messages)}")

        response = await llm_with_tools.ainvoke(messages)

        # Extract token usage metadata from response
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

    # 5. Execute prompt and display tool-call visibility, token usage & response
    print("=" * 70)
    print(f"[TEST PROMPT]: {prompt}")
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
    print(f"Total Input Tokens (sum of all turns):  {total_input_tokens}")
    print(f"Total Output Tokens (sum of all turns): {total_output_tokens}")
    print(f"Total Tokens:                          {total_input_tokens + total_output_tokens}")
    print("=" * 70)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    prompt = sys.argv[1] if len(sys.argv) > 1 else "List the GitHub repositories I have access to."
    asyncio.run(run_github_mcp_test(prompt))
