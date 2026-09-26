export type DiscussionItem = {
  id: number
  team_id: number
  name: string
  description: string | null
  is_pinned: boolean
  created_by: number
  created_at: string | null
  updated_at: string | null
  created_by_name?: string
  created_by_email?: string
  created_by_avatar?: string
}

export type ReactionGroup = {
  emoji: string
  count: number
  user_reacted: boolean
}

export type ParentMessageRef = {
  id: number
  sender_name: string
  content: string
  is_deleted: boolean
}

export type AiWebSource = {
  url: string
  title: string
  favicon?: string | null
  score?: number | null
}

export type AiDocSource = {
  document_id: number
  document_title?: string | null
  file_name?: string | null
  version_number?: number | null
  page_number?: number | null
  page_numbers?: number[]
  can_download?: boolean
}

export type AiSources = {
  web?: AiWebSource[]
  documents?: AiDocSource[]
  decision_proposal?: any
}

export type ChatMessage = {
  id: number
  discussion_id: number
  sender_id: number | null
  sender_name: string
  sender_avatar_url?: string | null
  content: string
  parent_message_id?: number | null
  parent_message?: ParentMessageRef | null
  is_deleted: boolean
  is_ai_message?: boolean
  ai_sources?: AiSources | null
  ai_chunks?: any[] | null
  created_at: string
  updated_at?: string | null
  reactions: ReactionGroup[]
}

export type WsMessage = ChatMessage

export type WsChatEvent =
  | {
      event: "new_message" | "edit_message" | "delete_message" | "reaction_update" | "proposal_updated"
      message: ChatMessage
    }
  | {
      event: "cortex_thinking"
      status?: string | null
      agent_name?: string | null
      message?: ChatMessage
    }
