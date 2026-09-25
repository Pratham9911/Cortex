"""
agentic.teams.decisions.store
==============================
Store Decisions module.

Handles embedding generation (via Fireworks API) and storing decisions
as whole entities (no chunking) with title, description, team scoping,
full-text search vector, vector embedding, and decision participants.
"""

import os
from typing import List, Optional, Union, Dict, Any
import requests
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from sqlalchemy import text, func

from models import Decision, DecisionParticipant, User, TeamMember

load_dotenv()

FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY")
FIREWORKS_EMBEDDING_URL = "https://api.fireworks.ai/inference/v1/embeddings"
EMBEDDING_MODEL_NAME = "fireworks/qwen3-embedding-8b"


def generate_embedding(text_content: str) -> List[float]:
    """Generate 1024-dimensional embedding for text using Fireworks Qwen3 embedding model."""
    headers = {
        "Authorization": f"Bearer {FIREWORKS_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": EMBEDDING_MODEL_NAME,
        "input": text_content,
        "dimensions": 1024
    }
    response = requests.post(FIREWORKS_EMBEDDING_URL, headers=headers, json=payload)
    response.raise_for_status()
    result = response.json()
    return result["data"][0]["embedding"]


def store_decision(
    db: Session,
    team_id: int,
    title: str,
    description: str,
    created_by: int,
    participants: Optional[List[Union[int, Dict[str, Any]]]] = None,
    status: str = "approved"
) -> Dict[str, Any]:
    """
    Store a complete decision for a team without chunking.

    Parameters
    ----------
    db : Session
        SQLAlchemy DB session.
    team_id : int
        ID of the team owning this decision.
    title : str
        Short searchable title of the decision.
    description : str
        Full decision content, context, and reasoning.
    created_by : int
        User ID of the decision creator.
    participants : List[int | Dict], optional
        Users involved in the decision. Can be list of user_ids [1, 2]
        or list of dicts [{"user_id": 1, "role": "approver"}].
    status : str, default "approved"
        Approval status ("pending_approval", "approved", "rejected").
    """
    # 1. Form text for embedding (title + description)
    combined_text = f"{title}\n\n{description}"
    embedding_vector = generate_embedding(combined_text)
    vector_str = "[" + ",".join(map(str, embedding_vector)) + "]"

    # 2. Insert decision record using raw SQL to populate search_vector, embedding, and status cleanly
    sql_insert = text("""
        INSERT INTO decisions (
            team_id, title, description, created_by, embedding, search_vector, status
        ) VALUES (
            :team_id,
            :title,
            :description,
            :created_by,
            CAST(:vector_str AS vector),
            to_tsvector('english', :title || ' ' || :description),
            :status
        )
        RETURNING id, created_at, updated_at;
    """)

    result = db.execute(
        sql_insert,
        {
            "team_id": team_id,
            "title": title,
            "description": description,
            "created_by": created_by,
            "vector_str": vector_str,
            "status": status,
        }
    ).fetchone()

    decision_id = result.id
    created_at = result.created_at
    updated_at = result.updated_at

    # 3. Process and insert participants
    added_participants = []
    invalid_participants = []
    if participants:
        for item in participants:
            if isinstance(item, int):
                user_id = item
                role = "participant"
            elif isinstance(item, dict):
                user_id = item.get("user_id")
                role = item.get("role", "participant")
            else:
                continue

            if not user_id:
                continue

            # Verify if user_id is actually a member of team_id
            is_team_member = db.query(TeamMember).filter(
                TeamMember.team_id == team_id,
                TeamMember.user_id == user_id
            ).first()

            if not is_team_member:
                invalid_participants.append(user_id)
                continue

            # Check if participant already inserted to avoid duplicate constraint error
            existing = db.query(DecisionParticipant).filter(
                DecisionParticipant.decision_id == decision_id,
                DecisionParticipant.user_id == user_id
            ).first()

            if not existing:
                part = DecisionParticipant(
                    decision_id=decision_id,
                    user_id=user_id,
                    role=role
                )
                db.add(part)
                added_participants.append({"user_id": user_id, "role": role})

    db.commit()

    participant_notice = ""
    if invalid_participants:
        invalid_str = ", ".join(f"User #{uid}" for uid in invalid_participants)
        participant_notice = f"Note: {invalid_str} is/are not member(s) of team #{team_id} and could not be added as decision participant(s)."

    return {
        "decision_id": decision_id,
        "team_id": team_id,
        "title": title,
        "description": description,
        "created_by": created_by,
        "status": status,
        "participants": added_participants,
        "participant_notice": participant_notice,
        "created_at": created_at,
        "updated_at": updated_at
    }
