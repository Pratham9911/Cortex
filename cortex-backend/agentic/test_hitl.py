import sys
import os
import json

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from agentic.main_graph import workflow
from agentic.tools import set_active_project_context
from agentic.checkpointer import delete_checkpoint
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from sqlalchemy import text
from uuid import uuid4


def count_checkpoints(thread_id: str, db):
    count = 0
    for table in ["checkpoint_writes", "checkpoint_blobs", "checkpoints"]:
        res = db.execute(text(f"SELECT COUNT(*) FROM {table} WHERE thread_id = :tid"), {"tid": thread_id}).fetchone()
        count += res[0] if res else 0
    return count


def test_hitl_approval_flow():
    print("\n========================================================")
    print("TEST 1: HITL EMAIL APPROVAL FLOW (decision = 'yes')")
    print("========================================================")

    db = SessionLocal()
    thread_id = str(uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    set_active_project_context(project_id=1, user_id=1, user_role="owner", db=db)

    prompt = "Send an email to manager@corp.com with subject Status Update and body All tasks are on schedule."
    print(f"[User Query]: '{prompt}'")
    print(f"[Generated Thread ID]: {thread_id}")

    initial_state = {
        "messages": [HumanMessage(content=prompt)],
        "question": prompt,
        "answer": "",
        "reasoning": "",
        "tool_calls": [],
        "sources": [],
        "chunks": [],
        "input_tokens": 0,
        "output_tokens": 0,
        "iterations": 0,
    }

    # Step 1: Run graph until interrupt
    print("\n--- Running Graph Stream (Part 1 - Until Interrupt) ---")
    interrupted = False
    draft_info = None

    for update in workflow.stream(initial_state, config=config, stream_mode="updates"):
        print(f"Update received: {list(update.keys())}")
        for node_name, node_update in update.items():
            if node_name == "__interrupt__":
                interrupted = True
                interrupt_val = node_update[0].value if node_update else {}
                draft_info = interrupt_val
                print(f"\n[INTERRUPT DETECTED]: {interrupt_val}")
                break

    assert interrupted, "Expected graph to be interrupted by send_email tool!"
    print("\n[VERIFICATION]: Graph successfully paused at interrupt.")

    # Check DB checkpoint persistence
    chk_count = count_checkpoints(thread_id, db)
    print(f"[DB Verification]: Total checkpoint rows in PostgreSQL for thread_id={thread_id}: {chk_count}")
    assert chk_count > 0, "Checkpoint rows should exist in PostgreSQL DB!"

    # Step 2: Resume graph with "yes"
    print("\n--- Resuming Graph Stream (Part 2 - Decision = 'yes') ---")
    final_answer = ""
    for update in workflow.stream(Command(resume="yes"), config=config, stream_mode="updates"):
        print(f"Update received: {list(update.keys())}")
        for node_name, node_update in update.items():
            if node_name in ("chat_node", "force_synthesis_node"):
                if node_update.get("answer"):
                    final_answer = node_update.get("answer")
                    print(f"Main Agent Answer: {final_answer[:100]}...")

    print(f"\n[Final Agent Answer]:\n{final_answer}")

    # Cleanup DB state
    delete_checkpoint(thread_id, db)
    post_cleanup_count = count_checkpoints(thread_id, db)
    print(f"[DB Verification]: Checkpoint rows after cleanup: {post_cleanup_count}")
    assert post_cleanup_count == 0, "Checkpoint rows should be deleted after completion!"

    db.close()
    set_active_project_context(None)
    print("SUCCESS: HITL Approval Flow passed!")


def test_hitl_rejection_flow():
    print("\n========================================================")
    print("TEST 2: HITL EMAIL REJECTION FLOW (decision = 'no')")
    print("========================================================")

    db = SessionLocal()
    thread_id = str(uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    set_active_project_context(project_id=1, user_id=1, user_role="owner", db=db)

    prompt = "Please email test@example.com with subject Spam and body Secret code 1234."
    print(f"[User Query]: '{prompt}'")
    print(f"[Generated Thread ID]: {thread_id}")

    initial_state = {
        "messages": [HumanMessage(content=prompt)],
        "question": prompt,
        "answer": "",
        "reasoning": "",
        "tool_calls": [],
        "sources": [],
        "chunks": [],
        "input_tokens": 0,
        "output_tokens": 0,
        "iterations": 0,
    }

    # Step 1: Run graph until interrupt
    print("\n--- Running Graph Stream (Part 1 - Until Interrupt) ---")
    interrupted = False

    for update in workflow.stream(initial_state, config=config, stream_mode="updates"):
        for node_name, node_update in update.items():
            if node_name == "__interrupt__":
                interrupted = True
                print(f"[INTERRUPT DETECTED]: {node_update[0].value}")
                break

    assert interrupted, "Expected graph to be interrupted by send_email tool!"

    # Step 2: Resume graph with "no"
    print("\n--- Resuming Graph Stream (Part 2 - Decision = 'no') ---")
    final_answer = ""
    for update in workflow.stream(Command(resume="no"), config=config, stream_mode="updates"):
        for node_name, node_update in update.items():
            if node_name in ("chat_node", "force_synthesis_node"):
                if node_update.get("answer"):
                    final_answer = node_update.get("answer")

    print(f"\n[Final Agent Answer]:\n{final_answer}")

    # Cleanup DB state
    delete_checkpoint(thread_id, db)
    post_cleanup_count = count_checkpoints(thread_id, db)
    print(f"[DB Verification]: Checkpoint rows after cleanup: {post_cleanup_count}")
    assert post_cleanup_count == 0, "Checkpoint rows should be deleted after completion!"

    db.close()
    set_active_project_context(None)
    print("SUCCESS: HITL Rejection Flow passed!")


if __name__ == "__main__":
    test_hitl_approval_flow()
    test_hitl_rejection_flow()
