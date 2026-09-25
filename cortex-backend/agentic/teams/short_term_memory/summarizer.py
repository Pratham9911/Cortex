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

    "participants",

    "discussion_context",

    "conversation_state",

    "decisions_and_agreements",

    "open_items",

    "agent_interactions",

]

# Hard safety cap applied in code — bullets beyond this are silently dropped.
# User info uses the same cap; the prompt instructs the model to preserve it fully.
_HARD_CAP = 7

_SYSTEM_PROMPT = """\
You are a memory extractor for a multi-user team discussion.

Read the discussion and return ONE JSON object with exactly these six keys:

  "participants"
  "discussion_context"
  "conversation_state"
  "decisions_and_agreements"
  "open_items"
  "agent_interactions"

Each value must be a JSON array of bullet strings. Use [] when empty.

=== BULLET RULES ===

- Max 25 words per bullet.
- Aim for max 5 bullets per section.
- Never exceed 5 bullets per section.
- Preserve who said important information using name and user_id when available.
- Never store private chain-of-thought.

=== SECTIONS ===

participants

People relevant to the discussion. Preserve user_id, name, and relevant role/context.

Example:
"Rahul (user_id=42) is working on backend ingestion."

This is discussion-scoped memory, not permanent user memory.

discussion_context

Important information, statements, requirements, observations, or explanations from participants that may matter later.

Always preserve attribution when it affects meaning.

Good:
"Rahul said scanned PDFs fail during OCR while normal PDFs work."

Do not store vague topic names or irrelevant conversation.

conversation_state

The current state of the discussion: active problem, approach, progress, and important context needed for the next turn.

Example:
"The team is investigating OCR failures for scanned PDFs; normal PDF ingestion works."

decisions_and_agreements

Decisions, agreements, conclusions, chosen approaches, or rejected approaches.

Only record an actual decision when the discussion establishes agreement.

Example:
"The team agreed to test RapidOCR for scanned PDFs."
Do not invent agreement from a suggestion.

open_items

Unresolved questions, pending work, investigations, or decisions still to be made.
Example:
"The team has not yet decided how OCR failures should be handled in production."
Remove items once resolved.

agent_interactions

Useful results or context from previous Cortex-agent interactions that may matter later.

Store results, retrieved information, or conclusions — never the agent's private reasoning.
Example:
"Cortex previously found that the ingestion pipeline already supports OCR preprocessing."

=== MERGE RULES ===

When previous STM is provided:

- Merge it with the new messages.
- Add relevant new information and participants.
- Update stale or corrected information.
- Keep the latest conversation state.
- Preserve valid decisions unless explicitly changed or superseded.
- Remove resolved open items.
- Avoid duplicates.
- Prefer newer information when facts conflict.
- Keep the most important current information first.
- Remove information no longer useful to the active discussion.

=== ATTRIBUTION ===

This is a multi-user discussion.

Do not merge different people's statements when attribution matters.

Prefer:
"Pratham proposed using Redis for caching."
"Rahul questioned the invalidation strategy."

Only say "the team agreed" when agreement is actually established.

=== QUALITY ===

- Be concise and factual.
- Preserve useful context, not entire messages.
- Do not invent facts, decisions, or user information.
- Ignore greetings, filler, and irrelevant conversation.
- Never erase useful memory merely because the topic changed.
- Output ONLY the JSON object. No prose, markdown, or explanation.
- try to place imp and relevant items at the top of each section, less important items at the bottom and later can be removed if irrelevent.
"""


def _empty_summary() -> dict[str, list[str]]:
    return {field: [] for field in _FIELDS}


def _render_summary(data: dict[str, list[str]]) -> str:
    """Format the 5-field dict as readable memory text for the SystemMessage."""
    labels = {

    "participants":              "1. PARTICIPANTS",

    "discussion_context":        "2. DISCUSSION CONTEXT",

    "conversation_state":        "3. CONVERSATION STATE",

    "decisions_and_agreements":  "4. DECISIONS & AGREEMENTS",

    "open_items":                "5. OPEN ITEMS",

    "agent_interactions":        "6. AGENT INTERACTIONS",

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
