"""
agentic.teams.decisions.retriever
==================================
Decision Retriever module.

Implements Hybrid Search (Semantic Vector Search + Keyword TSVECTOR & Trigram Search)
fused via Reciprocal Rank Fusion (RRF) for team decisions.
Returns whole decisions with match scores and participant details.
"""

import os
from typing import List, Dict, Any, Optional
import requests
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from sqlalchemy import text

from models import DecisionParticipant, User

load_dotenv()

FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY")
FIREWORKS_EMBEDDING_URL = "https://api.fireworks.ai/inference/v1/embeddings"
EMBEDDING_MODEL_NAME = "fireworks/qwen3-embedding-8b"


def generate_query_embedding(query: str) -> List[float]:
    """Generate 1024-dimensional embedding for query using Fireworks AI."""
    headers = {
        "Authorization": f"Bearer {FIREWORKS_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": EMBEDDING_MODEL_NAME,
        "input": query,
        "dimensions": 1024
    }
    response = requests.post(FIREWORKS_EMBEDDING_URL, headers=headers, json=payload)
    response.raise_for_status()
    result = response.json()
    return result["data"][0]["embedding"]


def semantic_search_decisions(
    query: str,
    team_id: int,
    db: Session,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """
    Semantic vector search for decisions owned by team_id.
    """
    query_vector = generate_query_embedding(query)
    vector_str = "[" + ",".join(map(str, query_vector)) + "]"

    sql = text("""
        SELECT
            d.id AS decision_id,
            d.team_id,
            d.title,
            d.description,
            d.created_by,
            d.created_at,
            d.updated_at,
            d.embedding <=> CAST(:query_vector AS vector) AS distance
        FROM decisions d
        WHERE d.team_id = :team_id
        ORDER BY distance ASC
        LIMIT :limit;
    """)

    results = db.execute(sql, {"query_vector": vector_str, "team_id": team_id, "limit": limit}).fetchall()

    output = []
    for row in results:
        output.append({
            "decision_id": row.decision_id,
            "team_id": row.team_id,
            "title": row.title,
            "description": row.description,
            "created_by": row.created_by,
            "created_at": str(row.created_at),
            "updated_at": str(row.updated_at),
            "distance": float(row.distance)
        })
    return output


def keyword_search_decisions(
    query: str,
    team_id: int,
    db: Session,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """
    Full-text search & trigram similarity search for decisions owned by team_id.
    """
    sql = text("""
        SELECT
            d.id AS decision_id,
            d.team_id,
            d.title,
            d.description,
            d.created_by,
            d.created_at,
            d.updated_at,
            ts_rank(d.search_vector, websearch_to_tsquery('english', :query)) AS rank,
            word_similarity(lower(:query), lower(d.title || ' ' || d.description)) AS trigram_score
        FROM decisions d
        WHERE d.team_id = :team_id
          AND (
            d.search_vector @@ websearch_to_tsquery('english', :query)
            OR word_similarity(lower(:query), lower(d.title || ' ' || d.description)) > 0.15
          )
        ORDER BY (COALESCE(ts_rank(d.search_vector, websearch_to_tsquery('english', :query)), 0) +
                  word_similarity(lower(:query), lower(d.title || ' ' || d.description))) DESC
        LIMIT :limit;
    """)

    results = db.execute(sql, {"query": query, "team_id": team_id, "limit": limit}).fetchall()

    output = []
    for row in results:
        output.append({
            "decision_id": row.decision_id,
            "team_id": row.team_id,
            "title": row.title,
            "description": row.description,
            "created_by": row.created_by,
            "created_at": str(row.created_at),
            "updated_at": str(row.updated_at),
            "keyword_rank": float(row.rank or 0),
            "trigram_score": float(row.trigram_score or 0)
        })
    return output


def reciprocal_rank_fusion(
    semantic_results: List[Dict[str, Any]],
    keyword_results: List[Dict[str, Any]],
    k: int = 60
) -> List[Dict[str, Any]]:
    """
    Reciprocal Rank Fusion (RRF) to combine semantic and keyword retrieval results.
    """
    fused = {}

    for rank, item in enumerate(semantic_results):
        did = item["decision_id"]
        if did not in fused:
            fused[did] = {
                "score": 0.0,
                "item": item,
                "semantic_rank": rank + 1,
                "keyword_rank": None
            }
        fused[did]["score"] += 1.0 / (k + rank + 1)
        fused[did]["item"]["semantic_distance"] = item["distance"]

    for rank, item in enumerate(keyword_results):
        did = item["decision_id"]
        if did not in fused:
            fused[did] = {
                "score": 0.0,
                "item": item,
                "semantic_rank": None,
                "keyword_rank": rank + 1
            }
        else:
            fused[did]["keyword_rank"] = rank + 1

        fused[did]["score"] += 1.0 / (k + rank + 1)
        fused[did]["item"]["keyword_rank"] = item.get("keyword_rank", 0)

    reranked = sorted(fused.values(), key=lambda x: x["score"], reverse=True)

    results = []
    for r in reranked:
        doc = dict(r["item"])
        doc["rrf_score"] = round(r["score"], 6)
        results.append(doc)

    return results


def get_decision_participants(db: Session, decision_id: int) -> List[Dict[str, Any]]:
    """Fetch participant user details for a given decision."""
    sql = text("""
        SELECT
            dp.user_id,
            u.name,
            u.email,
            dp.role,
            dp.created_at
        FROM decision_participants dp
        JOIN users u ON u.user_id = dp.user_id
        WHERE dp.decision_id = :decision_id
        ORDER BY dp.created_at ASC;
    """)
    rows = db.execute(sql, {"decision_id": decision_id}).fetchall()
    return [
        {
            "user_id": r.user_id,
            "name": r.name,
            "email": r.email,
            "role": r.role,
            "created_at": str(r.created_at)
        }
        for r in rows
    ]


def hybrid_search_decisions(
    query: str,
    team_id: int,
    db: Session,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """
    Perform complete Hybrid Search for decisions (Semantic + Keyword via RRF).
    Fetches participants for each matching decision.
    """
    semantic_res = semantic_search_decisions(query, team_id, db, limit=limit)
    keyword_res = keyword_search_decisions(query, team_id, db, limit=limit)

    fused_results = reciprocal_rank_fusion(semantic_res, keyword_res)

    # Attach participants to each decision result
    for decision in fused_results:
        decision["participants"] = get_decision_participants(db, decision["decision_id"])

    return fused_results[:limit]
