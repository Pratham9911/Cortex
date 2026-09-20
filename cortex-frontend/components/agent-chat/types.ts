export type ActivityItem = {
  id: string
  agent: string
  kind: "thought" | "tool" | "status"
  label?: string
  content: string
}

export type HITLPermissionState = {
  thread_id: string
  agent: string
  action: string
  tool?: string
  args?: any
  risk?: string
  description?: string
  preview_title?: string
  preview?: string
  from?: string
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  body?: string
  message_id?: string
  draft?: { to?: string; subject?: string; body?: string }
}

export type Message = {
  id: string
  messageId?: number
  role: "user" | "assistant"
  content: string
  sources?: MessageSources | null
  latencyMs?: number
  mode?: "normal" | "agent"
  reasoning?: ActivityItem[]
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export type ChatGroup = "saved" | "today" | "yesterday"

export type ChatSession = {
  id: string
  chatId: number
  title: string
  saved?: boolean
  group: ChatGroup
  avatarLetter: string
  avatarColor: string
  messages: Message[]
  hasMoreMessages?: boolean
  isImageIcon?: boolean
}

export type WebSource = {
  title: string
  url: string
  favicon?: string | null
  snippet?: string | null
  score?: number | null
}

export type DocumentSource = {
  document_id: number
  document_title?: string | null
  file_name?: string | null
  version_number?: number | null
  /** @deprecated legacy per-page rows — prefer page_numbers */
  page_number?: number | null
  page_numbers?: number[]
  can_download?: boolean
}

export type MessageSources = {
  intent?: string | null
  mode?: "normal" | "agent"
  latency_ms?: number | null
  reasoning?: ActivityItem[] | null
  input_tokens?: number | null
  output_tokens?: number | null
  total_tokens?: number | null
  web?: WebSource[]
  documents?: DocumentSource[]
}

export type ThinkingEvent = {
  id: string
  message: string
  step?: string
}

export type PromptCard = {
  id: string
  text: string
  icon: "user" | "mail" | "message" | "sliders"
}

export const THINKING_STEPS = [
  "Searching project documents...",
  "Reading retrieved context...",
  "Generating answer...",
] as const

