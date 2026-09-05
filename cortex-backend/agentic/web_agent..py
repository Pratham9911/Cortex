import os
import json

from dotenv import load_dotenv

from langchain_core.messages import HumanMessage
from langchain_fireworks import ChatFireworks
from langgraph.graph import END

from langgraph.prebuilt import ToolNode


from langchain_core.messages import ToolMessage, AIMessage, HumanMessage, SystemMessage

from agentic.tools import calculator , web_search
from agentic.state.main_state import WebSearchState

load_dotenv()

SYSTEM_PROMPT = SystemMessage(
    content="You are a helpful, accurate AI assistant. do not waste tokens , Use available tools when necessary to provide precise and up-to-date answers."  
)



MAX_ITERATIONS = 10


web_llm = ChatFireworks(
    model="accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b",
    api_key=os.getenv("FIREWORKS_API_KEY"),
    temperature=0,
)


tools = [calculator, web_search]

web_llm = web_llm.bind_tools(tools)

tool_node = ToolNode(tools)

