"""
agentic.teams.decisions.tools
==============================
Decision Agent Tools module.

Exposes LangChain tools `@tool` for:
1. `store_decision_tool`: Storing team decisions.
2. `search_decisions_tool`: Searching team decisions using hybrid RRF search
   and synthesizing answers using the Decision Generator LLM.
"""

import json
from typing import Optional, List, Union, Dict, Any
from langchain_core.tools import tool

from agentic.tools import get_active_project_context
from agentic.teams.decisions.store import store_decision
from agentic.teams.decisions.retriever import hybrid_search_decisions
from agentic.teams.decisions.generator import generate_decision_answer


@tool("store_decision_tool")
def store_decision_tool(
    title: str,
    description: str,
    created_by: Optional[int] = None,
    participants: Optional[List[Union[int, Dict[str, Any]]]] = None
) -> str:
    """
    Store a formal team decision into persistent long-term memory.

    Parameters:
    - title: A concise, descriptive, and searchable decision title.
    - description: Comprehensive decision content including context, reasoning, and technical specifications.
    - created_by: User ID of the person recording/creating the decision.
    - participants: List of participant user IDs or dicts with role info (e.g. [{"user_id": 9, "role": "Developer"}]).
      Each user id must be unique
    """
    ctx = get_active_project_context()
    db = ctx.get("db")
    team_id = ctx.get("team_id")
    context_user_id = ctx.get("user_id")

    if not db or not team_id:
        return json.dumps({
            "status": "error",
            "message": "Missing active database session or team_id in context."
        })

    effective_created_by = created_by if created_by is not None else context_user_id
    if not effective_created_by:
        return json.dumps({
            "status": "error",
            "message": "created_by user ID is required."
        })

    try:
        # Validate and format participants list without writing to decisions DB table
        added_participants = []
        invalid_participants = []
        if participants:
            from models import TeamMember, User
            for item in participants:
                if isinstance(item, int):
                    uid = item
                    role = "Participant"
                elif isinstance(item, dict):
                    uid = item.get("user_id")
                    role = item.get("role") or "Participant"
                else:
                    continue
                if not uid:
                    continue

                if db and team_id:
                    is_member = db.query(TeamMember).filter(
                        TeamMember.team_id == team_id,
                        TeamMember.user_id == uid
                    ).first()
                    if not is_member:
                        invalid_participants.append(uid)
                        continue
                    
                    user = db.query(User).filter(User.user_id == uid).first()
                    name = user.name if user else f"User #{uid}"
                    avatar_url = user.avatar_url if user else None
                else:
                    name = f"User #{uid}"
                    avatar_url = None

                if not any(p["user_id"] == uid for p in added_participants):
                    added_participants.append({
                        "user_id": uid,
                        "name": name,
                        "role": role,
                        "avatar_url": avatar_url
                    })

        participant_notice = ""
        if invalid_participants:
            invalid_str = ", ".join(f"User #{uid}" for uid in invalid_participants)
            participant_notice = f"Note: {invalid_str} is/are not member(s) of team #{team_id} and were not added."

        notice = f"A decision proposal titled '{title}' has been submitted to the team for approval. Any team admin can review, approve, edit, or reject it."
        if participant_notice:
            notice += f" {participant_notice}"

        return json.dumps({
            "status": "success",
            "message": notice,
            "notice": notice,
            "decision_proposal": {
                "id": None,
                "decision_id": None,
                "team_id": team_id,
                "title": title,
                "description": description,
                "created_by": effective_created_by,
                "status": "pending_approval",
                "participants": added_participants,
                "participant_notice": participant_notice,
            }
        }, default=str)
    except Exception as exc:
        return json.dumps({
            "status": "error",
            "message": f"Failed to propose decision: {str(exc)}"
        })


@tool("search_decisions_tool")
def search_decisions_tool(
    query: str,
    limit: int = 5
) -> str:
    """
    Use this Tool to Search for decisions for the current team.
    it returns Decisions made earlier.

    Parameters:
    - query: Clear search query or question in brief describing what decision to look for.
    - limit: Maximum number of relevant decisions to return (default 5).
    """
    ctx = get_active_project_context()
    db = ctx.get("db")
    team_id = ctx.get("team_id")

    if not db or not team_id:
        return json.dumps({
            "status": "error",
            "message": "Missing active database session or team_id in context."
        })

    try:
        raw_decisions = hybrid_search_decisions(
            query=query,
            team_id=team_id,
            db=db,
            limit=limit
        )

        synthesized_answer, generator_usage = generate_decision_answer(
            query=query,
            decisions=raw_decisions
        )

        decisions_summary = [
            {
                "decision_id": d.get("decision_id"),
                "title": d.get("title"),
                "rrf_score": d.get("rrf_score"),
                "created_at": str(d.get("created_at")),
            }
            for d in raw_decisions
        ]

        return json.dumps({
            "status": "success",
            "synthesized_answer": synthesized_answer,
            "matching_decisions": decisions_summary,
            "usage": generator_usage
        }, default=str)
    except Exception as exc:
        return json.dumps({
            "status": "error",
            "message": f"Failed to search decisions: {str(exc)}"
        })
