from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

OUTPUT_PATH = (
    BASE_DIR
    / "output.csv"
)


import csv
import statistics


def calculate_summary():
    """
    Reads evaluation_results.csv and computes
    overall retrieval metrics.
    """

    hits = []
    recalls = []
    precisions = []
    mrrs = []
    ndcgs = []
    latencies = []

    difficulty_stats = {
    "easy": {
        "recall": [],
        "correctness": [],
        "groundedness": [],
        "relevance": []
    },
    "medium": {
        "recall": [],
        "correctness": [],
        "groundedness": [],
        "relevance": []
    },
    "hard": {
        "recall": [],
        "correctness": [],
        "groundedness": [],
        "relevance": []
    }
}

    correctness_scores = []
    groundedness_scores = []
    relevance_scores = []

    with open(
        OUTPUT_PATH,
        "r",
        encoding="utf-8"
    ) as f:

        reader = csv.DictReader(f)

        for row in reader:

            hit = float(row["hit@7"])
            recall = float(row["recall@7"])
            precision = float(row["precision@7"])
            mrr = float(row["mrr"])
            ndcg = float(row["ndcg@7"])
            latency = float(row["latency_seconds"])
            correctness = float(row["correctness"])
            groundedness = float(row["groundedness"])
            relevance = float(row["relevance"])
            
            hits.append(hit)
            recalls.append(recall)
            precisions.append(precision)
            mrrs.append(mrr)
            ndcgs.append(ndcg)
            latencies.append(latency)
            correctness_scores.append(correctness)
            groundedness_scores.append(groundedness)
            relevance_scores.append(relevance)

            difficulty = row["difficulty"].strip().lower()

            if difficulty in difficulty_stats:
                difficulty_stats[difficulty]["recall"].append(recall)
                difficulty_stats[difficulty]["correctness"].append(correctness)
                difficulty_stats[difficulty]["groundedness"].append(groundedness)
                difficulty_stats[difficulty]["relevance"].append(relevance)

    summary = {

        "questions": len(hits),

         "easy_questions":
             len(difficulty_stats["easy"]["recall"]),
         
         "medium_questions":
             len(difficulty_stats["medium"]["recall"]),
         
         "hard_questions":
             len(difficulty_stats["hard"]["recall"]),

        "avg_hit@7":
            round(statistics.mean(hits), 4),

        "avg_recall@7":
            round(statistics.mean(recalls), 4),

        "avg_precision@7":
            round(statistics.mean(precisions), 4),

        "avg_mrr":
            round(statistics.mean(mrrs), 4),

        "avg_ndcg@7":
            round(statistics.mean(ndcgs), 4),

        "avg_latency":
            round(statistics.mean(latencies), 3),

        "min_latency":
            round(min(latencies), 3),

        "max_latency":
            round(max(latencies), 3),

        "p50_latency":
            round(statistics.median(latencies), 3),

        "p90_latency":
            round(percentile(latencies, 90), 3),

        "p95_latency":
            round(percentile(latencies, 95), 3),

        "avg_correctness":
           round(statistics.mean(correctness_scores), 4),

       "avg_groundedness":
           round(statistics.mean(groundedness_scores), 4),
       
       "avg_relevance":
           round(statistics.mean(relevance_scores), 4),

        "easy_recall@7":
            round(statistics.mean(difficulty_stats["easy"]["recall"]), 4)
            if difficulty_stats["easy"]["recall"] else 0,
        
        "medium_recall@7":
            round(statistics.mean(difficulty_stats["medium"]["recall"]), 4)
            if difficulty_stats["medium"]["recall"] else 0,
        
        "hard_recall@7":
            round(statistics.mean(difficulty_stats["hard"]["recall"]), 4)
            if difficulty_stats["hard"]["recall"] else 0,
        
        "easy_correctness":
            round(statistics.mean(difficulty_stats["easy"]["correctness"]), 4)
            if difficulty_stats["easy"]["correctness"] else 0,
        
        "medium_correctness":
            round(statistics.mean(difficulty_stats["medium"]["correctness"]), 4)
            if difficulty_stats["medium"]["correctness"] else 0,
        
        "hard_correctness":
            round(statistics.mean(difficulty_stats["hard"]["correctness"]), 4)
            if difficulty_stats["hard"]["correctness"] else 0,
        
        "easy_groundedness":
            round(statistics.mean(difficulty_stats["easy"]["groundedness"]), 4)
            if difficulty_stats["easy"]["groundedness"] else 0,
        
        "medium_groundedness":
            round(statistics.mean(difficulty_stats["medium"]["groundedness"]), 4)
            if difficulty_stats["medium"]["groundedness"] else 0,
        
        "hard_groundedness":
            round(statistics.mean(difficulty_stats["hard"]["groundedness"]), 4)
            if difficulty_stats["hard"]["groundedness"] else 0,
        
        "easy_relevance":
            round(statistics.mean(difficulty_stats["easy"]["relevance"]), 4)
            if difficulty_stats["easy"]["relevance"] else 0,
        
        "medium_relevance":
            round(statistics.mean(difficulty_stats["medium"]["relevance"]), 4)
            if difficulty_stats["medium"]["relevance"] else 0,
        
        "hard_relevance":
            round(statistics.mean(difficulty_stats["hard"]["relevance"]), 4)
            if difficulty_stats["hard"]["relevance"] else 0,
            }
        
    return summary
        
def percentile(values, p):
    """
    Computes percentile without numpy.
    """

    values = sorted(values)

    if len(values) == 1:
        return values[0]

    k = (len(values) - 1) * (p / 100)

    f = int(k)

    c = min(f + 1, len(values) - 1)

    if f == c:
        return values[f]

    d0 = values[f] * (c - k)

    d1 = values[c] * (k - f)

    return d0 + d1

summary = calculate_summary()

print("\n========== Evaluation Summary ==========")

for key, value in summary.items():
    print(f"{key}: {value}")

