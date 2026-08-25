
from typing import TypedDict , Annotated


from langgraph.graph import add_messages


class AnswerState(TypedDict):
    messages: Annotated[list, add_messages]
    
    question: str
    answer: str
    reasoning: str
    tool_calls: list[dict]
    sources: list[dict]

    input_tokens: int
    output_tokens: int
    iterations: int