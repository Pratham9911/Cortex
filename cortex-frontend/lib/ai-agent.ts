export async function sendToAgent(query: string): Promise<string> {
  // Phase 2: replace mock with real RAG call:
  // const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  // const token = localStorage.getItem("access_token")
  // const projectId = localStorage.getItem("selected_project_id")
  // const res = await fetch(
  //   `${apiUrl}/projects/${projectId}/ask?query=${encodeURIComponent(query)}`,
  //   { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  // )
  // const data = await res.json()
  // return data.answer

  await new Promise((resolve) => setTimeout(resolve, 2500 + Math.random() * 500))

  return `Thanks for your question: "${query}"\n\nThis is a sample response. Once RAG is connected, I'll search your project documents and answer using retrieved context.`
}
