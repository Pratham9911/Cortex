import os
from tavily import TavilyClient
from dotenv import load_dotenv

load_dotenv()

tavily_client = TavilyClient(
    api_key=os.getenv("TAVILY_API_KEY")
)


def search_web(query: str):
    response = tavily_client.search(
        query=query,
        include_answer=True,
        include_raw_content=False,
        include_favicon=True,
       
        max_results=5
    )

    return response

query = "What is the capital of France? and ceo of glean and ceo of tinyfish"

search_results = search_web(query)

# Answer
answer = search_results.get("answer")

print("\n========== ANSWER ==========\n")
print(answer)


# Sources
print("\n========== SOURCES ==========\n")

sources = []

for result in search_results.get("results", []):
    source = {
        "url": result.get("url"),
        "title": result.get("title"),
        "score": result.get("score"),
        "favicon": result.get("favicon")
    }

    sources.append(source)

    print(source)