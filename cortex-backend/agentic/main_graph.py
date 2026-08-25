from langgraph.graph import StateGraph, START, END

from agentic.nodes import (
    chat_node,
    tool_node,
    collect_tool_results,
    route_after_chat,
)
from agentic.state.main_state import AnswerState


graph = StateGraph(AnswerState)

graph.add_node("chat_node", chat_node)
graph.add_node("tool_node", tool_node)
graph.add_node("collect_tool_results", collect_tool_results)

graph.add_edge(START, "chat_node")

graph.add_conditional_edges(
    "chat_node",
    route_after_chat,
    {
        "tool_node": "tool_node",
        END: END,
    },
)

graph.add_edge("tool_node", "collect_tool_results")
graph.add_edge("collect_tool_results", "chat_node")

workflow = graph.compile()