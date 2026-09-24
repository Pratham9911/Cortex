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
