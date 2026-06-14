"use client"

import { useCallback, useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { useAuth } from "@/components/auth/protected-route"
import { sendToAgent } from "@/lib/ai-agent"
import { cn } from "@/lib/utils"
import { AgentChatMain } from "./agent-chat-main"
import { AgentChatSidebar } from "./agent-chat-sidebar"
import { INITIAL_CHATS, PROMPT_POOLS } from "./mock-data"
import type { ChatSession, Message } from "./types"

function titleFromMessage(text: string) {
  const trimmed = text.trim()
  if (trimmed.length <= 48) return trimmed
  return `${trimmed.slice(0, 48)}...`
}

export function AgentChatShell() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [chats, setChats] = useState<ChatSession[]>(INITIAL_CHATS)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [isThinking, setIsThinking] = useState(false)
  const [promptPoolIndex, setPromptPoolIndex] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && theme === "dark"
  const userInitials = user?.name ? user.name.slice(0, 2).toUpperCase() : "U"
  const activeChat = activeChatId ? chats.find((c) => c.id === activeChatId) : null

  const handleNewChat = useCallback(() => {
    setActiveChatId(null)
    setInput("")
  }, [])

  const handleSelectChat = useCallback((id: string) => {
    setActiveChatId(id)
    setInput("")
  }, [])

  const handleSend = useCallback(
    async (text?: string) => {
      const trimmed = (text ?? input).trim()
      if (!trimmed || isThinking) return

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
      }

      setInput("")
      setIsThinking(true)

      if (activeChatId === null) {
        const newId = `chat-${Date.now()}`
        const newChat: ChatSession = {
          id: newId,
          title: titleFromMessage(trimmed),
          group: "today",
          avatarLetter: trimmed.charAt(0).toUpperCase() || "N",
          avatarColor: "bg-sky-500",
          messages: [userMessage],
        }
        setChats((prev) => [newChat, ...prev])
        setActiveChatId(newId)

        try {
          const reply = await sendToAgent(trimmed)
          const assistantMessage: Message = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: reply,
          }
          setChats((prev) =>
            prev.map((c) =>
              c.id === newId ? { ...c, messages: [...c.messages, assistantMessage] } : c
            )
          )
        } finally {
          setIsThinking(false)
        }
        return
      }

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChatId ? { ...c, messages: [...c.messages, userMessage] } : c
        )
      )

      try {
        const reply = await sendToAgent(trimmed)
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: reply,
        }
        setChats((prev) =>
          prev.map((c) =>
            c.id === activeChatId
              ? { ...c, messages: [...c.messages, assistantMessage] }
              : c
          )
        )
      } finally {
        setIsThinking(false)
      }
    },
    [activeChatId, input, isThinking]
  )

  return (
    <div
      className={cn(
        "flex h-[100dvh] w-full overflow-hidden",
        isDark ? "bg-[#0A0A0A]" : "bg-white"
      )}
    >
      <AgentChatSidebar
        chats={chats}
        activeChatId={activeChatId}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        isDark={isDark}
      />

      <AgentChatMain
        messages={activeChat?.messages ?? []}
        prompts={PROMPT_POOLS[promptPoolIndex]}
        input={input}
        onInputChange={setInput}
        onSend={(text) => void handleSend(text)}
        onNewChat={handleNewChat}
        isThinking={isThinking}
        isDark={isDark}
        userInitials={userInitials}
        activeChatTitle={activeChat?.title}
      />
    </div>
  )
}
