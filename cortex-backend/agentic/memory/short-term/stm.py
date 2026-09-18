"""In-memory short-term chat memory."""

from collections.abc import Sequence

from langchain_core.messages import BaseMessage, SystemMessage

from summarizer import summarize_history


class ShortTermMemory:
    """Store independent chat histories and compact old history when needed."""

    TOKEN_THRESHOLD = 1000

    def __init__(self):
        self._memory: dict[str, list[BaseMessage]] = {}

    def get(self, chat_id: str) -> list[BaseMessage]:
        """Return the current history for a chat ID."""
        return list(self._memory.get(chat_id, []))

    def put(self, chat_id: str, current_conversation: Sequence[BaseMessage]) -> None:
        """Store a turn, compacting only older history when the limit is exceeded."""
        current_messages = list(current_conversation)
        if not current_messages:
            return

        history = self.get(chat_id)
        combined_history = [*history, *current_messages]

        # Save the completed turn before compaction so a summarizer failure
        # cannot discard the response the user has already received.
        self._memory[chat_id] = combined_history

        if self._token_count(combined_history) > self.TOKEN_THRESHOLD and history:
            summary = summarize_history(history)
            self._memory[chat_id] = [summary, *current_messages]

    def summarize(self, chat_id: str) -> BaseMessage | None:
        history = self.get(chat_id)
        if not history:
            return None

        summary = summarize_history(history)
        self._memory[chat_id] = [summary]
        return summary

    
    @staticmethod
    def _token_count(messages: Sequence[BaseMessage]) -> int:
        """Estimate tokens without requiring a tokenizer or model API call."""
        text = "\n".join(
            f"{message.type}: {message.content}" for message in messages
        )
        return max(1, (len(text) + 3) // 4) if text else 0


__all__ = ["ShortTermMemory", "SystemMessage"]
