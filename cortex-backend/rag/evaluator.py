# rag/evaluator.py

import os
import json
import urllib.request
import time



import ast
import math

import csv
from pathlib import Path
from sqlalchemy import text
from rag.generator import generate_answer
from rag.retriever import hybrid_search

FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY")
FIREWORKS_CHAT_COMPLETIONS_URL = (
    "https://api.fireworks.ai/inference/v1/chat/completions"
)
FIREWORKS_GENERATOR_MODEL = "accounts/fireworks/models/gpt-oss-120b"

# ==========================================================
# Helpers
# ==========================================================


from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

DATASET_PATH = (
    BASE_DIR
    / "evaluation"
    / "Cortex_Evaluation_Dataset_Template.csv"
)

OUTPUT_PATH = (
    BASE_DIR
    / "evaluation"
    / "evaluation_results.csv"
)
def parse_chunk_ids(chunk_str):
    """
    CSV stores chunk ids like:
    [117]
    [117, 118]

    Returns:
        list[int]
    """
    if not chunk_str:
        return []

    if isinstance(chunk_str, list):
        return chunk_str

    return list(ast.literal_eval(chunk_str))


def get_retrieved_chunk_ids(chunks):
    """
    Extract chunk ids from hybrid search output.

    Input:
    [
        {
            "chunk_id":117,
            ...
        }
    ]

    Output:
    [117,114,128,...]
    """
    return [chunk["chunk_id"] for chunk in chunks]


def get_retrieved_documents(chunks):
    """
    Returns unique document titles.
    """

    docs = []

    for chunk in chunks:
        title = chunk["document_title"]

        if title not in docs:
            docs.append(title)

    return docs


# ==========================================================
# Retrieval Metrics
# ==========================================================

def hit_rate(expected_chunks, retrieved_chunks):
    """
    Hit@K

    Returns:
        1 or 0
    """

    expected = set(expected_chunks)

    retrieved = set(retrieved_chunks)

    return int(len(expected & retrieved) > 0)


def recall_at_k(expected_chunks, retrieved_chunks):
    """
    Recall@K
    """

    expected = set(expected_chunks)

    retrieved = set(retrieved_chunks)

    if len(expected) == 0:
        return 0

    return len(expected & retrieved) / len(expected)


def precision_at_k(expected_chunks, retrieved_chunks):
    """
    Precision@K
    """

    if len(retrieved_chunks) == 0:
        return 0

    expected = set(expected_chunks)

    retrieved = set(retrieved_chunks)

    return len(expected & retrieved) / len(retrieved_chunks)


def mrr(expected_chunks, retrieved_chunks):
    """
    Mean Reciprocal Rank
    """

    expected = set(expected_chunks)

    for rank, chunk in enumerate(retrieved_chunks, start=1):

        if chunk in expected:
            return 1 / rank

    return 0


def ndcg_at_k(expected_chunks, retrieved_chunks):
    """
    Binary NDCG
    """

    expected = set(expected_chunks)

    dcg = 0

    for i, chunk in enumerate(retrieved_chunks):

        if chunk in expected:
            dcg += 1 / math.log2(i + 2)

    ideal_hits = min(len(expected), len(retrieved_chunks))

    if ideal_hits == 0:
        return 0

    idcg = 0

    for i in range(ideal_hits):
        idcg += 1 / math.log2(i + 2)

    return dcg / idcg


# ==========================================================
# Evaluate Single Question
# ==========================================================

def evaluate_retrieval(expected_chunk_ids, retrieved_chunks):
    """
    Returns every retrieval metric for one query.
    """

    retrieved_ids = get_retrieved_chunk_ids(retrieved_chunks)

    return {

        "retrieved_chunk_ids": retrieved_ids,

        "retrieved_documents":
            get_retrieved_documents(retrieved_chunks),

        "hit@7":
            hit_rate(
                expected_chunk_ids,
                retrieved_ids
            ),

        "recall@7":
            recall_at_k(
                expected_chunk_ids,
                retrieved_ids
            ),

        "precision@7":
            precision_at_k(
                expected_chunk_ids,
                retrieved_ids
            ),

        "mrr":
            mrr(
                expected_chunk_ids,
                retrieved_ids
            ),

        "ndcg@7":
            ndcg_at_k(
                expected_chunk_ids,
                retrieved_ids
            )
    }




def load_dataset(limit=None):
    """
    Load evaluation dataset.

    Returns:
        list[dict]
    """

    rows = []

    with open(DATASET_PATH, "r", encoding="utf-8-sig") as f:

        reader = csv.DictReader(f)

        for row in reader:

            rows.append(
                {
                    "id": int(row["id"]),

                    "question": row["question"],

                    "expected_answer": row["expected_answer"],

                    "expected_document": row["expected_document"],

                    "expected_chunk_ids":
                        parse_chunk_ids(
                            row["expected_chunk_ids"]
                        ),

                    "difficulty": row["difficulty"],

                    "category": row["category"]
                }
            )

            if limit and len(rows) >= limit:
                break

    return rows




def evaluate_answer(
    question,
    expected_answer,
    generated_answer,
    expected_chunk_ids,
    db
):
    """
    Uses Fireworks to evaluate the generated answer.
    """

    query = text("""
        SELECT content
        FROM document_chunks
        WHERE chunk_id = ANY(:chunk_ids)
        ORDER BY chunk_id
    """)

    rows = db.execute(
        query,
        {"chunk_ids": expected_chunk_ids}
    ).fetchall()

    context = "\n\n".join(row.content for row in rows)

    prompt = f"""
You are a STRICT evaluator of a Retrieval-Augmented Generation (RAG) system.

Your job is to find mistakes, not reward correct answers.

Penalize:
- Hallucinated facts
- Unsupported claims
- Missing important information
- Irrelevant or verbose content
- Wrong emphasis
- Poor structure if it reduces clarity

Scores: in decimal 

Correctness (0-10)
10 = Covers all important information.
8-9 = Minor wording differences only
6-7 = Mostly correct but some missing details
3-5 = Partially correct
0-2 = Mostly incorrect

Groundedness (0-10)

Deduct points for EVERY unsupported claim.
10 = Every factual statement is supported by the reference context.
0 = Mostly hallucinated.

3. Relevance (0-10)

Evaluate whether the generated answer directly addresses the user's question without adding unnecessary, unrelated, or excessively verbose information.

score based on weather the answer needed to be detailed or consise


Question:
{question}

Reference Context:
{context}

Expected Answer:
{expected_answer}

Generated Answer:
{generated_answer}


return only a vaild json

{{
    "correctness": 6,
    "groundedness": 8,
    "relevance": 7
}}
"""

    if not FIREWORKS_API_KEY:
        raise RuntimeError("FIREWORKS_API_KEY environment variable is required")

    payload = {
        "model": FIREWORKS_GENERATOR_MODEL,
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0
    }

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Bearer {FIREWORKS_API_KEY}"
    }

    request = urllib.request.Request(
        FIREWORKS_CHAT_COMPLETIONS_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )

    with urllib.request.urlopen(request, timeout=60) as response:
        response_data = json.loads(response.read().decode("utf-8"))

    content = response_data["choices"][0]["message"]["content"]

    return json.loads(content)

def evaluate_single_question(
    row,
    project_id,
    user_id,
    user_role,
    db
):
    """
    Evaluate one dataset row.
    """

    start_time = time.perf_counter()

    chunks = hybrid_search(
        query=row["question"],
        project_id=project_id,
        user_id=user_id,
        user_role=user_role,
        db=db
    )

    answer = generate_answer(
        row["question"],
        chunks
    )
  
    latency = round(
        time.perf_counter() - start_time,
        3
    )

    scores = evaluate_answer(
    question=row["question"],
    expected_answer=row["expected_answer"],
    generated_answer=answer,
    expected_chunk_ids=row["expected_chunk_ids"],
    db=db
)
   
    retrieval_metrics = evaluate_retrieval(
        row["expected_chunk_ids"],
        chunks
    )

    result = {

        "id": row["id"],

        "question": row["question"],

        "expected_answer": row["expected_answer"],

        "generated_answer": answer,

        "expected_document": row["expected_document"],

        "expected_chunk_ids": row["expected_chunk_ids"],

        "difficulty": row["difficulty"],

        "category": row["category"],

        "latency_seconds": latency,

        "correctness": scores["correctness"],
        "groundedness": scores["groundedness"],
        "relevance": scores["relevance"],

        **retrieval_metrics
    }

    return result

def save_results_csv(results):
    """
    Save evaluation results to CSV.
    """
   
    if not results:
        return

    fieldnames = [
        "id",
        "question",
        "difficulty",
        "category",

        "expected_document",
        "expected_chunk_ids",

        "retrieved_documents",
        "retrieved_chunk_ids",

        "generated_answer",
        "correctness",
        "groundedness",
        "relevance",
        "latency_seconds",

        "hit@7",
        "recall@7",
        "precision@7",
        "mrr",
        "ndcg@7"
    ]

    with open(
        OUTPUT_PATH,
        "w",
        newline="",
        encoding="utf-8"
    ) as f:

        writer = csv.DictWriter(
            f,
            fieldnames=fieldnames
        )

        writer.writeheader()

        for row in results:

            writer.writerow({

                "id":
                    row["id"],

                "question":
                    row["question"],

                "difficulty":
                    row["difficulty"],

                "category":
                    row["category"],

                "expected_document":
                    row["expected_document"],

                "expected_chunk_ids":
                    str(row["expected_chunk_ids"]),

                "retrieved_documents":
                    " | ".join(
                        row["retrieved_documents"]
                    ),

                "retrieved_chunk_ids":
                    str(
                        row["retrieved_chunk_ids"]
                    ),
                
                 "correctness":
                    row["correctness"],
                
                "groundedness":
                    row["groundedness"],
                
                "relevance":
                    row["relevance"],
                "generated_answer":
                    row["generated_answer"],

                "latency_seconds":
                    row["latency_seconds"],

                "hit@7":
                    row["hit@7"],

                "recall@7":
                    round(row["recall@7"],4),

                "precision@7":
                    round(row["precision@7"],4),

                "mrr":
                    round(row["mrr"],4),

                "ndcg@7":
                    round(row["ndcg@7"],4)

            })

    return OUTPUT_PATH

def run_evaluation(
    project_id,
    user_id,
    user_role,
    db,
    start_row=1,
    end_row=None
):
    """
    Runs evaluation on a range of dataset rows.
    Row numbering is 1-based.
    """

    dataset = load_dataset()

    if end_row is None:
        end_row = len(dataset)

    dataset = dataset[start_row - 1:end_row]

    results = []

    for row in dataset:

        print(f"Evaluating Question {row['id']}...")

        result = evaluate_single_question(
            row=row,
            project_id=project_id,
            user_id=user_id,
            user_role=user_role,
            db=db
        )

        results.append(result)

    save_results_csv(results)

    return results


