"""
agentic.teams.decisions.runner
==============================
Decision Agent Runner module.

Provides a clean invocation interface `run_decision_agent(...)` for executing
the Decision Sub-Agent in store or search mode, with live iteration step printing.
"""

import json
from typing import Optional, Callable, List, Dict, Any, Union
from sqlalchemy.orm import Session
from langchain_core.messages import HumanMessage

from agentic.tools import set_active_project_context, set_active_event_callback
from agentic.teams.decisions.agent import decision_graph
from agentic.teams.decisions.state import DecisionAgentState


async def run_decision_agent(
    query_or_overview: str,
    team_id: int,
    db: Session,
    action: str = "auto",  # "store" | "search" | "auto"
    created_by: Optional[int] = None,
    participants: Optional[List[Union[int, Dict[str, Any]]]] = None,
    event_callback: Optional[Callable] = None,
    verbose: bool = True,
) -> Dict[str, Any]:
    """
    Execute the Decision Agent workflow.

    Parameters:
    - query_or_overview: Brief overview of the decision to store, or query text to search.
    - team_id: Team ID context for scoping.
    - db: SQLAlchemy DB session.
    - action: "store", "search", or "auto" (default: "auto").
    - created_by: User ID of creator (for store action).
    - participants: List of participant user IDs or dicts with roles. [{"user_id": ID, "role": "Role"}]

    """
    # 1. Set context for tools
    set_active_project_context(
        db=db,
        team_id=team_id,
        user_id=created_by,
    )

    if event_callback:
        set_active_event_callback(event_callback)

    # 2. Build task message for LLM
    if action == "store":
        prompt_content = (
            f"TASK: STORE DECISION\n"
            f"Overview: {query_or_overview}\n"
            f"Created By User ID: {created_by}\n"
            f"Participants: {json.dumps(participants or [])}\n\n"
            f"Please format a clean title and comprehensive description, then call `store_decision_tool`."
        )
    elif action == "search":
        prompt_content = (
            f"TASK: SEARCH DECISIONS\n"
            f"Query: {query_or_overview}\n\n"
            f"Please call `search_decisions_tool` with this query and summarize the results."
        )
    else:
        prompt_content = query_or_overview

    initial_state: DecisionAgentState = {
        "messages": [HumanMessage(content=prompt_content)],
        "action": action,
        "query_or_overview": query_or_overview,
        "team_id": team_id,
        "created_by": created_by,
        "participants": participants,
        "answer": "",
        "reasoning": "",
        "decision_result": None,
        "tool_calls": [],
        "input_tokens": 0,
        "output_tokens": 0,
        "iterations": 0,
    }

    if verbose:
        print("\n" + "=" * 65)
        print(f"[DECISION AGENT WORKFLOW STARTED | Action: '{action}']")
        print(f"Goal/Input: \"{query_or_overview}\"")
        print("=" * 65)

    final_answer = ""
    final_decision_result = None
    input_tokens = 0
    output_tokens = 0

    async for update in decision_graph.astream(initial_state, stream_mode="updates"):
        for node_name, node_update in update.items():
            iteration = node_update.get("iterations", 0)

            if node_name == "decision_chat_node":
                tool_calls = node_update.get("tool_calls", [])
                answer = node_update.get("answer", "")
                reasoning = node_update.get("reasoning", "")

                if verbose:
                    print(f"\n[Step {iteration}] NODE: decision_chat_node")
                    if reasoning:
                        print(f"  ├─ Thinking/Reasoning: {reasoning}")
                    if tool_calls:
                        print(f"  ├─ Decision: Invoke Tool Call(s):")
                        for tc in tool_calls:
                            print(f"  │    ├─ Tool : {tc['name']}")
                            print(f"  │    └─ Args : {json.dumps(tc['args'], default=str)}")
                    else:
                        print(f"  ├─ Decision: Final Answer Formulated (No further tool calls required)")
                        print(f"  └─ Next State: Transitioning to [END]")

                if answer:
                    final_answer = answer
                input_tokens = node_update.get("input_tokens", input_tokens)
                output_tokens = node_update.get("output_tokens", output_tokens)

                if event_callback and tool_calls:
                    for call in tool_calls:
                        event_callback(
                            "tool_started",
                            agent="decision_agent",
                            iteration=iteration,
                            tool=call["name"],
                            args=call["args"],
                        )

            elif node_name == "decision_tool_node":
                if verbose:
                    print(f"\n[Step {iteration}] NODE: decision_tool_node")
                    print(f"  └─ Executing tool call in environment...")

            elif node_name == "collect_decision_tool_results":
                res = node_update.get("decision_result")
                if res:
                    final_decision_result = res

                if verbose:
                    print(f"\n[Step {iteration}] NODE: collect_decision_tool_results")
                    print(f"  ├─ Tool Output Collected & Structured.")
                    if isinstance(res, dict) and "synthesized_answer" in res:
                        ans_preview = res['synthesized_answer'].replace('\n', ' ')
                        if len(ans_preview) > 120:
                            ans_preview = ans_preview[:120] + "..."
                        print(f"  ├─ Generator Synthesized Answer: \"{ans_preview}\"")
                    elif isinstance(res, dict) and "id" in res:
                        print(f"  ├─ Stored Decision ID #{res['id']} ('{res.get('title')}')")
                    print(f"  └─ Next State: Returning to [decision_chat_node] for synthesis")

    if not final_answer.strip():
        final_answer = "Decision Agent task completed."

    if verbose:
        print("\n" + "=" * 65)
        print("[DECISION AGENT WORKFLOW FINISHED]")
        print("=" * 65 + "\n")

    return {
        "answer": final_answer,
        "decision_result": final_decision_result,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
    }
