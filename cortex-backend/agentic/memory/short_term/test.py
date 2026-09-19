"""Interactive test for in-memory short-term memory.

Run from ``cortex-backend`` with a ``FIREWORKS_API_KEY`` available:

	python agentic/memory/short-term/test.py

Type messages to chat with the agent. Type ``print`` to show the saved
conversation, ``summarize`` to test summarization manually, or ``end`` to
stop. Automatic summarization still happens at 1000 estimated tokens.
"""

import os

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_fireworks import ChatFireworks

from agentic.memory.short_term.stm import ShortTermMemory

load_dotenv()

MODEL = "accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b"
FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY")

llm = ChatFireworks(
	model=MODEL,
	api_key=FIREWORKS_API_KEY,
	temperature=0,

	# Disables Nemotron's chain-of-thought so the response is always clean.
	reasoning_effort="none",
)

# ── Part 1: who the agent is and what it must/must not do ──────────────────
MAIN_SYSTEM_PROMPT = SystemMessage(
	content=(
		"You are Cortex, a helpful AI assistant.\n"
		"Answer only what the user asked in their latest message.\n"
		"Return only the final answer — no hidden reasoning, no chain-of-thought, "
		"no planning, no meta-commentary, no <think> tags.\n"
		"If calculation or analysis is needed, keep it internal and show only the result."
	)
)

# ── Part 2: injected between history and the latest message ─────────────────
# This boundary tells the LLM exactly how to use what came before.
_HISTORY_BRIDGE = SystemMessage(
	content=(
		"── Above is the conversation history / memory context. ──\n"
		"Refer to it only if it is relevant to the question below.\n"
		"Do not repeat or summarise it. Now answer the user's latest message:"
	)
)



def ask(memory: ShortTermMemory, chat_id: str, message: str) -> str:
	history = memory.get(chat_id)
	user_message = HumanMessage(content=message)

	# Context layout sent to the LLM:
	#   [SYSTEM PROMPT]          ← who the agent is + output rules
	#   [history messages...]    ← summary + recent turns from STM (may be empty)
	#   [HISTORY BRIDGE]         ← separator: "use history only if relevant, now answer:"
	#   [latest user message]    ← the actual question
	if history:
		llm_input = [MAIN_SYSTEM_PROMPT, *history, _HISTORY_BRIDGE, user_message]
	else:
		# No history yet — skip the bridge so the prompt stays clean.
		llm_input = [MAIN_SYSTEM_PROMPT, user_message]

	response = llm.invoke(llm_input)
	clean_response = AIMessage(content=response.content)
	print(f"\nAssistant: {response.content}\n", flush=True)
	memory.put(chat_id, [user_message, clean_response])
	return response.content


def print_conversation(memory: ShortTermMemory, chat_id: str):
	messages = memory.get(chat_id)

	print("\n--- Conversation so far ---")
	if not messages:
		print("No messages yet.")
	else:
		for message in messages:
			role = {
				"human": "You",
				"ai": "Assistant",
				"system": "Memory",
			}.get(message.type, message.type.title())
			print(f"{role}: {message.content}")
	print("---------------------------\n")


def summarize_conversation(memory: ShortTermMemory, chat_id: str):
	history = memory.get(chat_id)
	
	if not history:
		print("---------------------------------\n")
		return

	try:
		summary = memory.summarize(chat_id)
	except Exception as error:
		print(f"Summarizer failed: {error}")
		print("---------------------------------\n")
		return

	print("---------------------------------")
	print("Summary returned by LLM:")
	print(summary.content if summary else "No summary returned.")
	print("Stored history was replaced with this summary.")
	print("---------------------------------\n")


def main():
	if not FIREWORKS_API_KEY:
		raise RuntimeError("FIREWORKS_API_KEY is not set in the environment or .env file.")

	memory = ShortTermMemory()
	chat_id = "short-term-fireworks-terminal"

	print("Fireworks memory chat started.")
	print("Type 'print' for history, 'summarize' to test summarization, or 'end' to exit.")
	while True:
		try:
			message = input("\nYou: ").strip()
		except (EOFError, KeyboardInterrupt):
			print("\nChat ended.")
			break

		if not message:
			continue
		if message.lower() == "end":
			print("Chat ended.")
			break
		if message.lower() == "print":
			print_conversation(memory, chat_id)
			continue
		if message.lower() == "summarize":
			summarize_conversation(memory, chat_id)
			continue

		ask(memory, chat_id, message)


if __name__ == "__main__":
	main()
