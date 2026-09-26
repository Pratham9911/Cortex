from typing import Optional, List, Union, Dict, Any
from langchain_core.tools import tool
from agentic.tools import get_active_event_callback, get_active_project_context


@tool("discussion_retrieval_agent")
async def discussion_retrieval_agent_tool(query: str) -> dict:
    """
    Delegate internal team and project document research to the specialized Retrieval Agent.
    Use this tool to search internal team files, documentation, and knowledge base.
    Provide a clear task/query statement of what information to search for.
    """
    from agentic.sub_agents.retrieval_agent import run_retrieval_agent

    callback = get_active_event_callback()
    result = await run_retrieval_agent(query=query, event_callback=callback)
    return result


@tool("discussion_web_agent")
async def discussion_web_agent_tool(query: str) -> dict:
    """
    Delegate external web search research to the specialized Web Agent.
    Use this tool to find up-to-date information on the web outside team documents.
    Provide a clear, descriptive research query.
    """
    from agentic.sub_agents.web_agent import run_web_agent

    callback = get_active_event_callback()
    result = await run_web_agent(query=query, event_callback=callback)
    return result


@tool("discussion_decision_agent")
async def discussion_decision_agent_tool(
    action: str,
    query_or_overview: str,
    participants: Optional[List[Union[int, Dict[str, Any]]]] = None
) -> dict:
    """
    Delegate team decision management (recording new team decisions or searching past decisions) to the specialized Decision Sub-Agent.

    Parameters:
    - action: Use "store" when recording a new decision, or "search" when looking up past team decisions.
    - query_or_overview: Comprehensive overview/context of the decision to store, or query text to search for.
    - participants: Optional list of Unique team members involved as participants/approvers with their user_id and optional role (always mention a user id once).
    - For adding Participants or in the descision if any user Id is not known , ask to user to provide or to continue without his id but name.
      Examples:
      [{"user_id": 5, "role": "Lead Architect"}, {"user_id": 9, "role": "Reviewer"}]
      or simple list of user IDs: [5, 9]
    """
    from agentic.teams.decisions import run_decision_agent

    ctx = get_active_project_context()
    db = ctx.get("db")
    team_id = ctx.get("team_id")
    user_id = ctx.get("user_id")
    callback = get_active_event_callback()

    if not db or not team_id:
        return {
            "answer": "Failed to execute decision tool: Missing database session or team context.",
            "decision_proposal": None
        }

    res = await run_decision_agent(
        query_or_overview=query_or_overview,
        team_id=team_id,
        db=db,
        action=action,
        created_by=user_id,
        participants=participants,
        event_callback=callback,
        verbose=False
    )

    return {
        "answer": res.get("answer", ""),
        "decision_proposal": res.get("decision_result") if action == "store" and isinstance(res.get("decision_result"), dict) else None,
        "input_tokens": res.get("input_tokens", 0),
        "output_tokens": res.get("output_tokens", 0),
    }
