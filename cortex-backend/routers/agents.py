
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

