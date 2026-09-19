"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { useAuth } from "@/components/auth/protected-route"
import {
  createChat,
  deleteChat,
  listChats,
  listMessages,
  stopChatExecution,
  streamChatAsk,
  streamResumeAgent,
  updateChatTitle,
} from "@/lib/ai-agent"
import { cn } from "@/lib/utils"
import { AgentChatMain } from "./agent-chat-main"
import { AgentChatSidebar } from "./agent-chat-sidebar"
import { PROMPT_POOLS } from "./mock-data"
import type { ActivityItem, ChatSession, HITLPermissionState, Message, MessageSources, ThinkingEvent } from "./types"

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
  const [isChatsLoading, setIsChatsLoading] = useState(true)
  const [loadingChatId, setLoadingChatId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [isThinking, setIsThinking] = useState(false)
  const [thinkingEvents, setThinkingEvents] = useState<ThinkingEvent[]>([])
  const [promptPoolIndex] = useState(0)

  // Agent Mode States
  const [isAgentMode, setIsAgentMode] = useState(false)
  const [agentActivities, setAgentActivities] = useState<ActivityItem[]>([])
  // Ref to always have latest agentActivities in event callbacks (avoids stale closure)
  const agentActivitiesRef = useRef<ActivityItem[]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [startedAt, setStartedAt] = useState<number>(Date.now())
  const [hitlPermission, setHitlPermission] = useState<HITLPermissionState | null>(null)
  // When user stops execution, suppress message polling for a few seconds so
  // the DB save can complete before we re-fetch (avoids overwriting local cancelled msg)
  const suppressRefreshUntilRef = useRef<number>(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isThinking) return
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isThinking, startedAt])

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
    if (!projectId) {
      setIsChatsLoading(false)
      return
    }

    try {
      const loadedChats = await listChats(projectId)
      setChats((prev) =>
        loadedChats.map((chat) => ({
          ...chat,
          messages: prev.find((item) => item.chatId === chat.chatId)?.messages ?? [],
        }))
      )
    } finally {
      setIsChatsLoading(false)
    }
  }, [])

  const refreshActiveMessages = useCallback(async () => {
    if (!activeChatId || isThinking) return
    // Suppress polling briefly after stop so DB save can complete
    if (Date.now() < suppressRefreshUntilRef.current) return

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

  useEffect(() => {
    setAgentActivities([])
    agentActivitiesRef.current = []
    setThinkingEvents([])
  }, [activeChatId])

  const handleNewChat = useCallback(() => {
    setActiveChatId(null)
    setInput("")
    setThinkingEvents([])
    setAgentActivities([])
    setHitlPermission(null)
  }, [])

  const handleSelectChat = useCallback(
    (id: string) => {
      const chat = chats.find((item) => item.id === id)
      if (!chat) return

      setActiveChatId(id)
      setInput("")
      setThinkingEvents([])
      setAgentActivities([])
      setHitlPermission(null)

      if (!chat.messages || chat.messages.length === 0) {
        setLoadingChatId(id)
      }

      void listMessages(chat.chatId)
        .then((messages) => {
          replaceChatMessages(chat.chatId, messages)
        })
        .finally(() => {
          setLoadingChatId(null)
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
        setAgentActivities([])
        setHitlPermission(null)
      }
    },
    [activeChatId, chats]
  )

  const abortControllerRef = useRef<AbortController | null>(null)

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    if (activeChat) {
      const content = "⚠️ *Execution stopped by user.*"
      const sources = {
        mode: isAgentMode ? "agent" : "normal",
        reasoning: [...agentActivitiesRef.current],
      }
      // Suppress polls for 4s so the DB POST can complete before we re-fetch
      suppressRefreshUntilRef.current = Date.now() + 4000
      void stopChatExecution(activeChat.chatId, content, sources)
    }

    setIsThinking(false)
    setThinkingEvents([])
    setAgentActivities([])
    agentActivitiesRef.current = []
  }, [activeChat, isAgentMode])

  const handleSend = useCallback(
    async (text?: string, forceIsAgent?: boolean) => {
      const trimmed = (text ?? input).trim()
      if (!trimmed || isThinking) return

      const projectId = selectedProjectId()
      if (!projectId) return

      const isAgent = forceIsAgent ?? isAgentMode

      const controller = new AbortController()
      abortControllerRef.current = controller

      setInput("")
      setIsThinking(true)
      setThinkingEvents([])
      agentActivitiesRef.current = []
      setAgentActivities([])
      setHitlPermission(null)
      setStartedAt(Date.now())
      setElapsedSeconds(1)

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

      const startTime = performance.now()
      let finalAnswer = ""
      let lastStreamedMessage: any = null

      try {
        await streamChatAsk(targetChat.chatId, trimmed, {
          isAgent,
          signal: controller.signal,
          onEvent: (event) => {
            const agentName = event.agent || "main"

            if (event.type === "status" && event.message) {
              setThinkingEvents((prev) => [
                ...prev,
                {
                  id: `${Date.now()}-${prev.length}`,
                  step: event.step,
                  message: event.message,
                },
              ])
            }

            if (event.type === "activity" && event.content) {
              const newItem: ActivityItem = {
                id: `act-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                agent: agentName,
                kind: event.kind || "thought",
                label: event.label,
                content: event.content,
              }
              agentActivitiesRef.current = [...agentActivitiesRef.current, newItem]
              setAgentActivities([...agentActivitiesRef.current])
            }

            const AGENT_TOOLS = new Set(["web_agent", "retrieval_agent", "github_agent", "gmail_agent"])
            const getAgentDisplayName = (agent: string) => {
              if (agent === "web_agent") return "Web"
              if (agent === "retrieval_agent") return "Project"
              if (agent === "github_agent") return "GitHub"
              if (agent === "gmail_agent") return "Gmail"
              return "Main"
            }

            const addActivity = (item: Omit<ActivityItem, "id">) => {
              if (!item.content.trim()) return
              const newItem: ActivityItem = { ...item, id: `act-${Date.now()}-${Math.random().toString(36).slice(2)}` }
              agentActivitiesRef.current = [...agentActivitiesRef.current, newItem]
              setAgentActivities([...agentActivitiesRef.current])
            }

            if (event.type === "agent_started") {
              addActivity({
                agent: agentName,
                kind: "status",
                content: agentName === "main" ? "Planning the request..." : `${getAgentDisplayName(agentName)} agent started`,
              })
            } else if (event.type === "reasoning") {
              addActivity({
                agent: agentName,
                kind: "thought",
                content: event.content || "",
              })
            } else if (event.type === "tool_started") {
              const tool = event.tool || "unknown"
              const toolAgent = AGENT_TOOLS.has(tool) ? tool : agentName
              const label = tool === "web_agent" ? "Searching web" : tool === "retrieval_agent" ? "Searching project" : tool === "github_agent" ? "Searching GitHub" : `Using ${tool}`
              addActivity({
                agent: toolAgent,
                kind: "tool",
                label,
                content: AGENT_TOOLS.has(tool) ? label : `${label}${event.args ? ` ${JSON.stringify(event.args)}` : ""}`,
              })
            } else if (event.type === "tool_completed") {
              const tool = event.tool || ""
              if (AGENT_TOOLS.has(tool)) {
                addActivity({
                  agent: tool,
                  kind: "status",
                  content: `${getAgentDisplayName(tool)} search complete`,
                })
              }
            } else if (event.type === "agent_completed" && agentName !== "main") {
              addActivity({
                agent: agentName,
                kind: "status",
                content: `${getAgentDisplayName(agentName)} agent finished`,
              })
            } else if (event.type === "interrupt") {
              setHitlPermission({
                thread_id: event.thread_id,
                agent: event.agent || "main",
                action: event.action || "tool_approval",
                tool: event.tool,
                args: event.args,
                risk: event.risk,
                description: event.description,
                to: event.to,
                subject: event.subject,
                body: event.body,
              })
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

            if ((event.type === "final" || event.type === "agent_completed") && (agentName === "main" || event.type === "final")) {
              finalAnswer = event.answer || ""
              const latencyMs = performance.now() - startTime

              const webSources = Array.isArray(event.sources) ? event.sources : (event.sources?.web || [])
              const docSources = Array.isArray(event.chunks) ? event.chunks : (event.sources?.documents || [])

              const sourcesData: MessageSources = {
                web: webSources,
                documents: docSources,
                mode: isAgent ? "agent" : "normal",
                latency_ms: Math.round(latencyMs),
                reasoning: [...agentActivitiesRef.current],
                input_tokens: event.input_tokens,
                output_tokens: event.output_tokens,
                total_tokens: event.total_tokens,
              }

              const assistantMessage = optimisticAssistantMessage(
                finalAnswer || "Task complete.",
                sourcesData,
                Math.round(latencyMs)
              )
              if (isAgent) {
                assistantMessage.mode = "agent"
                assistantMessage.reasoning = [...agentActivitiesRef.current]
              }
              if (event.input_tokens != null) assistantMessage.inputTokens = Number(event.input_tokens)
              if (event.output_tokens != null) assistantMessage.outputTokens = Number(event.output_tokens)
              if (event.total_tokens != null) assistantMessage.totalTokens = Number(event.total_tokens)

              replaceChatMessages(targetChat!.chatId, [
                ...(targetChat!.messages ?? []),
                userMessage,
                assistantMessage,
              ])
              setIsThinking(false)
              setThinkingEvents([])
              setAgentActivities([])
              agentActivitiesRef.current = []
            }
          },
        })

        await refreshChats()

      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          const cancelledMessage = optimisticAssistantMessage(
            "⚠️ *Execution stopped by user.*",
            {
              mode: isAgent ? "agent" : "normal",
              latency_ms: Math.round(performance.now() - startTime),
              reasoning: [...agentActivitiesRef.current],
            },
            Math.round(performance.now() - startTime)
          )
          if (isAgent) {
            cancelledMessage.mode = "agent"
            cancelledMessage.reasoning = [...agentActivitiesRef.current]
          }

          replaceChatMessages(targetChat.chatId, [
            ...(targetChat.messages ?? []),
            userMessage,
            cancelledMessage,
          ])
          return
        }

        const fallbackMessage = optimisticAssistantMessage(
          error instanceof Error ? error.message : "Unable to generate an answer.",
          null,
          performance.now() - startTime
        )

        replaceChatMessages(targetChat.chatId, [
          ...(targetChat.messages ?? []),
          userMessage,
          fallbackMessage,
        ])
      } finally {
        setIsThinking(false)
        setThinkingEvents([])
        setAgentActivities([])
        agentActivitiesRef.current = []
      }
    },
    [activeChat, input, isAgentMode, isThinking, refreshChats, replaceChatMessages]
  )

  const handleHITLResponse = useCallback(
    async (decision: "yes" | "no" | "tell_agent", feedbackText?: string) => {
      if (!hitlPermission || !activeChat) return
      const projectId = selectedProjectId()
      if (!projectId) return

      const controller = new AbortController()
      abortControllerRef.current = controller

      const perm = hitlPermission
      const targetChat = activeChat
      setHitlPermission(null)
      setIsThinking(true)
      const startTime = performance.now()
      let hitlAssistantMsg: Message | null = null

      const resumeLabel = decision === "yes" ? "Approval granted" : decision === "no" ? "Action rejected" : "User instruction sent"
      const newItem: ActivityItem = {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        agent: "main",
        kind: "status",
        content: `Resuming after ${resumeLabel}${feedbackText?.trim() ? `: "${feedbackText.trim()}"` : ""}`,
      }
      agentActivitiesRef.current = [...agentActivitiesRef.current, newItem]
      setAgentActivities([...agentActivitiesRef.current])

      try {
        let finalAnswer = ""
        await streamResumeAgent(projectId, perm.thread_id, decision, feedbackText, {
          signal: controller.signal,
          onEvent: (event) => {
            const agentName = event.agent || "main"

            const AGENT_TOOLS = new Set(["web_agent", "retrieval_agent", "github_agent", "gmail_agent"])
            const getAgentDisplayName = (agent: string) => {
              if (agent === "web_agent") return "Web"
              if (agent === "retrieval_agent") return "Project"
              if (agent === "github_agent") return "GitHub"
              if (agent === "gmail_agent") return "Gmail"
              return "Main"
            }

            const addActivity = (item: Omit<ActivityItem, "id">) => {
              if (!item.content.trim()) return
              const act: ActivityItem = { ...item, id: `act-${Date.now()}-${Math.random().toString(36).slice(2)}` }
              agentActivitiesRef.current = [...agentActivitiesRef.current, act]
              setAgentActivities([...agentActivitiesRef.current])
            }

            if (event.type === "agent_started") {
              addActivity({
                agent: agentName,
                kind: "status",
                content: agentName === "main" ? "Planning..." : `${getAgentDisplayName(agentName)} agent started`,
              })
            } else if (event.type === "reasoning") {
              addActivity({
                agent: agentName,
                kind: "thought",
                content: event.content || "",
              })
            } else if (event.type === "tool_started") {
              const tool = event.tool || "unknown"
              const toolAgent = AGENT_TOOLS.has(tool) ? tool : agentName
              const label = tool === "web_agent" ? "Searching web" : tool === "retrieval_agent" ? "Searching project" : tool === "github_agent" ? "Searching GitHub" : `Using ${tool}`
              addActivity({
                agent: toolAgent,
                kind: "tool",
                label,
                content: AGENT_TOOLS.has(tool) ? label : `${label}${event.args ? ` ${JSON.stringify(event.args)}` : ""}`,
              })
            } else if (event.type === "tool_completed") {
              const tool = event.tool || ""
              if (AGENT_TOOLS.has(tool)) {
                addActivity({
                  agent: tool,
                  kind: "status",
                  content: `${getAgentDisplayName(tool)} search complete`,
                })
              }
            } else if (event.type === "agent_completed" && agentName !== "main") {
              addActivity({
                agent: agentName,
                kind: "status",
                content: `${getAgentDisplayName(agentName)} agent finished`,
              })
            } else if (event.type === "interrupt") {
              setHitlPermission({
                thread_id: event.thread_id || perm.thread_id,
                agent: event.agent || "main",
                action: event.action || "tool_approval",
                tool: event.tool,
                args: event.args,
                risk: event.risk,
                description: event.description,
                to: event.to,
                subject: event.subject,
                body: event.body,
              })
            }

            if ((event.type === "final" || event.type === "agent_completed") && (agentName === "main" || event.type === "final")) {
              finalAnswer = event.answer || ""
              const latencyMs = performance.now() - startTime

              const webSources = Array.isArray(event.sources) ? event.sources : (event.sources?.web || [])
              const docSources = Array.isArray(event.chunks) ? event.chunks : (event.sources?.documents || [])

              const sourcesData: MessageSources = {
                web: webSources,
                documents: docSources,
                mode: "agent",
                latency_ms: Math.round(latencyMs),
                reasoning: [...agentActivitiesRef.current],
                input_tokens: event.input_tokens,
                output_tokens: event.output_tokens,
                total_tokens: event.total_tokens,
              }

              const assistantMessage = optimisticAssistantMessage(
                finalAnswer || "Task complete.",
                sourcesData,
                Math.round(latencyMs)
              )
              assistantMessage.mode = "agent"
              assistantMessage.reasoning = [...agentActivitiesRef.current]

              if (event.input_tokens != null) assistantMessage.inputTokens = Number(event.input_tokens)
              if (event.output_tokens != null) assistantMessage.outputTokens = Number(event.output_tokens)
              if (event.total_tokens != null) assistantMessage.totalTokens = Number(event.total_tokens)

              replaceChatMessages(targetChat.chatId, [
                ...(targetChat.messages ?? []),
                assistantMessage,
              ])
              setIsThinking(false)
              setThinkingEvents([])
              setAgentActivities([])
              agentActivitiesRef.current = []
            }
          },
        })

        await refreshChats()

      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          const cancelledMessage = optimisticAssistantMessage(
            "⚠️ *Execution stopped by user.*",
            {
              mode: "agent",
              latency_ms: Math.round(performance.now() - startTime),
              reasoning: [...agentActivitiesRef.current],
            },
            Math.round(performance.now() - startTime)
          )
          cancelledMessage.mode = "agent"
          cancelledMessage.reasoning = [...agentActivitiesRef.current]

          replaceChatMessages(targetChat.chatId, [
            ...(targetChat.messages ?? []),
            cancelledMessage,
          ])
          return
        }
        console.error("HITL resume error", e)
      } finally {
        setIsThinking(false)
        setThinkingEvents([])
        setAgentActivities([])
        agentActivitiesRef.current = []
      }
    },
    [activeChat, hitlPermission, refreshChats, replaceChatMessages]
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
        isChatsLoading={isChatsLoading}
      />

      <AgentChatMain
        messages={activeChat?.messages ?? []}
        prompts={PROMPT_POOLS[promptPoolIndex]}
        thinkingEvents={thinkingEvents}
        input={input}
        onInputChange={setInput}
        onSend={(text, forceIsAgent) => void handleSend(text, forceIsAgent)}
        onNewChat={handleNewChat}
        isThinking={isThinking}
        isDark={isDark}
        userInitials={userInitials}
        activeChatTitle={activeChat?.title}
        activeChatId={activeChatId}
        onSourceAccessChanged={() => void refreshActiveMessages()}
        isAgentMode={isAgentMode}
        setIsAgentMode={setIsAgentMode}
        agentActivities={agentActivities}
        elapsedSeconds={elapsedSeconds}
        hitlPermission={hitlPermission}
        onHITLResponse={(decision, feedback) => void handleHITLResponse(decision, feedback)}
        isMessagesLoading={Boolean(activeChatId && loadingChatId === activeChatId)}
        onStop={handleStop}
      />
    </div>
  )
}

