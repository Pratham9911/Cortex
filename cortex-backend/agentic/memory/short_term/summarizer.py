"""Short-term memory summarizer.

Uses the same Fireworks pattern as intent.py:
  - reasoning_effort="none"  -> disables Nemotron chain-of-thought completely
  - response_format json_object -> API-enforced JSON, no parsing roulette
  - Manual json.loads + field validation with a safe fallback
"""

import json
import os
from collections.abc import Sequence

from dotenv import load_dotenv
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_fireworks import ChatFireworks


load_dotenv()

MODEL = os.getenv("MAIN_MODEL")

# reasoning_effort="none" disables Nemotron's thinking mode entirely.
# response_format json_object is enforced at the API level — the model
# cannot return anything other than valid JSON regardless of prompt.
_llm = ChatFireworks(
    model=MODEL,
    api_key=os.getenv("FIREWORKS_API_KEY"),
    temperature=0,
    max_tokens=1536,
    request_timeout=35,
    max_retries=2,
    reasoning_effort="none",
    model_kwargs={"response_format": {"type": "json_object"}},
)

# ---------------------------------------------------------------------------
# Schema  (validated in code after json.loads)
# ---------------------------------------------------------------------------
# {
#   "user_information_and_preferences": ["..."],
#   "discussion_and_context":           ["..."],
#   "assistant_responses_and_progress": ["..."],
#   "decisions_and_current_state":      ["..."],
#   "open_items":                       ["..."]
# }
# Each field is a list[str] of bullet strings.
# Code safety net: any field that exceeds 7 bullets is trimmed to 7.
# ---------------------------------------------------------------------------

_FIELDS = [
    "user_information_and_preferences",
    "discussion_and_context",
    "assistant_responses_and_progress",
    "decisions_and_current_state",
    "open_items",
]

# Hard safety cap applied in code — bullets beyond this are silently dropped.
# User info uses the same cap; the prompt instructs the model to preserve it fully.
_HARD_CAP = 7

_SYSTEM_PROMPT = """\
You are a memory extractor for an AI assistant.

Read the conversation below and return a single JSON object with exactly these five keys:

  "user_information_and_preferences"
  "discussion_and_context"
  "assistant_responses_and_progress"
  "decisions_and_current_state"
  "open_items"

The value of each key is a JSON array of bullet strings.
Use [] if a section has nothing useful to record.

=== BULLET RULES ===

- Max 25 words per bullet.
- Aim for max 5 bullets per section.
- Never exceed 5 bullets in any section (drop the least important ones).
- Exception: user_information_and_preferences — preserve ALL important user facts but you can drop if requirements changes or no longer relevant.
  even if that means slightly more bullets. Do NOT just drop user info to meet a count limit.

=== SECTION DEFINITIONS ===

user_information_and_preferences
  Stable facts about the user that matter in future turns:
  name, background, goals, preferences, constraints, learning interests,
  tools or languages they use, choices already made.
  This is the MOST important section — preserve it faithfully.
  Update a fact only when the user explicitly changes it.
  Never delete user information just because the topic changed.

discussion_and_context
  What the user wanted and what was actually discussed.
  Write specific, factual sentences — not just topic names.
  Bad:  "User asked about testing."
  Good: "User requested software testing concepts; follow-up asked for details from KB."
  Keep only the most recent / active topics; drop fully resolved older ones.

assistant_responses_and_progress
  Key topics, questions answered, solutions, and explanations the assistant provided.
  Always record specific topics, algorithms, or points listed by the assistant
  (e.g., "Assistant listed and explained QA vs QC, Alpha vs Beta testing, Integration testing approaches, and Performance testing types").
  This is critical so future references (e.g. "expand on these", "answer those from KB", "the 2nd point") can be resolved.
  Do not copy full responses verbatim.

decisions_and_current_state
  Decisions made, approaches chosen or rejected, current task status.
  Example: "User chose hybrid retrieval (BM25 + semantic + RRF)."
  Drop decisions for tasks that are fully finished or abandoned.

open_items
  Unresolved questions, pending work, or things still to be decided.
  Remove an item once it is answered or no longer relevant.

=== MERGE RULES (when PERSISTENT MEMORY is present) ===

The conversation may start with a PERSISTENT MEMORY block — a prior summary.
  - Merge it with the new messages.
  - Preserve existing user_information_and_preferences fully; only update / replace if explicitly changed.
  - For other sections: update stale facts, add new items, remove fully resolved items.
  - Mention each fact only once; no duplicates.
  - Prefer new information over old when they conflict.
  - Place imp and relevant items at the top of each section, less important items at the bottom and later can be removed if irrelevant.

=== QUALITY RULES ===

  - Keep bullets concise and factual.
  - Drop useless filler and old useless info to current context.
  - Do not copy messages verbatim; extract the useful information.
  - Do not invent facts not present in the conversation.
  - Never erase memory at the user's request.
  - Output ONLY the JSON object — no prose, no markdown, no explanation.
"""


def _empty_summary() -> dict[str, list[str]]:
    return {field: [] for field in _FIELDS}


def _fallback_summary(messages: Sequence[BaseMessage]) -> dict[str, list[str]]:
    """Deterministic fallback summary used when Fireworks API times out or is under heavy load."""
    data = _empty_summary()
    for m in messages:
        snippet = (m.content or "").strip().replace("\n", " ")[:140]
        if not snippet:
            continue
        if m.type == "human":
            data["discussion_and_context"].append(f"User requested: {snippet}")
        elif m.type == "ai":
            data["assistant_responses_and_progress"].append(f"Assistant covered: {snippet}")
    for field in _FIELDS:
        data[field] = data[field][-5:]
    return data


def _render_summary(data: dict[str, list[str]]) -> str:
    """Format the 5-field dict as readable memory text for the SystemMessage."""
    labels = {
        "user_information_and_preferences":  "1. USER INFORMATION & PREFERENCES",
        "discussion_and_context":            "2. DISCUSSION / CONTEXT",
        "assistant_responses_and_progress":  "3. ASSISTANT RESPONSES / PROGRESS",
        "decisions_and_current_state":       "4. DECISIONS & CURRENT STATE",
        "open_items":                        "5. OPEN ITEMS",
    }
    sections = []
    for field, label in labels.items():
        items = data.get(field, [])
        bullets = "\n".join(f"- {item}" for item in items) if items else "- None"
        sections.append(f"{label}\n{bullets}")
    return "\n\n".join(sections)


def summarize_history(messages: Sequence[BaseMessage]) -> BaseMessage:
    """Compact old chat history into a single SystemMessage for future turns."""
    if not messages:
        return SystemMessage(content="No previous conversation memory.")

    formatted = "\n".join(
        f"{'User' if m.type == 'human' else ('Memory' if m.type == 'system' else 'AI')}: {m.content}"
        for m in messages
    )

    prompt = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=formatted),
    ]

    try:
        response = _llm.invoke(prompt)
        data = json.loads(response.content)
        for field in _FIELDS:
            value = data.get(field)
            if not isinstance(value, list):
                data[field] = []
            else:
                cleaned = [str(item) for item in value if str(item).strip()]
                data[field] = cleaned[:_HARD_CAP]
    except Exception as exc:
        print(f"\n--- Summarizer call/parse failed ({exc}), using deterministic fallback ---\n")
        data = _fallback_summary(messages)

    summary_text = _render_summary(data)
    print("\n--- Memory summary ---\n")
    print(summary_text)
    print("----------------------\n")

    return SystemMessage(content=f"PERSISTENT MEMORY:\n\n{summary_text}")


__all__ = ["summarize_history"]
