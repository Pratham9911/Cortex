"""
agentic.teams.decisions.generator
==================================
Decision RAG Generator module.

Takes retrieved team decision objects (title, description, created_by, participants, dates)
and uses an LLM to synthesize a focused answer addressing the user's specific query.
Prevents passing bloated raw DB context directly to supervisory agents.
"""

import os
from typing import List, Dict, Any, Tuple
from dotenv import load_dotenv
from langchain_core.prompts import PromptTemplate
from langchain_fireworks import ChatFireworks

load_dotenv()

MODEL_NAME = "accounts/fireworks/models/gpt-oss-120b"

generator_llm = ChatFireworks(
    model=MODEL_NAME,
    temperature=0,
    api_key=os.getenv("FIREWORKS_API_KEY")
)

DECISION_GENERATOR_PROMPT = PromptTemplate.from_template(
    """
You are the Cortex Team Decision Knowledge Synthesizer.

User Query:
{query}

Your task is to answer the user's query using ONLY the provided Team Decision Records.

=== INSTRUCTIONS ===
- Provide a clear, accurate, and concise answer directly answering the user query.
- Use ONLY facts present in the provided Team Decision Records.
- Clearly mention relevant decision details when available (such as title, date, rationale, scope, and key participants/roles).
- Format your response using clean Markdown (e.g. headings, tables, bullet points).
- Keep the response focused on what was specifically requested. Do NOT dump unnecessary raw context.

=== REJECTION RULES ===
- If the provided decision records do NOT contain an answer to the query, or if the topics do not match, state explicitly:
  "No matching team decision was found in the database for this query."
- Never invent decisions, dates, participants, or technical details not explicitly in the context.

=== TEAM DECISION RECORDS ===
{context}
"""
)


def format_decision_context(decisions: List[Dict[str, Any]]) -> str:
    """Format a list of decision records into clean text blocks for the generator LLM."""
    blocks = []
    for d in decisions:
        decision_id = d.get("decision_id") or d.get("id")
        title = d.get("title", "Untitled Decision")
        description = d.get("description", "No description provided.")
        created_by = d.get("created_by")
        created_at = d.get("created_at")
        updated_at = d.get("updated_at")

        participants = d.get("participants", [])
        part_str = ""
        if participants:
            part_items = []
            for p in participants:
                if isinstance(p, dict):
                    name = p.get("name") or f"User #{p.get('user_id')}"
                    role = p.get("role", "Participant")
                    part_items.append(f"{name} ({role})")
                else:
                    part_items.append(f"User #{p}")
            part_str = ", ".join(part_items)
        else:
            part_str = "None listed"

        block = (
            f"--- Decision #{decision_id}: {title} ---\n"
            f"Title: {title}\n"
            f"Created By User ID: {created_by}\n"
            f"Participants & Roles: {part_str}\n"
            f"Recorded At: {created_at}\n"
            f"Last Modified: {updated_at}\n"
            f"Description:\n{description}"
        )
        blocks.append(block)

    return "\n\n".join(blocks)


def generate_decision_answer(
    query: str,
    decisions: List[Dict[str, Any]]
) -> Tuple[str, Dict[str, int]]:
    """
    Synthesizes a focused answer from retrieved decision records using LLM generation.

    Returns:
      (synthesized_answer, usage_dict)
    """
    if not decisions:
        print("\n==================== DECISION GENERATOR ====================")
        print(f"[Query]: \"{query}\"")
        print("[Raw DB Decisions Received by Generator]: 0 records found.")
        print("============================================================\n")
        return (
            "No matching team decision was found in the database for this query.",
            {"input_tokens": 0, "output_tokens": 0}
        )

    print("\n==================== DECISION GENERATOR ====================")
    print(f"[Query]: \"{query}\"")
    print(f"[Raw DB Decisions Received by Generator]: Count = {len(decisions)}")
    for i, d in enumerate(decisions, 1):
        did = d.get("decision_id") or d.get("id")
        t = d.get("title", "Untitled")
        print(f"  [{i}] Decision #{did} - Title: '{t}'")
        print(f"      Created By: {d.get('created_by')} | Created At: {d.get('created_at')}")
        print(f"      Participants: {d.get('participants')}")
        desc_prev = repr(d.get('description', ''))[:120]
        print(f"      Description Preview: {desc_prev}...")
    print("============================================================\n")

    context_str = format_decision_context(decisions)

    prompt_value = DECISION_GENERATOR_PROMPT.invoke({
        "query": query,
        "context": context_str
    })

    response = generator_llm.invoke(prompt_value)
    usage = getattr(response, "usage_metadata", {}) or {}

    input_tokens = usage.get("input_tokens", 0) or 0
    output_tokens = usage.get("output_tokens", 0) or 0

    return response.content, {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
    }
