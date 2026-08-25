import os
from groq import Groq
from langchain_core.tools import tool


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
            model="accounts/fireworks/models/gpt-oss-20b",
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
    Search the web for current, factual, or recent information for similar things at a time.
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
            include_answer=True,
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


