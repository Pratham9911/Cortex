import sys
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage

from agentic.main_graph import workflow
from agentic.state.main_state import AnswerState
from agentic.tools import active_event_callback

load_dotenv()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    question = (
        "find the ceo of tinyfish and glean and compare pricing of both and find the best option for a small business with 10 employees"
    )

    initial_state: AnswerState = {
        "messages": [HumanMessage(content=question)],
        "question": question,
        "answer": "",
        "reasoning": "",
        "tool_calls": [],
        "sources": [],
        "input_tokens": 0,
        "output_tokens": 0,
        "iterations": 0,
    }

    def print_agent_event(event_type: str, agent: str = "main", **data):
        print(f"[{agent.upper()} EVENT] {event_type} -> {data}")

    token = active_event_callback.set(print_agent_event)
    try:
        result = workflow.invoke(initial_state)
    finally:
        active_event_callback.reset(token)

    print("\n\n==============================")
    print("FINAL RESULT")
    print("==============================")

    print(f"\nQuestion:")
    print(result.get("question"))

    print(f"\nAnswer:")
    print(result.get("answer"))

    print(f"\nIterations:")
    print(result.get("iterations"))

    print(f"\nInput tokens:")
    print(result.get("input_tokens"))

    print(f"\nOutput tokens:")
    print(result.get("output_tokens"))

    print(f"\nTotal tokens:")
    print(result.get("input_tokens", 0) + result.get("output_tokens", 0))

    print(f"\nSources ({len(result.get('sources', []))} found):")
    for source in result.get("sources", []):
        print(f"- {source.get('title', '')} | {source.get('url', '')}")

