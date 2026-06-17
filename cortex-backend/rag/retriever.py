import os
import requests
from google import genai
from google.genai import types
from sqlalchemy import text
from models import TeamMember
client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY1")
)

MODEL_NAME = "gemini-embedding-2"
def reciprocal_rank_fusion(
    semantic_results,
    keyword_results,
    k=60
):

    fused_scores = {}

    # semantic scores
    for rank, chunk in enumerate(semantic_results):

        chunk_id = chunk["chunk_id"]

        if chunk_id not in fused_scores:
            fused_scores[chunk_id] = {
                "score": 0,
                "chunk": chunk
            }

        fused_scores[chunk_id]["score"] += 1 / (k + rank + 1)

    # keyword scores
    for rank, chunk in enumerate(keyword_results):

        chunk_id = chunk["chunk_id"]

        if chunk_id not in fused_scores:
            fused_scores[chunk_id] = {
                "score": 0,
                "chunk": chunk
            }

        fused_scores[chunk_id]["score"] += 1 / (k + rank + 1)

    # sort by fused score
    reranked = sorted(
        fused_scores.values(),
        key=lambda x: x["score"],
        reverse=True
    )

    return [
        item["chunk"]
        for item in reranked
    ]



def semantic_search(
    query: str,
    project_id: int,
    user_id: int,
    user_role: str,
    user_team_ids: list[int],
    db
):

    # ----------------------------------------
    # 1. Generate query embedding
    # ----------------------------------------
    response = client.models.embed_content(
        model=MODEL_NAME,
        contents=query,
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_QUERY",
            output_dimensionality=1024
        )
    )

    query_embedding = response.embeddings[0].values

    vector_str = "[" + ",".join(map(str, query_embedding)) + "]"

    # ----------------------------------------
    # 2. Semantic similarity search
    # ----------------------------------------
    sql = text("""
SELECT
    dc.chunk_id,
    dc.content,
    dc.page_number,

    d.document_id,
    d.title AS document_title,

    dv.version_number,
    dv.file_name,

    dc.embedding <=> CAST(:query_vector AS vector) AS distance

FROM document_chunks dc

JOIN document_versions dv
    ON dc.version_id = dv.version_id

JOIN documents d
    ON dv.document_id = d.document_id

JOIN projects p
    ON p.project_id = d.project_id

WHERE
    dc.project_id = :project_id

    AND dv.is_active = true
    AND dv.is_deleted = false

    -- SEARCH ACCESS
    AND (
        p.created_by = :user_id
        OR d.owner_id = :user_id
        OR (
            d.search_access_level = 'admin'
            AND :user_role = 'admin'
        )
        OR (
            d.search_access_level = 'member'
            AND (
                :user_role = 'admin'
                OR d.allowed_team_ids && CAST(:user_team_ids AS integer[])
            )
        )
    )

ORDER BY dc.embedding <=> CAST(:query_vector AS vector)

LIMIT 10;
""")

    results = db.execute(
        sql,
        {
            "query_vector": vector_str,
            "project_id": project_id,
            "user_id": user_id,
            "user_role": user_role,
            "user_team_ids": user_team_ids
        }
    ).fetchall()

    output = []

    for row in results:

        output.append({
            "chunk_id": row.chunk_id,
            "content": row.content,
            "page_number": row.page_number,

            "distance": row.distance,

            "document_id": row.document_id,
            "document_title": row.document_title,

            "version_number": row.version_number,
            "file_name": row.file_name
        })

    return output
def keyword_search(
    query: str,
    project_id: int,
    user_id: int,
    user_role: str,
    user_team_ids: list[int],
    db
):

    sql = text("""
SELECT
    dc.chunk_id,
    dc.content,
    dc.page_number,

    d.document_id,
    d.title AS document_title,

    dv.version_number,
    dv.file_name,

    ts_rank(
        dc.search_vector,
        websearch_to_tsquery('english', :query)
    ) AS rank,

    word_similarity(
        lower(:query),
        lower(dc.content)
    ) AS trigram_score

FROM document_chunks dc

JOIN document_versions dv
    ON dc.version_id = dv.version_id

JOIN documents d
    ON dv.document_id = d.document_id

JOIN projects p
    ON p.project_id = d.project_id

WHERE
    dc.project_id = :project_id

    AND dv.is_active = true
    AND dv.is_deleted = false

    AND (

        dc.search_vector @@ websearch_to_tsquery(
            'english',
            :query
        )

        OR

        word_similarity(
            lower(:query),
            lower(dc.content)
        ) > 0.15
    )

    -- SEARCH ACCESS
    AND (
        p.created_by = :user_id
        OR d.owner_id = :user_id
        OR (
            d.search_access_level = 'admin'
            AND :user_role = 'admin'
        )
        OR (
            d.search_access_level = 'member'
            AND (
                :user_role = 'admin'
                OR d.allowed_team_ids && CAST(:user_team_ids AS integer[])
            )
        )
    )

ORDER BY
(
    COALESCE(
        ts_rank(
            dc.search_vector,
            websearch_to_tsquery('english', :query)
        ),
        0
    )

    +

    word_similarity(
        lower(:query),
        lower(dc.content)
    )
) DESC

LIMIT 10;
""")

    results = db.execute(
        sql,
        {
            "query": query,
            "project_id": project_id,
            "user_id": user_id,
            "user_role": user_role,
            "user_team_ids": user_team_ids
        }
    ).fetchall()

    output = []

    for row in results:

        output.append({
            "chunk_id": row.chunk_id,
            "content": row.content,
            "page_number": row.page_number,

            "document_id": row.document_id,
            "document_title": row.document_title,

            "version_number": row.version_number,
            "file_name": row.file_name,

            "keyword_rank": row.rank
        })

    return output
def hybrid_search(
    query: str,
    project_id: int,
    user_id: int,
    user_role: str,
    db
):

    # ----------------------------------------
    # Fetch user team ids once
    # ----------------------------------------
    user_team_ids = [
        member.team_id
        for member in db.query(TeamMember).filter(
            TeamMember.user_id == user_id
        ).all()
    ]

    # ----------------------------------------
    # Semantic search
    # ----------------------------------------
    semantic_results = semantic_search(
        query,
        project_id,
        user_id,
        user_role,
        user_team_ids,
        db
    )

    # ----------------------------------------
    # Keyword search
    # ----------------------------------------
    keyword_results = keyword_search(
        query,
        project_id,
        user_id,
        user_role,
        user_team_ids,
        db
    )

    # ----------------------------------------
    # RRF fusion
    # ----------------------------------------
    fused_results = reciprocal_rank_fusion(
        semantic_results,
        keyword_results
    )

    return fused_results[:20]


def hybrid_search_with_rerank(
    query: str,
    project_id: int,
    user_id: int,
    user_role: str,
    db
):

    # ----------------------------------------
    # 1. Get hybrid retrieval results
    # ----------------------------------------
    hybrid_results = hybrid_search(
        query,
        project_id,
        user_id,
        user_role,
        db
    )

    if not hybrid_results:
        return []

    # ----------------------------------------
    # 2. Prepare documents for reranker
    # ----------------------------------------
    documents = [
        chunk["content"]
        for chunk in hybrid_results
    ]

    # ----------------------------------------
    # 3. Fireworks rerank API
    # ----------------------------------------
    url = "https://api.fireworks.ai/inference/v1/rerank"

    payload = {
        "model": "fireworks/qwen3-reranker-8b",
        "query": query,
        "documents": documents,
        "top_n": 7,
        "return_documents": False
    }

    headers = {
        "Authorization": f"Bearer {os.getenv('FIREWORKS_API_KEY')}",
        "Content-Type": "application/json"
    }

    response = requests.post(
        url,
        json=payload,
        headers=headers
    )

    if response.status_code != 200:
        print("Reranker Error:", response.text)

        # fallback to hybrid retrieval
        return hybrid_results[:8]

    rerank_data = response.json()

   # ----------------------------------------
    # 4. Reorder chunks by reranker results
    # ----------------------------------------
    reranked_chunks = []
    
    for item in rerank_data["data"]:
    
        original_index = item["index"]
    
        chunk = hybrid_results[original_index]
    
        chunk["rerank_score"] = item["relevance_score"]
    
        reranked_chunks.append(chunk)
    
    return reranked_chunks
