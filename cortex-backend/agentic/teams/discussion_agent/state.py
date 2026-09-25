from typing import TypedDict, Annotated, Optional
from langgraph.graph import add_messages


class DiscussionAgentState(TypedDict):
    messages: Annotated[list, add_messages]
    question: str
    answer: str
    reasoning: str
    tool_calls: list[dict]
    sources: list[dict]
    chunks: list[dict]
    decision_proposal: Optional[dict]
    input_tokens: int
    output_tokens: int
    iterations: int
