"use client"

import { useCallback, useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { useAuth } from "@/components/auth/protected-route"
import {
  createChat,
  deleteChat,
  listChats,
  listMessages,
  streamChatAsk,
  updateChatTitle,
} from "@/lib/ai-agent"
import { cn } from "@/lib/utils"
import { AgentChatMain } from "./agent-chat-main"
import { AgentChatSidebar } from "./agent-chat-sidebar"
import { PROMPT_POOLS } from "./mock-data"
import type { ChatSession, Message, MessageSources, ThinkingEvent } from "./types"

function selectedProjectId() {
  const rawProjectId = localStorage.getItem("selected_project_id")
  return rawProjectId ? Number(rawProjectId) : null
}

function optimisticUserMessage(content: string): Message {
  return {
    id: `user-${Date.now()}`,
    role: "user",
    content,
  }
}

function optimisticAssistantMessage(
  content: string,
  sources: MessageSources | null,
  latencyMs: number
): Message {
  return {
    id: `assistant-${Date.now()}`,
    role: "assistant",
    content,
    sources,
    latencyMs,
  }
}

export function AgentChatShell() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [chats, setChats] = useState<ChatSession[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [isThinking, setIsThinking] = useState(false)
  const [thinkingEvents, setThinkingEvents] = useState<ThinkingEvent[]>([])
  const [promptPoolIndex] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && theme === "dark"
  const userInitials = user?.name ? user.name.slice(0, 2).toUpperCase() : "U"
  const activeChat = activeChatId ? chats.find((c) => c.id === activeChatId) : null

  const replaceChatMessages = useCallback((chatId: number, messages: Message[]) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.chatId === chatId
          ? {
              ...chat,
              messages,
            }
          : chat
      )
    )
  }, [])

  const refreshChats = useCallback(async () => {
    const projectId = selectedProjectId()
    if (!projectId) return

    const loadedChats = await listChats(projectId)
    setChats((prev) =>
      loadedChats.map((chat) => ({
        ...chat,
        messages: prev.find((item) => item.chatId === chat.chatId)?.messages ?? [],
      }))
    )
  }, [])

  const refreshActiveMessages = useCallback(async () => {
    if (!activeChatId || isThinking) return

    const chat = chats.find((item) => item.id === activeChatId)
    if (!chat) return

    const messages = await listMessages(chat.chatId)
    replaceChatMessages(chat.chatId, messages)
  }, [activeChatId, chats, isThinking, replaceChatMessages])

  useEffect(() => {
    void refreshChats()
  }, [refreshChats])

  useEffect(() => {
    const handleFocus = () => {
      void refreshActiveMessages()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshActiveMessages()
      }
    }

    window.addEventListener("focus", handleFocus)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("focus", handleFocus)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [refreshActiveMessages])

  useEffect(() => {
    if (!activeChatId || isThinking) return

    const interval = window.setInterval(() => {
      void refreshActiveMessages()
    }, 10000)

    return () => window.clearInterval(interval)
  }, [activeChatId, isThinking, refreshActiveMessages])

  const handleNewChat = useCallback(() => {
    setActiveChatId(null)
    setInput("")
    setThinkingEvents([])
  }, [])

  const handleSelectChat = useCallback(
    (id: string) => {
      const chat = chats.find((item) => item.id === id)
      if (!chat) return

      setActiveChatId(id)
      setInput("")
      setThinkingEvents([])

      void listMessages(chat.chatId).then((messages) => {
        replaceChatMessages(chat.chatId, messages)
      })
    },
    [chats, replaceChatMessages]
  )

  const handleRenameChat = useCallback(
    async (chatId: number, title: string) => {
      const updatedChat = await updateChatTitle(chatId, title)

      setChats((prev) =>
        prev.map((chat) =>
          chat.chatId === chatId
            ? {
                ...chat,
                title: updatedChat.title,
                avatarLetter: updatedChat.avatarLetter,
              }
            : chat
        )
      )
    },
    []
  )

  const handleDeleteChat = useCallback(
    async (chatId: number) => {
      await deleteChat(chatId)

      setChats((prev) => prev.filter((chat) => chat.chatId !== chatId))

      const deletedActiveChat = chats.find(
        (chat) => chat.chatId === chatId && chat.id === activeChatId
      )

      if (deletedActiveChat) {
        setActiveChatId(null)
        setInput("")
        setThinkingEvents([])
      }
    },
    [activeChatId, chats]
  )

  const handleSend = useCallback(
    async (text?: string) => {
      const trimmed = (text ?? input).trim()
      if (!trimmed || isThinking) return

      const projectId = selectedProjectId()
      if (!projectId) return

      setInput("")
      setIsThinking(true)
      setThinkingEvents([])

      let targetChat = activeChat
      if (!targetChat) {
        targetChat = await createChat(projectId)
        setChats((prev) => [targetChat!, ...prev])
        setActiveChatId(targetChat.id)
      }

      const userMessage = optimisticUserMessage(trimmed)
      replaceChatMessages(targetChat.chatId, [
        ...(targetChat.messages ?? []),
        userMessage,
      ])

      const startedAt = performance.now()
      let finalAnswer = ""

      try {
        await streamChatAsk(targetChat.chatId, trimmed, {
          onEvent: (event) => {
            if (event.type === "status" && event.message) {
              setThinkingEvents((prev) => [
                ...prev,
                {
                  id: `${Date.now()}-${prev.length}`,
                  step: event.step,
                  message: String(event.message),
                },
              ])
            }

            if (event.type === "sources" && Array.isArray(event.sources)) {
              const count = event.sources.length
              if (count > 0) {
                setThinkingEvents((prev) => [
                  ...prev,
                  {
                    id: `${Date.now()}-${prev.length}`,
                    step: event.step,
                    message: `Found ${count} web source${count === 1 ? "" : "s"}.`,
                  },
                ])
              }
            }

            if (event.type !== "final") return

            finalAnswer = event.answer || ""

            const latencyMs = performance.now() - startedAt
            
            // Map the flat sources array from the event into the MessageSources shape expected by the UI
            const sourcesData = Array.isArray(event.sources) && event.sources.length > 0 
              ? { web: event.sources } 
              : null;

            const assistantMessage = optimisticAssistantMessage(
              finalAnswer,
              sourcesData,
              latencyMs
            )

            replaceChatMessages(targetChat!.chatId, [
              ...(targetChat!.messages ?? []),
              userMessage,
              assistantMessage,
            ])
          },
        })

        const persistedMessages = await listMessages(targetChat.chatId)
        if (persistedMessages.length > 0) {
          const latencyMs = performance.now() - startedAt
          const lastIndex = persistedMessages.length - 1
          persistedMessages[lastIndex] = {
            ...persistedMessages[lastIndex],
            latencyMs:
              persistedMessages[lastIndex].role === "assistant"
                ? latencyMs
                : undefined,
          }
          replaceChatMessages(targetChat.chatId, persistedMessages)
        }

        await refreshChats()
      } catch (error) {
        const fallbackMessage = optimisticAssistantMessage(
          error instanceof Error ? error.message : "Unable to generate an answer.",
          null,
          performance.now() - startedAt
        )

        replaceChatMessages(targetChat.chatId, [
          ...(targetChat.messages ?? []),
          userMessage,
          fallbackMessage,
        ])
      } finally {
        setIsThinking(false)
        setThinkingEvents([])
      }
    },
    [activeChat, input, isThinking, refreshChats, replaceChatMessages]
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
        onRenameChat={handleRenameChat}
        onDeleteChat={handleDeleteChat}
        isDark={isDark}
      />

      <AgentChatMain
        messages={activeChat?.messages ?? []}
        prompts={PROMPT_POOLS[promptPoolIndex]}
        thinkingEvents={thinkingEvents}
        input={input}
        onInputChange={setInput}
        onSend={(text) => void handleSend(text)}
        onNewChat={handleNewChat}
        isThinking={isThinking}
        isDark={isDark}
        userInitials={userInitials}
        activeChatTitle={activeChat?.title}
        onSourceAccessChanged={() => void refreshActiveMessages()}
      />
    </div>
  )
}
