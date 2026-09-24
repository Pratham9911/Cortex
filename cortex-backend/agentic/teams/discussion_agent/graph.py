from langgraph.graph import StateGraph, START, END

from agentic.teams.discussion_agent.state import DiscussionAgentState
from agentic.teams.discussion_agent.nodes import (
    discussion_chat_node,
    discussion_tool_node,
    collect_discussion_tool_results,
    discussion_force_synthesis_node,
    discussion_route_after_chat,
)


def build_discussion_workflow():
    builder = StateGraph(DiscussionAgentState)

    builder.add_node("discussion_chat_node", discussion_chat_node)
    builder.add_node("discussion_tool_node", discussion_tool_node)
    builder.add_node("collect_discussion_tool_results", collect_discussion_tool_results)
    builder.add_node("discussion_force_synthesis_node", discussion_force_synthesis_node)

    builder.add_edge(START, "discussion_chat_node")
    builder.add_conditional_edges(
        "discussion_chat_node",
        discussion_route_after_chat,
        {
            "discussion_tool_node": "discussion_tool_node",
            "discussion_force_synthesis_node": "discussion_force_synthesis_node",
            END: END,
        },
    )
    builder.add_edge("discussion_tool_node", "collect_discussion_tool_results")
    builder.add_edge("collect_discussion_tool_results", "discussion_chat_node")
    builder.add_edge("discussion_force_synthesis_node", END)

    return builder.compile()


discussion_graph = build_discussion_workflow()
