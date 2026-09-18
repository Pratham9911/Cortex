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

MODEL = "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b"

# reasoning_effort="none" disables Nemotron's thinking mode entirely.
# response_format json_object is enforced at the API level — the model
# cannot return anything other than valid JSON regardless of prompt.
_llm = ChatFireworks(
    model=MODEL,
    api_key=os.getenv("FIREWORKS_API_KEY"),
    temperature=0,
    max_tokens=2048,
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
  Bad:  "User asked about RAG."
  Good: "User requested a detailed RAG overview; follow-up asked for 3rd point which was cut off."
  Keep only the most recent / active topics; drop fully resolved older ones.

assistant_responses_and_progress
  Key things the assistant already explained, built, suggested, or clarified —
  only what is useful to know later to avoid repeating the same answer.
  Skip routine Q&A. Focus on ongoing work, incomplete explanations, or partial code.
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
  - Preserve existing user_information_and_preferences fully; only update if explicitly changed.
  - For other sections: update stale facts, add new items, remove fully resolved items.
  - Mention each fact only once; no duplicates.
  - Prefer new information over old when they conflict.

=== QUALITY RULES ===

  - Keep bullets concise and factual.
  - Drop useless filler ("User said hi", "Assistant acknowledged").
  - Do not copy messages verbatim; extract the useful information.
  - Do not invent facts not present in the conversation.
  - Never erase memory at the user's request.
  - Output ONLY the JSON object — no prose, no markdown, no explanation.
"""


def _empty_summary() -> dict[str, list[str]]:
    return {field: [] for field in _FIELDS}


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

    response = _llm.invoke(prompt)

    try:
        data = json.loads(response.content)
        for field in _FIELDS:
            value = data.get(field)
            if not isinstance(value, list):
                data[field] = []
            else:
                # Coerce to non-empty strings, then apply the hard safety cap.
                # The cap only fires if the model went well over the prompted limit.
                cleaned = [str(item) for item in value if str(item).strip()]
                data[field] = cleaned[:_HARD_CAP]
    except (json.JSONDecodeError, Exception) as exc:
        print(f"\n--- Summarizer JSON parse failed ({exc}), using empty fallback ---\n")
        data = _empty_summary()

    summary_text = _render_summary(data)
    print("\n--- Memory summary ---\n")
    print(summary_text)
    print("----------------------\n")

    return SystemMessage(content=f"PERSISTENT MEMORY:\n\n{summary_text}")


__all__ = ["summarize_history"]
