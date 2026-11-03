from langgraph.graph import StateGraph, START, END

from agentic.nodes import (
    chat_node,
    tool_node,
    collect_tool_results,
    force_synthesis_node,
    route_after_chat,
    route_after_tools,
)
from agentic.state.main_state import AnswerState


graph = StateGraph(AnswerState)

graph.add_node("chat_node", chat_node)
graph.add_node("tool_node", tool_node)
graph.add_node("collect_tool_results", collect_tool_results)
graph.add_node("force_synthesis_node", force_synthesis_node)

graph.add_edge(START, "chat_node")

graph.add_conditional_edges(
    "chat_node",
    route_after_chat,
    {
        "tool_node": "tool_node",
        "force_synthesis_node": "force_synthesis_node",
        END: END,
    },
)

graph.add_edge("tool_node", "collect_tool_results")
graph.add_conditional_edges(
    "collect_tool_results",
    route_after_tools,
    {
        "chat_node": "chat_node",
        "force_synthesis_node": "force_synthesis_node",
    },
)
graph.add_edge("force_synthesis_node", END)

workflow = graph.compile()

