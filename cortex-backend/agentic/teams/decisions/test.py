"""
agentic.teams.decisions.test
=============================
Test script for Decision Storage and Hybrid Retrieval.

This script tests raw storing and retrieval without any LLM layer.
It prints raw search results including semantic distance, keyword rank,
and Reciprocal Rank Fusion (RRF) scores.
"""

import os
import sys

# Ensure cortex-backend root directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import json
from dotenv import load_dotenv
from sqlalchemy.orm import sessionmaker
from database import engine
from models import User, Team

from agentic.teams.decisions import (
    store_decision,
    hybrid_search_decisions,
    semantic_search_decisions,
    keyword_search_decisions,
)

load_dotenv()

SessionLocal = sessionmaker(bind=engine)


def run_test():
    db = SessionLocal()
    try:
        print("=" * 70)
        print("CORTEX DECISION MODULE — MILESTONE 1 TEST")
        print("=" * 70)

        # 1. Ensure user and team exist for testing
        user = db.query(User).first()
        if not user:
            print("[ERROR] No users found in database!")
            return

        team = db.query(Team).first()
        if not team:
            print("[ERROR] No teams found in database!")
            return

        user_id = user.user_id
        team_id = team.team_id

        print(f"\n[INFO] Using Test User ID: {user_id} ({user.name})")
        print(f"[INFO] Using Test Team ID: {team_id} ({team.name})")

        # 2. Sample decisions to store
        sample_decisions = [
            {
                "title": "Adding Cortex-STM",
                "description": "Short-term Memory is Approved by team and Pratham is Incharge of this , This Feature will be having 1000 tokens , exceeding it will activate summarization of memory",
                "participants": [{"user_id": user_id, "role": "Developer"}]
            }
        ]

        print("\n--- 1. STORING DECISIONS ---")
        stored_ids = []
        for d in sample_decisions:
            res = store_decision(
                db=db,
                team_id=team_id,
                title=d["title"],
                description=d["description"],
                created_by=user_id,
                participants=d["participants"]
            )
            stored_ids.append(res["decision_id"])
            print(f"[OK] Stored Decision ID #{res['decision_id']}: '{res['title']}'")

        # 3. Test queries
        queries = [
            "Why are we Adding memory to Our Project",
        ]

        print("\n" + "=" * 70)
        print("--- 2. RETRIEVAL TESTS (SEMANTIC + KEYWORD + HYBRID RRF) ---")
        print("=" * 70)

        for query in queries:
            print(f"\nQUERY: \"{query}\"")
            print("-" * 50)

            # Raw Semantic Search
            sem_res = semantic_search_decisions(query, team_id, db, limit=3)
            print("\n  [Semantic Search Results]")
            for item in sem_res:
                print(f"    • ID: {item['decision_id']} | Distance: {item['distance']:.4f} | Title: {item['title']}")

            # Raw Keyword Search
            kw_res = keyword_search_decisions(query, team_id, db, limit=3)
            print("\n  [Keyword Search Results]")
            for item in kw_res:
                print(f"    • ID: {item['decision_id']} | Rank Score: {item['keyword_rank']:.4f} | Title: {item['title']}")

            # Hybrid RRF Search
            hybrid_res = hybrid_search_decisions(query, team_id, db, limit=3)
            print("\n  [Hybrid RRF Search Results (Final Output)]")
            for rank, item in enumerate(hybrid_res, 1):
                print(f"    Rank #{rank}:")
                print(f"      Decision ID : {item['decision_id']}")
                print(f"      Title       : {item['title']}")
                print(f"      Description : {item['description']}")
                print(f"      RRF Score   : {item['rrf_score']}")
                if "semantic_distance" in item:
                    print(f"      Sem Distance: {item['semantic_distance']:.4f}")
                if "keyword_rank" in item:
                    print(f"      Keyword Rank: {item['keyword_rank']:.4f}")
                print(f"      Participants: {item['participants']}")
                print()

        print("=" * 70)
        print("TEST COMPLETED SUCCESSFULLY!")
        print("=" * 70)

    finally:
        db.close()


if __name__ == "__main__":
    run_test()
