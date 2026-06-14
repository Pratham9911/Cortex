export type Message = {
  id: string
  role: "user" | "assistant"
  content: string
}

export type ChatGroup = "saved" | "today" | "yesterday"

export type ChatSession = {
  id: string
  title: string
  saved?: boolean
  group: ChatGroup
  avatarLetter: string
  avatarColor: string
  messages: Message[]
  isImageIcon?: boolean
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
