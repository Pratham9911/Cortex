export type Message = {
  id: string
  messageId?: number
  role: "user" | "assistant"
  content: string
  sources?: MessageSources | null
  latencyMs?: number
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
  isImageIcon?: boolean
}

export type WebSource = {
  title: string
  url: string
  favicon?: string | null
  snippet?: string | null
}

export type DocumentSource = {
  document_id: number
  document_title?: string | null
  file_name?: string | null
  version_number?: number | null
  page_number?: number | null
  can_download?: boolean
}

export type MessageSources = {
  intent?: string | null
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
