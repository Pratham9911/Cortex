import os

from google import genai
from google.genai import types
from sqlalchemy import text

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY1")
)

MODEL_NAME = "gemini-embedding-2"

def semantic_search(query: str, project_id: int, user_role: str, db):

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

    # Convert vector to pgvector format
    vector_str = "[" + ",".join(map(str, query_embedding)) + "]"

    # ----------------------------------------
    # 2. Semantic similarity search
    # ----------------------------------------
    sql = text("""
SELECT
    dc.chunk_id,
    dc.content,

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

WHERE
    dc.project_id = :project_id
    AND dv.is_active = true
    AND (
        d.search_access_level = 'member'

        OR (
            d.search_access_level = 'admin'
            AND :user_role = 'admin'
        )
    )

ORDER BY dc.embedding <=> CAST(:query_vector AS vector)

LIMIT 7;
""")
    results = db.execute(
    sql,
    {
        "query_vector": vector_str,
        "project_id": project_id,
        "user_role": user_role
    }
).fetchall()

    output = []

    for row in results:
        output.append({
    "chunk_id": row.chunk_id,
    "content": row.content,
    "distance": row.distance,

    "document_id": row.document_id,
    "document_title": row.document_title,

    "version_number": row.version_number,
    "file_name": row.file_name
     })

    return output

def keyword_search(query: str, project_id: int, user_role: str, db):

    sql = text("""
    SELECT
        dc.chunk_id,
        dc.content,

        d.document_id,
        d.title AS document_title,

        dv.version_number,
        dv.file_name,

        ts_rank(
            dc.search_vector,
            plainto_tsquery('english', :query)
        ) AS rank

    FROM document_chunks dc

    JOIN document_versions dv
        ON dc.version_id = dv.version_id

    JOIN documents d
        ON dv.document_id = d.document_id

    WHERE
        dc.project_id = :project_id
        AND dv.is_active = true

        AND dc.search_vector @@ plainto_tsquery(
            'english',
            :query
        )

        AND (
            d.search_access_level = 'member'

            OR (
                d.search_access_level = 'admin'
                AND :user_role = 'admin'
            )
        )

    ORDER BY rank DESC

    LIMIT 5;
    """)

    results = db.execute(
        sql,
        {
            "query": query,
            "project_id": project_id,
            "user_role": user_role
        }
    ).fetchall()

    output = []

    for row in results:

        output.append({
            "chunk_id": row.chunk_id,
            "content": row.content,

            "document_id": row.document_id,
            "document_title": row.document_title,

            "version_number": row.version_number,
            "file_name": row.file_name,

            "keyword_rank": row.rank
        })

    return output

def hybrid_search(query: str, project_id: int, user_role: str, db):

    # ----------------------------------------
    # Get semantic results
    # ----------------------------------------
    semantic_results = semantic_search(
        query,
        project_id,
        user_role,
        db
    )

    # ----------------------------------------
    # Get keyword results
    # ----------------------------------------
    keyword_results = keyword_search(
        query,
        project_id,
        user_role,
        db
    )

    # ----------------------------------------
    # Merge + deduplicate
    # ----------------------------------------
    merged_results = []

    seen_chunk_ids = set()

    # semantic first (higher priority initially)
    for chunk in semantic_results:

        if chunk["chunk_id"] not in seen_chunk_ids:

            merged_results.append(chunk)

            seen_chunk_ids.add(chunk["chunk_id"])

    # then keyword results
    for chunk in keyword_results:

        if chunk["chunk_id"] not in seen_chunk_ids:

            merged_results.append(chunk)

            seen_chunk_ids.add(chunk["chunk_id"])

    # ----------------------------------------
    # Limit final chunks
    # ----------------------------------------
    return merged_results[:8]


