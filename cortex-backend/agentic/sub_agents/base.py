from typing import TypedDict, Callable, Optional, Any


class SubAgentResult(TypedDict):
    agent_name: str
    answer: str
    sources: list[dict]
    input_tokens: int
    output_tokens: int


# Type for sub-agent streaming event callbacks: emit_fn(event_type, agent_name, **data)
SubAgentEventCallback = Optional[Callable[..., None]]
