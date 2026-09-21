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

export type ChatMessage = {
  id: number
  discussion_id: number
  sender_id: number
  sender_name: string
  sender_avatar_url?: string | null
  content: string
  parent_message_id?: number | null
  parent_message?: ParentMessageRef | null
  is_deleted: boolean
  created_at: string
  updated_at?: string | null
  reactions: ReactionGroup[]
}

export type WsMessage = ChatMessage

export type WsChatEvent = {
  event: "new_message" | "edit_message" | "delete_message" | "reaction_update"
  message: ChatMessage
}
