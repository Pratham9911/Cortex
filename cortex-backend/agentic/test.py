import sys
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage

from agentic.main_graph import workflow
from agentic.state.main_state import AnswerState
from agentic.tools import set_active_event_callback, set_active_project_context
from database import SessionLocal

load_dotenv()


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    # --- Configure test parameters ---
    PROJECT_ID = 1
    USER_ID = 1
    USER_ROLE = "owner"
    QUESTION = "find the works of Pratham in BWF and what things he was handling"

    question = QUESTION
    initial_state: AnswerState = {
        "messages": [HumanMessage(content=question)],
        "question": question,
        "answer": "",
        "reasoning": "",
        "tool_calls": [],
        "sources": [],
        "chunks": [],
        "input_tokens": 0,
        "output_tokens": 0,
        "iterations": 0,
    }

    # Open a dedicated db session (same as what the route now does)
    db = SessionLocal()

    def print_event(event_type: str, agent: str = "main", **data):
        print(f"\n[{agent.upper()} | {event_type}]", end=" ")
        if event_type == "reasoning":
            print(f"(iter {data.get('iteration')}) {data.get('content', '')[:300]}")
        elif event_type == "tool_started":
            print(f"tool={data.get('tool')} args={data.get('args')}")
        elif event_type == "tool_completed":
            print(f"tool={data.get('tool')} done")
        elif event_type in ("agent_started", "agent_completed"):
            answer = data.get("answer", "")
            if answer:
                print(f"\n  ANSWER: {answer[:500]}")
            else:
                print()
        else:
            print(data)

    set_active_event_callback(print_event)
    set_active_project_context(
        project_id=PROJECT_ID,
        user_id=USER_ID,
        user_role=USER_ROLE,
        db=db,
    )

    try:
        result = workflow.invoke(initial_state)
    finally:
        set_active_event_callback(None)
        set_active_project_context(None)
        db.close()

    print("\n\n==============================")
    print("FINAL RESULT")
    print("==============================")
    print(f"\nQuestion: {result.get('question')}")
    print(f"\nAnswer:\n{result.get('answer')}")
    print(f"\nIterations: {result.get('iterations')}")
    print(f"\nTokens: {result.get('input_tokens', 0)} in / {result.get('output_tokens', 0)} out")
    print(f"\nSources ({len(result.get('sources', []))}):")
    for s in result.get("sources", []):
        print(f"  - {s.get('title')} | {s.get('url')}")
    print(f"\nChunks ({len(result.get('chunks', []))}):")
    for c in result.get("chunks", []):
        doc = c.get("document", {})
        chk = c.get("chunk", {})
        print(f"  - [{doc.get('document_id')}] {doc.get('title')} p.{chk.get('page_number')}: {chk.get('chunk_text', '')[:100]}...")
