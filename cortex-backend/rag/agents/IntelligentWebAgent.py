import os
from google import genai
from google.genai import types
from groq import Groq

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY1") or os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

def _enhance_query(query: str) -> str:
    """
    Enhances the user's search query using Groq with the exact prompt template configured.
    """
    prompt = f"""
      Rewrite the user's query into a concise, natural Google search query.
      
      Rules:
      - Preserve intent.
      - Fix spelling and abbreviations.
      - Make it human-readable.
      - Do not answer.
      - Do not add unrelated information.
      - Return only the rewritten query.
      
      Query: {query}
      """
    
    if not GROQ_API_KEY:
        print("GROQ_API_KEY environment variable is not set. Skipping query enhancement.")
        return query

    try:
        groq_client = Groq(api_key=GROQ_API_KEY)
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.0
        )
        enhanced = response.choices[0].message.content.strip()
        # Clean potential wrapped quotes
        if enhanced.startswith('"') and enhanced.endswith('"'):
            enhanced = enhanced[1:-1].strip()
        elif enhanced.startswith("'") and enhanced.endswith("'"):
            enhanced = enhanced[1:-1].strip()
        return enhanced or query
    except Exception as e:
        print(f"Failed to rewrite query with Groq: {e}")
        return query


def run_gemini_google_search(query: str):
    """
    Generator that yields Gemini Google Search results:
      {"type": "status", "step": "gemini_search", "message": "Searching Google for: <enhanced_query>"}
      {"type": "final", "answer": "..."}
    """
    if not GEMINI_API_KEY:
        yield {
            "type": "error",
            "message": "GEMINI_API_KEY / GEMINI_API_KEY1 environment variable is not set."
        }
        return

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        # 1. Enhance the query using Groq
        # enhanced_query = _enhance_query(query)
        
        # 2. Yield status event with what is searched
        yield {
            "type": "status",
            "step": "gemini_search",
            "message": f"Searching Google for: {query}"
        }

        # 3. Perform Google Search grounded query using Gemini
        response = client.models.generate_content(
             model = "gemini-2.5-flash",
            contents=query,
            config=types.GenerateContentConfig(
                tools=[
                    types.Tool(
                        google_search=types.GoogleSearch()
                    )
                ]
            )
        )
        
        answer = response.text or ""
        yield {
            "type": "final",
            "answer": answer
        }

    except Exception as e:
        yield {
            "type": "error",
            "message": f"Gemini API error: {str(e)}"
        }
