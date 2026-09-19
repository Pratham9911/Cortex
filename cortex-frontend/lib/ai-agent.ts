import type { ChatSession, Message, MessageSources } from "@/components/agent-chat/types"

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

type ApiChat = {
  chat_id: number
  project_id: number
  user_id: number
  title: string | null
  created_at: string
  updated_at: string
}

type ApiMessage = {
  message_id: number
  chat_id: number
  role: "user" | "assistant"
  content: string
  sources?: MessageSources | null
  created_at: string
}

type StreamCallbacks = {
  onEvent?: (event: Record<string, any>) => void
}

function token() {
  return localStorage.getItem("access_token")
}

function authHeaders() {
  const accessToken = token()
  if (!accessToken) {
    throw new Error("Missing access token")
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.detail || response.statusText)
  }
  return data as T
}

function chatGroup(updatedAt?: string): "today" | "yesterday" {
  if (!updatedAt) return "today"

  const updated = new Date(updatedAt)
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startYesterday = new Date(startToday)
  startYesterday.setDate(startYesterday.getDate() - 1)

  if (updated >= startToday) return "today"
  return updated >= startYesterday ? "yesterday" : "yesterday"
}

export function toChatSession(chat: ApiChat, messages: Message[] = []): ChatSession {
  const title = chat.title || "New chat"
  return {
    id: String(chat.chat_id),
    chatId: chat.chat_id,
    title,
    group: chatGroup(chat.updated_at),
    avatarLetter: title.charAt(0).toUpperCase() || "C",
    avatarColor: "bg-sky-500",
    messages,
  }
}

export function toMessage(message: ApiMessage): Message {
  const sources = message.sources ?? null
  const reasoning = sources?.reasoning ? (sources.reasoning as any[]) : undefined
  const srcObj = sources as any
  return {
    id: String(message.message_id),
    messageId: message.message_id,
    role: message.role,
    content: message.content,
    sources: sources,
    mode: sources?.mode as any,
    latencyMs: sources?.latency_ms ?? undefined,
    reasoning: reasoning,
    inputTokens: srcObj?.input_tokens ?? undefined,
    outputTokens: srcObj?.output_tokens ?? undefined,
    totalTokens: srcObj?.total_tokens ?? undefined,
  }
}

export async function listChats(projectId: number): Promise<ChatSession[]> {
  const response = await fetch(`${apiUrl}/projects/${projectId}/chats`, {
    headers: authHeaders(),
    cache: "no-store",
  })
  const chats = await parseJsonResponse<ApiChat[]>(response)
  return chats.map((chat) => toChatSession(chat))
}

export async function createChat(projectId: number): Promise<ChatSession> {
  const response = await fetch(`${apiUrl}/projects/${projectId}/chats`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: null }),
  })
  const data = await parseJsonResponse<{ chat: ApiChat }>(response)
  return toChatSession(data.chat)
}

export async function deleteChat(chatId: number): Promise<void> {
  const response = await fetch(`${apiUrl}/chats/${chatId}`, {
    method: "DELETE",
    headers: authHeaders(),
  })
  await parseJsonResponse(response)
}

export async function updateChatTitle(
  chatId: number,
  title: string
): Promise<ChatSession> {
  const response = await fetch(`${apiUrl}/chats/${chatId}`, {
    method: "PATCH",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  })
  const data = await parseJsonResponse<{ chat: ApiChat }>(response)
  return toChatSession(data.chat)
}

export async function listMessages(chatId: number): Promise<Message[]> {
  const response = await fetch(`${apiUrl}/chats/${chatId}/messages`, {
    headers: authHeaders(),
    cache: "no-store",
  })
  const messages = await parseJsonResponse<ApiMessage[]>(response)
  return messages.map((message) => toMessage(message))
}

export type ProjectDocumentItem = {
  document_id: number
  title: string
  description?: string
  file_name: string
  file_size?: number
  active_version?: number
  folder_id?: number | null
  folder_name?: string | null
  allowed_team_ids?: number[]
  allowed_team_names?: string[]
  download_access_level?: string
  search_access_level?: string
  status?: string
}

export async function listProjectDocuments(projectId: number): Promise<ProjectDocumentItem[]> {
  const response = await fetch(`${apiUrl}/projects/${projectId}/documents`, {
    headers: authHeaders(),
    cache: "no-store",
  })
  return parseJsonResponse<ProjectDocumentItem[]>(response)
}

export async function downloadDocument(documentId: number): Promise<void> {
  const response = await fetch(`${apiUrl}/documents/${documentId}/download`, {
    headers: authHeaders(),
    cache: "no-store",
  })
  const data = await parseJsonResponse<{ download_url: string }>(response)
  window.open(data.download_url, "_blank", "noopener,noreferrer")
}

export async function stopChatExecution(
  chatId: number,
  content: string = "⚠️ *Execution stopped by user.*",
  sources: any = null
): Promise<void> {
  await fetch(`${apiUrl}/chats/${chatId}/messages`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: "assistant",
      content,
      sources,
    }),
  })
}

export async function streamChatAsk(
  chatId: number,
  query: string,
  options: { isAgent?: boolean; documentIds?: number[]; signal?: AbortSignal } & StreamCallbacks = {}
): Promise<void> {
  const { isAgent = false, documentIds, signal, onEvent } = options
  const response = await fetch(`${apiUrl}/chats/${chatId}/ask`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      is_agent: isAgent,
      document_ids: documentIds && documentIds.length > 0 ? documentIds : undefined,
    }),
    signal,
  })

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.detail || response.statusText)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split("\n\n")
    buffer = frames.pop() || ""

    for (const frame of frames) {
      const dataLine = frame
        .split("\n")
        .find((line) => line.startsWith("data: "))

      if (!dataLine) continue

      const payload = dataLine.slice("data: ".length)
      if (payload === "complete") continue

      try {
        onEvent?.(JSON.parse(payload))
      } catch {
        // Ignore malformed SSE frames.
      }
    }
  }
}

export async function streamResumeAgent(
  projectId: number,
  threadId: string,
  decision: "yes" | "no" | "tell_agent",
  feedbackText?: string,
  options: { signal?: AbortSignal } & StreamCallbacks = {}
): Promise<void> {
  const { signal, onEvent } = options
  const token = localStorage.getItem("access_token")
  let url = `${apiUrl}/projects/${projectId}/agent/${threadId}/resume?decision=${decision}`
  if (feedbackText?.trim()) {
    url += `&feedback=${encodeURIComponent(feedbackText.trim())}`
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    signal,
  })

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.detail || response.statusText)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split("\n\n")
    buffer = frames.pop() || ""

    for (const frame of frames) {
      const dataLine = frame
        .split("\n")
        .find((line) => line.startsWith("data: "))

      if (!dataLine) continue

      const payload = dataLine.slice("data: ".length)
      if (payload === "complete") continue

      try {
        onEvent?.(JSON.parse(payload))
      } catch {
        // Ignore malformed SSE frames.
      }
    }
  }
}

