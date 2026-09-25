"""
agentic.teams.decisions.test_agent
===================================
End-to-End Test script for Decision Sub-Agent.

Tests both STORE and SEARCH actions through the Decision Sub-Agent workflow.
"""

import os
import sys
import asyncio

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Ensure cortex-backend root directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import json
from dotenv import load_dotenv
from sqlalchemy.orm import sessionmaker
from database import engine
from models import User, Team

from agentic.teams.decisions import run_decision_agent

load_dotenv()

SessionLocal = sessionmaker(bind=engine)


async def main():
    db = SessionLocal()
    try:
        print("=" * 70)
        print("CORTEX DECISION SUB-AGENT — END-TO-END TEST")
        print("=" * 70)

        user = db.query(User).first()
        team = db.query(Team).first()

        if not user or not team:
            print("[ERROR] Missing user or team in database.")
            return

        user_id = user.user_id
        team_id = team.team_id

        # print(f"[INFO] Test User ID: {user_id} ({user.name})")
        # print(f"[INFO] Test Team ID: {team_id} ({team.name})\n")

        # # -------------------------------------------------------------------
        # # TEST 1: STORE ACTION
        # # -------------------------------------------------------------------
        # print("=" * 70)
        # print("TEST 1: STORE ACTION")
        # print("=" * 70)

        # brief_overview = (
        #     "team has agreed upon launching Cortex on oct 15 , linkedin will be our main source for presentation "
        #     "The launch will be presented though live demo and product demos"
        #     "Rakesh Sharma (userid = 10) will be performing live demo"
        # )

        # print(f"Brief Overview Input: \"{brief_overview}\"\n")

        # store_res = await run_decision_agent(
        #     query_or_overview=brief_overview,
        #     team_id=team_id,
        #     db=db,
        #     action="store",
        #     created_by=user_id,
        #     participants=[{"user_id": user_id, "role": "DevOps Lead"}]
        # )

        # print("[Agent Store Output Answer]:")
        # print(store_res["answer"])
        # print("\n[Recorded Decision Object]:")
        # print(json.dumps(store_res["decision_result"], indent=2, default=str))
        # print(f"\nTokens Used -> Input: {store_res['input_tokens']} | Output: {store_res['output_tokens']}")

        # -------------------------------------------------------------------
        # TEST 2: SEARCH ACTION
        # -------------------------------------------------------------------
        print("\n" + "=" * 70)
        print("TEST 2: SEARCH ACTION")
        print("=" * 70)

        search_query = "when cortex will launch and when this decision was decided"
        print(f"Search Query Input: \"{search_query}\"\n")

        search_res = await run_decision_agent(
            query_or_overview=search_query,
            team_id=team_id,
            db=db,
            action="search"
        )

        print("[Agent Search Output Answer]:")
        print(search_res["answer"])
        # print("\n[Retrieved Decisions Object]:")
        # print(json.dumps(search_res["decision_result"], indent=2, default=str))
        print(f"\nTokens Used -> Input: {search_res['input_tokens']} | Output: {search_res['output_tokens']}")

        print("\n" + "=" * 70)
        print("DECISION SUB-AGENT TEST COMPLETED SUCCESSFULLY!")
        print("=" * 70)

    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
