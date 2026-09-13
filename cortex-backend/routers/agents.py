
import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from dependencies import get_current_user
from rag.retriever import (
    semantic_search,
    keyword_search,
    hybrid_search,
    hybrid_search_with_rerank
)
from database import SessionLocal
from rag.generator import generate_answer
from rag.agents.answer_validator import validate_answer
from rag.orchestrator import run_pipeline
from rag.evaluator import run_evaluation
from models import ProjectMember, TeamMember


from rag.agents.intent import detect_intent

router = APIRouter()
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Below endpoint is for asking questions to project documents using RAG
# Currently Uses Simple Semantic Search + Llama 3.3 via Groq API
@router.post("/projects/{project_id}/sementic-search")
def sementic_search_route(
        project_id: int,
        query: str,
        user_id: int = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):

        membership = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id
        ).first()

        if not membership:
            raise HTTPException(status_code=403, detail="Access denied")

        user_team_ids = [
            member.team_id
            for member in db.query(TeamMember).filter(
                TeamMember.user_id == user_id
            ).all()
        ]

        chunks = semantic_search(
            query,
            project_id,
            user_id,
            membership.role,
            user_team_ids,
            db
        )

        answer = generate_answer(query, chunks)

        return {
            "project_id": project_id,
            "query": query,
            "retrieved_chunks": len(chunks),
            "answer": answer,
            "chunks": chunks
        }
    

@router.post("/projects/{project_id}/keyword-search")
def keyword_search_route(
    project_id: int,
    query: str,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Verify membership
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    # ----------------------------------------
    # Keyword retrieval
    # ----------------------------------------
    user_team_ids = [
        member.team_id
        for member in db.query(TeamMember).filter(
            TeamMember.user_id == user_id
        ).all()
    ]

    chunks = keyword_search(
        query,
        project_id,
        user_id,
        membership.role,
        user_team_ids,
        db
    )

    return {
        "project_id": project_id,
        "query": query,
        "retrieved_chunks": len(chunks),
        "chunks": chunks
    }

# @router.post("/projects/{project_id}/ask")
# def ask_route(
#         project_id: int,
#         query: str,
#         user_id: int = Depends(get_current_user),
#         db: Session = Depends(get_db)
#     ):

#         membership = db.query(ProjectMember).filter(
#             ProjectMember.project_id == project_id,
#             ProjectMember.user_id == user_id
#         ).first()

#         if not membership:
#             raise HTTPException(status_code=403, detail="Access denied")

        
#         chunks = hybrid_search(
#             query,
#             project_id,
#             user_id,
#             membership.role,
#             db
#          )

#         answer = generate_answer(query, chunks)

#         return {
#             "project_id": project_id,
#             "query": query,
#             "retrieved_chunks": len(chunks),
#             "answer": answer,
#             "chunks": chunks
#         }


@router.post("/projects/{project_id}/ask-reranked")
def ask_route_reranked(
        project_id: int,
        query: str,
        user_id: int = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):

        membership = db.query(ProjectMember).filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id
        ).first()

        if not membership:
            raise HTTPException(status_code=403, detail="Access denied")

        
        chunks = hybrid_search_with_rerank(
            query,
            project_id,
            user_id,
            membership.role,
            db
         )

        answer = generate_answer(query, chunks)
        # validation = validate_answer(
        #    query,
        #    answer
        #  )

        # if validation["decision"] == "no":

        #  return {
        #     "desision": validation["decision"],
        #     "answer": validation["user_response"],
         

        #   }
        return {
            "project_id": project_id,
            "query": query,
            "reranked_chunks": len(chunks),
            "answer": answer,
            "chunks": chunks
        }

@router.post("/projects/{project_id}/ask-hybrid")
def ask_route_hybrid(
    project_id: int,
    query: str,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # Check project membership
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    # Hybrid Search (Semantic + Keyword + RRF)
    chunks = hybrid_search(
        query=query,
        project_id=project_id,
        user_id=user_id,
        user_role=membership.role,
        db=db
    )

    # Generate answer
    answer = generate_answer(query, chunks)

   

    return {
        "project_id": project_id,
        "query": query,
        "retrieved_chunks": len(chunks),
        "answer": answer,
        "chunks": chunks
    }


@router.post("/projects/{project_id}/ask")
def ask_route(
    project_id: int,
    query: str,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    # ----------------------------------------
    # Verify membership
    # ----------------------------------------
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    # ----------------------------------------
    # SSE Event Generator
    # ----------------------------------------
    def event_generator():

        try:

            for event in run_pipeline(
                query=query,
                project_id=project_id,
                user_id=user_id,
                user_role=membership.role,
                db=db
            ):

                yield (
                    f"data: "
                    f"{json.dumps(event)}"
                    f"\n\n"
                )

            # optional end event
            yield (
                "event: done\n"
                "data: complete\n\n"
            )

        except Exception as e:

            error_event = {
                "type": "error",
                "message": str(e)
            }

            yield (
                f"data: "
                f"{json.dumps(error_event)}"
                f"\n\n"
            )

    # ----------------------------------------
    # Return SSE Stream
    # ----------------------------------------
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )


@router.post("/projects/{project_id}/evaluate-hybrid")
def evaluate_hybrid(
    project_id: int,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
    start_row: int = 1,
    end_row: int | None = None
):

    # ----------------------------------------
    # Verify project membership
    # ----------------------------------------

    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()

    if not membership:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    # ----------------------------------------
    # Run evaluation
    # ----------------------------------------

    results = run_evaluation(
        project_id=project_id,
        user_id=user_id,
        user_role=membership.role,
        db=db,
        start_row=start_row,
        end_row=end_row
    )

    return {
        "status": "success",
        "questions_processed": len(results),
        "output_file": "rag/evaluation/evaluation_results.csv",
        "results": results
    }

import json
from uuid import uuid4
from fastapi import APIRouter
from fastapi.responses import StreamingResponse, HTMLResponse
from langchain_core.messages import HumanMessage
from langgraph.types import Command

import agentic.main_graph as main_graph
from agentic.checkpointer import delete_checkpoint

from typing import Optional
from agentic.tools import set_active_event_callback, set_active_project_context




def emit(event_type: str, **data):
    payload = {"type": event_type, **data}
    return f"data: {json.dumps(payload)}\n\n"


def emit_interrupt(thread_id: str, interrupt_value):
    """Merge interrupt data without duplicate agent/thread_id keywords."""
    payload = dict(interrupt_value) if isinstance(interrupt_value, dict) else {
        "details": str(interrupt_value)
    }
    payload.pop("thread_id", None)
    payload.setdefault("agent", "main")
    return emit("interrupt", thread_id=thread_id, **payload)


async def _stream_workflow(workflow, input_data, config=None):
    """Forward workflow updates and sub-agent callbacks as they happen."""
    event_queue = asyncio.Queue()
    stream_completed = False

    def forward_event(event_type: str, *args, **data):
        agent_val = data.pop("agent", None) or (args[0] if args else "main")
        event_type = {
            "gmail_agent_started": "agent_started",
            "gmail_tool_started": "tool_started",
            "gmail_tool_completed": "tool_completed",
            "gmail_agent_completed": "agent_completed",
        }.get(event_type, event_type)
        event_queue.put_nowait(("event", event_type, {"agent": agent_val, **data}))

    async def produce():
        set_active_event_callback(forward_event)
        completed_normally = False
        try:
            async for update in workflow.astream(
                input_data,
                config=config,
                stream_mode="updates",
            ):
                await event_queue.put(("update", update, None))
            completed_normally = True
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            await event_queue.put(("error", exc, None))
        finally:
            set_active_event_callback(None)
        if completed_normally:
            await event_queue.put(("done", None, None))

    task = asyncio.create_task(produce())
    try:
        while True:
            item = await event_queue.get()
            if item[0] == "done":
                stream_completed = True
                break
            if item[0] == "error":
                raise item[1]
            yield item
    finally:
        if not task.done():
            if stream_completed:
                await task
            else:
                task.cancel()

        try:
            await task
        except asyncio.CancelledError:
            pass


@router.get("/projects/{project_id}/agent")
async def run_agent(
    project_id: int,
    question: str,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Validate project membership
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="Access denied to this project")

    user_role = membership.role
    thread_id = str(uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    initial_state = {
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

    async def event_generator():
        # Open a dedicated db session that lives for the full stream
        stream_db = SessionLocal()

        final_answer = ""
        final_sources = []
        final_chunks = []
        input_tokens = 0
        output_tokens = 0
        pending_events = []
        is_interrupted = False

        def sub_event_emitter(event_type: str, *args, **data):
            agent_val = data.pop("agent", None) or (args[0] if args else "main")
            pending_events.append((event_type, {"agent": agent_val, **data}))

        yield emit("agent_started", agent="main", thread_id=thread_id)

        set_active_event_callback(sub_event_emitter)
        set_active_project_context(
            project_id=project_id,
            user_id=user_id,
            user_role=user_role,
            db=stream_db,
            thread_id=thread_id,
        )

        try:
            workflow = main_graph.workflow or main_graph.build_workflow()
            async for stream_kind, stream_value, stream_data in _stream_workflow(
                workflow, initial_state, config=config
            ):
                if stream_kind == "event":
                    yield emit(stream_value, **stream_data)
                    continue

                update = stream_value

                for node_name, node_update in update.items():

                    if node_name == "__interrupt__":
                        is_interrupted = True
                        interrupt_val = node_update[0].value if node_update else {}
                        yield emit_interrupt(thread_id, interrupt_val)
                        break

                    if node_name in ("chat_node", "force_synthesis_node"):
                        reasoning = node_update.get("reasoning", "")
                        answer = node_update.get("answer", "")
                        tool_calls = node_update.get("tool_calls", [])
                        iteration = node_update.get("iterations")

                        if answer:
                            final_answer = answer
                        input_tokens = node_update.get("input_tokens", input_tokens)
                        output_tokens = node_update.get("output_tokens", output_tokens)

                        if reasoning:
                            yield emit("reasoning", agent="main", iteration=iteration, content=reasoning)

                        for tc in tool_calls:
                            yield emit("tool_started", agent="main", iteration=iteration,
                                       tool=tc["name"], args=tc["args"], call_id=tc.get("id"))

                    elif node_name == "tool_node":
                        yield emit("tool_completed", agent="main", tool="sub_agent")

                    elif node_name == "collect_tool_results":
                        sources = node_update.get("sources", [])
                        chunks = node_update.get("chunks", [])
                        if sources:
                            final_sources = sources
                        if chunks:
                            final_chunks = chunks
                        input_tokens = node_update.get("input_tokens", input_tokens)
                        output_tokens = node_update.get("output_tokens", output_tokens)

                if is_interrupted:
                    return

            # Workflow completed without interruption -> cleanup checkpoint
            delete_checkpoint(thread_id, stream_db)

        finally:
            set_active_event_callback(None)
            set_active_project_context(None)
            stream_db.close()

        yield emit(
            "agent_completed",
            agent="main",
            thread_id=thread_id,
            answer=final_answer,
            sources=final_sources,
            chunks=final_chunks,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
        )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/projects/{project_id}/agent/{thread_id}/resume")
async def resume_agent(
    project_id: int,
    thread_id: str,
    decision: str,
    feedback: Optional[str] = None,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Validate membership
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="Access denied to this project")

    user_role = membership.role
    config = {"configurable": {"thread_id": thread_id}}
    resume_payload = {"action": decision, "feedback": feedback or ""}

    async def event_generator():
        stream_db = SessionLocal()
        final_answer = ""
        final_sources = []
        final_chunks = []
        input_tokens = 0
        output_tokens = 0
        pending_events = []
        is_interrupted = False

        def sub_event_emitter(event_type: str, *args, **data):
            agent_val = data.pop("agent", None) or (args[0] if args else "main")
            pending_events.append((event_type, {"agent": agent_val, **data}))

        yield emit("agent_resumed", agent="main", thread_id=thread_id, decision=decision, feedback=feedback)

        set_active_event_callback(sub_event_emitter)
        set_active_project_context(
            project_id=project_id,
            user_id=user_id,
            user_role=user_role,
            db=stream_db,
            thread_id=thread_id,
            resume_action=decision,
            resume_feedback=feedback or "",
        )

        try:
            workflow = main_graph.workflow or main_graph.build_workflow()
            async for stream_kind, stream_value, stream_data in _stream_workflow(
                workflow, Command(resume=resume_payload), config=config
            ):
                if stream_kind == "event":
                    yield emit(stream_value, **stream_data)
                    continue

                update = stream_value

                for node_name, node_update in update.items():

                    if node_name == "__interrupt__":
                        is_interrupted = True
                        interrupt_val = node_update[0].value if node_update else {}
                        yield emit_interrupt(thread_id, interrupt_val)
                        break

                    if node_name in ("chat_node", "force_synthesis_node"):
                        reasoning = node_update.get("reasoning", "")
                        answer = node_update.get("answer", "")
                        tool_calls = node_update.get("tool_calls", [])
                        iteration = node_update.get("iterations")

                        if answer:
                            final_answer = answer
                        input_tokens = node_update.get("input_tokens", input_tokens)
                        output_tokens = node_update.get("output_tokens", output_tokens)

                        if reasoning:
                            yield emit("reasoning", agent="main", iteration=iteration, content=reasoning)

                        for tc in tool_calls:
                            yield emit("tool_started", agent="main", iteration=iteration,
                                       tool=tc["name"], args=tc["args"], call_id=tc.get("id"))

                    elif node_name == "tool_node":
                        yield emit("tool_completed", agent="main", tool="sub_agent")

                    elif node_name == "collect_tool_results":
                        sources = node_update.get("sources", [])
                        chunks = node_update.get("chunks", [])
                        if sources:
                            final_sources = sources
                        if chunks:
                            final_chunks = chunks
                        input_tokens = node_update.get("input_tokens", input_tokens)
                        output_tokens = node_update.get("output_tokens", output_tokens)

                if is_interrupted:
                    return

            # Workflow completed -> cleanup checkpointer
            delete_checkpoint(thread_id, stream_db)

        finally:
            set_active_event_callback(None)
            set_active_project_context(None)
            stream_db.close()

        yield emit(
            "agent_completed",
            agent="main",
            thread_id=thread_id,
            answer=final_answer,
            sources=final_sources,
            chunks=final_chunks,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
        )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )






from typing import Optional
from agentic.tools import set_active_event_callback, set_active_project_context


@router.get("/projects/{project_id}/agent")
async def run_agent(
    project_id: int,
    question: str,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Validate project membership
    membership = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id,
    ).first()

    if not membership:
        raise HTTPException(status_code=403, detail="Access denied to this project")

    user_role = membership.role

    initial_state = {
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

    def emit(event_type: str, **data):
        payload = {"type": event_type, **data}
        return f"data: {json.dumps(payload)}\n\n"

    async def event_generator():
        # Open a dedicated db session that lives for the full stream
        stream_db = SessionLocal()

        final_answer = ""
        final_sources = []
        final_chunks = []
        input_tokens = 0
        output_tokens = 0
        pending_events = []

        def sub_event_emitter(event_type: str, *args, **data):
            agent_val = data.pop("agent", None) or (args[0] if args else "main")
            pending_events.append((event_type, {"agent": agent_val, **data}))

        yield emit("agent_started", agent="main")

        set_active_event_callback(sub_event_emitter)
        set_active_project_context(
            project_id=project_id,
            user_id=user_id,
            user_role=user_role,
            db=stream_db,
        )

        try:
            workflow = main_graph.workflow or main_graph.build_workflow()
            async for update in workflow.astream(initial_state, stream_mode="updates"):

                while pending_events:
                    evt_type, evt_data = pending_events.pop(0)
                    yield emit(evt_type, **evt_data)

                for node_name, node_update in update.items():

                    if node_name in ("chat_node", "force_synthesis_node"):
                        reasoning = node_update.get("reasoning", "")
                        answer = node_update.get("answer", "")
                        tool_calls = node_update.get("tool_calls", [])
                        iteration = node_update.get("iterations")

                        if answer:
                            final_answer = answer
                        input_tokens = node_update.get("input_tokens", input_tokens)
                        output_tokens = node_update.get("output_tokens", output_tokens)

                        if reasoning:
                            yield emit("reasoning", agent="main", iteration=iteration, content=reasoning)

                        for tc in tool_calls:
                            yield emit("tool_started", agent="main", iteration=iteration,
                                       tool=tc["name"], args=tc["args"], call_id=tc.get("id"))

                    elif node_name == "tool_node":
                        yield emit("tool_completed", agent="main", tool="sub_agent")

                    elif node_name == "collect_tool_results":
                        sources = node_update.get("sources", [])
                        chunks = node_update.get("chunks", [])
                        if sources:
                            final_sources = sources
                        if chunks:
                            final_chunks = chunks
                        input_tokens = node_update.get("input_tokens", input_tokens)
                        output_tokens = node_update.get("output_tokens", output_tokens)

                while pending_events:
                    evt_type, evt_data = pending_events.pop(0)
                    yield emit(evt_type, **evt_data)

        finally:
            set_active_event_callback(None)
            set_active_project_context(None)
            stream_db.close()

        yield emit(
            "agent_completed",
            agent="main",
            answer=final_answer,
            sources=final_sources,
            chunks=final_chunks,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
        )

    return StreamingResponse(event_generator(), media_type="text/event-stream")

