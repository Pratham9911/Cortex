"""
agentic.teams.decisions.state
==============================
Decision Agent State module.

Defines the LangGraph state schema for the Decision Agent workflow.
"""

from typing import TypedDict, Annotated, Optional, List, Dict, Any, Union
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class DecisionAgentState(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
    action: str  # "store" | "search" | "auto"
    query_or_overview: str
    team_id: int
    created_by: Optional[int]
    participants: Optional[List[Union[int, Dict[str, Any]]]]
    answer: str
    reasoning: str
    decision_result: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]]
    tool_calls: List[Dict[str, Any]]
    input_tokens: int
    output_tokens: int
    iterations: int
