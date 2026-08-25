import json
from typing import Any


def stream_agent(workflow, initial_state):
    """
    Execute the LangGraph workflow and convert graph updates
    into SSE-ready events.
    """

    yield {
        "type": "agent_started"
    }

    try:
        for update in workflow.stream(
            initial_state,
            stream_mode="updates",
        ):
            print("\nRAW GRAPH UPDATE:")
            print(repr(update))

            for node_name, node_update in update.items():
                
                print(
                     "STREAM UPDATE:",
                     node_name,
                     repr(node_update)
                 )
                if node_name == "chat_node":

                  yield (
                      f"data: {json.dumps({
                          'type': 'reasoning',
                          'iteration': node_update.get('iterations'),
                          'content': node_update.get('reasoning', ''),
                      })}\n\n"
                  )
              
                  answer = node_update.get("answer", "")
              
                  if answer:
                      yield (
                          f"data: {json.dumps({
                              'type': 'answer',
                              'iteration': node_update.get('iterations'),
                              'content': answer,
                          })}\n\n"
                      )
                elif node_name == "tool_node":
                    yield {
                        "type": "tool_completed",
                        "tool": "tool_node",
                    }

                elif node_name == "collect_tool_results":
                    sources = node_update.get("sources", [])

                    if sources:
                        yield {
                            "type": "sources",
                            "sources": sources,
                        }
        print("Workflow completed successfully.")
        yield {
            "type": "agent_completed"
        }

    except Exception as e:
        yield {
            "type": "error",
            "message": str(e),
        }


def to_sse(event: dict[str, Any]) -> str:
    """
    Convert an event dictionary into an SSE message.
    """

    return f"data: {json.dumps(event)}\n\n"