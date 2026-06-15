
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

        
        chunks = semantic_search(query, project_id, membership.role , db)

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
    chunks = keyword_search(
        query,
        project_id,
        membership.role,
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
            membership.role,
            user_id,
            db
         )

        answer = generate_answer(query, chunks)
        validation = validate_answer(
           query,
           answer
         )

        if validation["decision"] == "no":

         return {
            "desision": validation["decision"],
            "answer": validation["user_response"],
         

          }
        return {
            "project_id": project_id,
            "query": query,
            "reranked_chunks": len(chunks),
            "answer": answer,
            "chunks": chunks
        }


@router.post("/detect-intent")
def detect_intent_route(
    query: str,
    user_id: int = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    intent = detect_intent(query)
    return {"intent": intent}
    
from rag.agents.query_rewriter import rewrite_query


@router.post("/rewrite-test")
def rewrite_test(
    query: str
):

    return rewrite_query(query)

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

from rag.agents.webagent import search, fetch

@router.get("/test")
def test_web_search(query: str):

    def event_stream():

        try:

            search_result = search(query)

            yield (
               "data: "
               + json.dumps({
                   "type": "status",
                   "message": (
                       f"Found {len(search_result['results'])} "
                       f"relevant web results."
                   )
               })
               + "\n\n"
      )

            selected_results = [
                search_result["results"][i - 1]
                for i in search_result["selected_indices"]
            ]

            for event in fetch(
                query=query,
                selected_results=selected_results
            ):
                yield (
                    f"data: "
                    f"{json.dumps(event)}"
                    f"\n\n"
                )

        except Exception as e:

            yield (
                f"data: "
                f"{json.dumps({'error': str(e)})}"
                f"\n\n"
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream"
    )


# ============================================================
# /test2  –  Groq compound-beta web search (SSE)
# ============================================================
from rag.agents.webagent2 import run_groq_web_search

@router.get("/test2")
async def test_groq_web_search(query: str):
    """
    SSE endpoint that streams Groq compound-beta web search results.
    Events:
        data: {"type": "status",  "step": "groq_search", "message": "..."}
        data: {"type": "sources", "step": "groq_sources", "sources": [...]}
        data: {"type": "final",   "answer": "..."}
        event: done
    """

    async def event_stream():

        loop = asyncio.get_event_loop()
        queue: asyncio.Queue = asyncio.Queue()
        _DONE = object()

        def _run():
            try:
                for event in run_groq_web_search(query):
                    loop.call_soon_threadsafe(queue.put_nowait, event)
            except Exception as exc:
                loop.call_soon_threadsafe(
                    queue.put_nowait,
                    {"type": "error", "message": str(exc)}
                )
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, _DONE)

        task = loop.run_in_executor(None, _run)

        try:
            while True:
                event = await queue.get()
                if event is _DONE:
                    break
                yield (
                    "data: "
                    + json.dumps(event)
                    + "\n\n"
                )

            yield "event: done\ndata: complete\n\n"

        except Exception as e:
            yield (
                "data: "
                + json.dumps({"type": "error", "message": str(e)})
                + "\n\n"
            )

        await task

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        }
    )


# ============================================================
# /IntelligentGoogleSearch  –  Gemini Google Search (SSE)
# ============================================================
from rag.agents.IntelligentWebAgent import run_gemini_google_search

@router.get("/IntelligentGoogleSearch")
async def test_intelligent_google_search(query: str):
    """
    SSE endpoint that streams Gemini Google Search results.
    Events:
        data: {"type": "status",  "step": "gemini_search", "message": "..."}
        data: {"type": "final",   "answer": "..."}
        event: done
    """

    async def event_stream():

        loop = asyncio.get_event_loop()
        queue: asyncio.Queue = asyncio.Queue()
        _DONE = object()

        def _run():
            try:
                for event in run_gemini_google_search(query):
                    loop.call_soon_threadsafe(queue.put_nowait, event)
            except Exception as exc:
                loop.call_soon_threadsafe(
                    queue.put_nowait,
                    {"type": "error", "message": str(exc)}
                )
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, _DONE)

        task = loop.run_in_executor(None, _run)

        try:
            while True:
                event = await queue.get()
                if event is _DONE:
                    break
                yield (
                    "data: "
                    + json.dumps(event)
                    + "\n\n"
                )

            yield "event: done\ndata: complete\n\n"

        except Exception as e:
            yield (
                "data: "
                + json.dumps({"type": "error", "message": str(e)})
                + "\n\n"
            )

        await task

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        }
    )

