import os
import contextvars
import threading
from langchain_core.tools import tool

_global_callback_lock = threading.Lock()
_global_active_callback = None
active_event_callback: contextvars.ContextVar = contextvars.ContextVar("active_event_callback", default=None)


def set_active_event_callback(cb):
    global _global_active_callback
    with _global_callback_lock:
        _global_active_callback = cb
    active_event_callback.set(cb)


def get_active_event_callback():
    cb = active_event_callback.get()
    if cb is not None:
        return cb
    with _global_callback_lock:
        return _global_active_callback


_global_project_lock = threading.Lock()
_global_active_project_ctx = None
active_project_context: contextvars.ContextVar = contextvars.ContextVar("active_project_context", default=None)


def set_active_project_context(project_id=None, user_id=None, user_role=None, db=None):
    global _global_active_project_ctx
    ctx = {
        "project_id": project_id,
        "user_id": user_id,
        "user_role": user_role,
        "db": db,
    }
    with _global_project_lock:
        _global_active_project_ctx = ctx
    active_project_context.set(ctx)


def get_active_project_context():
    ctx = active_project_context.get()
    if ctx is not None:
        return ctx
    with _global_project_lock:
        return _global_active_project_ctx or {}


@tool("web_agent")
def web_agent_tool(query: str) -> dict:
    """
    Delegate ALL web research tasks to the specialized Web Agent in ONE call and command it what to do.
    The Web Agent can research multiple unrelated topics if you provide a clear query with what is needed and do not just put Keywords.
    CRITICAL: Bundle 3-4 web sub-questions into a single call — e.g. 'find population of india and china and compare with us'.
    Do NOT call web_agent separately for each sub-question. One comprehensive call handles everything.
    The agent returns a single structured result with the full answer and sources.
    """
    from agentic.sub_agents.web_agent import run_web_agent

    callback = get_active_event_callback()
    result = run_web_agent(query=query, event_callback=callback)
    return result


@tool("retrieval_agent")
def retrieval_agent_tool(query: str) -> dict:
    """
    Delegate internal project knowledge research to the specialized Retrieval Agent in ONE call and command it what to do.
    The Retrieval Agent searches project files, documents, and reports to answer questions about project data.
    CRITICAL: Bundle all project-related sub-questions into a single call — e.g. 'find architecture decisions and deployment steps in project docs'.
    Do NOT call retrieval_agent separately for each sub-question. One comprehensive call handles everything.
    Always provide a clear query with what is needed , do not just put keywords
    """
    from agentic.sub_agents.retrieval_agent import run_retrieval_agent

    callback = get_active_event_callback()
    result = run_retrieval_agent(query=query, event_callback=callback)
    return result


@tool
def project_search(query: str) -> dict:
    """
    Search internal project documents using hybrid search and reranking.
    Returns a synthesized text answer and relevant retrieved document chunks.
    """
    from rag.retriever import hybrid_search_with_rerank
    from rag.generator import generate_answer
    from rag.utils import format_chunks_for_debug

    ctx = get_active_project_context()
    project_id = ctx.get("project_id") or 1
    user_id = ctx.get("user_id") or 1
    user_role = ctx.get("user_role") or "owner"
    db = ctx.get("db")

    close_db_on_exit = False
    if db is None:
        try:
            from database import SessionLocal
            db = SessionLocal()
            close_db_on_exit = True
        except Exception as e:
            return {
                "answer": f"Database session unavailable: {str(e)}",
                "chunks": [],
            }

    try:
        chunks = hybrid_search_with_rerank(
            query=query,
            project_id=project_id,
            user_id=user_id,
            user_role=user_role,
            db=db,
        )
        if not chunks:
            return {
                "answer": "No relevant information found in the project documents for this query.",
                "chunks": [],
            }

        answer = generate_answer(query=query, chunks=chunks)
        formatted_chunks = format_chunks_for_debug(chunks)
        return {
            "answer": answer,
            "chunks": formatted_chunks,
        }
    except Exception as e:
        return {
            "answer": f"Error performing project search: {str(e)}",
            "chunks": [],
        }
    finally:
        if close_db_on_exit and db is not None:
            try:
                db.close()
            except Exception:
                pass







@tool
def calculator(num1: float, num2: float, operator: str) -> float:
    """Perform a basic arithmetic operation on two numbers.
         operator:  "+", "-", "*", "/"."""
    
    if operator == "+":
        return num1 + num2
    elif operator == "-":
        return num1 - num2
    elif operator == "*":
        return num1 * num2
    elif operator == "/":
        if num2 == 0:
            raise ValueError("Cannot divide by zero")
        return num1 / num2
    else:
        raise ValueError(f"Unsupported operator: {operator}")


@tool
def send_email(to: str, subject: str, body: str) -> dict:
    """
    Call this tool immediately when user requests to send an email.
    Drafts an email to recipient ('to') with 'subject' and 'body' and requests human confirmation automatically.
    """
    from langgraph.types import interrupt

    draft = {"to": to, "subject": subject, "body": body}
    response = interrupt({"action": "email_approval", "draft": draft})

    action = ""
    feedback = ""

    if isinstance(response, dict):
        action = str(response.get("action", "")).lower()
        feedback = str(response.get("feedback", "")).strip()
    elif isinstance(response, str):
        action = str(response).lower()

    approved = action in ["yes", "approve", "approved", "true"]

    if approved:
        msg = f"Email approved and sent to {to}."
        if feedback:
            msg += f" Additional user note: '{feedback}'"
        return {
            "status": "sent",
            "to": to,
            "subject": subject,
            "body": body,
            "feedback": feedback,
            "message": msg,
        }
    else:
        msg = f"Email sending rejected by user."
        if feedback:
            msg += f" User instructions for changes or cancellation: '{feedback}'"
        else:
            msg += " User provided no additional feedback."
        return {
            "status": "cancelled",
            "to": to,
            "subject": subject,
            "body": body,
            "feedback": feedback,
            "message": msg,
        }

    


LARGE_OUTPUT_THRESHOLD = 1200  # Only summarize if raw web answer exceeds 1200 characters (~200-250 words)


def summarize_tool_output(query: str, answer: str, threshold: int = LARGE_OUTPUT_THRESHOLD) -> str:
    """
    If the returned web answer length exceeds `threshold` (considered large),
    use Fireworks LLM to synthesize a concise summary addressing the query.
    Otherwise, return the answer directly as-is.
    """
    if not answer:
        return answer

    answer_len = len(answer)

    if answer_len <= threshold:
        print(f"[web_search] Output length ({answer_len} chars) <= threshold ({threshold} chars) -> Returning directly without summarization.")
        return answer

    print(f"[web_search] Output length ({answer_len} chars) > threshold ({threshold} chars) -> Summarizing with Fireworks LLM...")

    try:
        # pyrefly: ignore [missing-import]
        from langchain_fireworks import ChatFireworks
        from langchain_core.messages import HumanMessage

        llm = ChatFireworks(
            model="accounts/fireworks/models/gpt-oss-120b",
            api_key=os.getenv("FIREWORKS_API_KEY"),
            temperature=0,
        )




        prompt = (
            f"Synthesize and summarize the following web search text "
            f"to directly, accurately, and concisely answer the user's query.\n\n"
            f"Search Query: {query}\n\n"
            f"Raw Web Search Result:\n{answer}\n\n"
            f"Provide ONLY a concise, facts-only summary answering the query."
        )

        response = llm.invoke([HumanMessage(content=prompt)])
        summary = response.content.strip() if response.content else answer
        return summary if summary else answer
    except Exception as e:
        print(f"[web_search] Summarization fallback error: {e}")
        return answer



@tool
def web_search(query: str) -> dict:
    """
    Search the web for the given query 
    ask it want you need , each thing mention clearly , instruct it in short what to find exactly 
    don't assume it will understand your query if you just put keywords , be clear and specific in your query
    """

    answer = ""
    sources = []
    tavily_failed = False

    # ==============================================================
    # 1. Try Tavily web search
    # ==============================================================

    try:
        from tavily import TavilyClient

        tavily_client = TavilyClient(
            api_key=os.getenv("TAVILY_API_KEY")
        )

        search_results = tavily_client.search(
            query=query,
            include_answer="advanced",
            search_depth="fast",
            include_raw_content=False,
            include_favicon=True,
            max_results=5
        )

        answer = search_results.get("answer") or ""

        for result in search_results.get("results", []):
            sources.append({
                "url": result.get("url"),
                "title": result.get("title"),
                "score": result.get("score"),
                "favicon": result.get("favicon")
            })

        if answer:
            return {
                "answer": summarize_tool_output(query, answer),
                "sources": sources,
            }
        else:
            tavily_failed = True

    except Exception as e:
        print(f"[web_search] Tavily search failed: {e}")
        tavily_failed = True

    # ==============================================================
    # 2. Manual web-search fallback
    # ==============================================================

    if tavily_failed:

        from rag.agents.webagent import search, fetch
        print("Running Manual Search")
        search_result = search(query)

        results = search_result.get("results", [])

        selected_indices = search_result.get(
            "selected_indices",
            []
        )

        # ----------------------------------------------------------
        # No search results
        # ----------------------------------------------------------

        if not results:

            return {
                "answer": "No web results found for your query.",
                "sources": [],
            }

        # ----------------------------------------------------------
        # Select sources
        # ----------------------------------------------------------

        selected_results = []

        for idx in selected_indices:

            if 1 <= idx <= len(results):
                selected_results.append(
                    results[idx - 1]
                )

        # Fallback: top 2 results
        if not selected_results:
            selected_results = results[:2]

        # ----------------------------------------------------------
        # Fetch selected pages
        # ----------------------------------------------------------

        final_answer = ""
        final_sources = []

        try:

            for event in fetch(
                query=query,
                selected_results=selected_results,
            ):

                if event.get("type") == "error":
                    continue

                if event.get("type") == "final":

                    final_answer = event.get(
                        "answer",
                        ""
                    )

                    final_sources = event.get(
                        "sources",
                        []
                    )


        except Exception as e:

            raise RuntimeError(
                f"Manual web search failed: {e}"
            ) from e

        return {
            "answer": summarize_tool_output(query, final_answer),
            "sources": final_sources,
        }

    # ==============================================================
    # 3. Should never normally reach here
    # ==============================================================

    return {
        "answer": summarize_tool_output(query, answer),
        "sources": sources,
    }


