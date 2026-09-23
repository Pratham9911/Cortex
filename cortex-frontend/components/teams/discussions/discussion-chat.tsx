"use client"

import { useEffect, useRef, useState } from "react"
import {
  CheckCircle2,
  Hash,
  Info,
  Link2,
  Loader2,
  Pin,
  Radio,
  Send,
  Smile,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth/protected-route"
import { ChatSkeletons } from "./chat-skeletons"
import { EditMessageDialog } from "./edit-message-dialog"
import { MessageContextMenu } from "./message-context-menu"
import { MessageItem } from "./message-item"
import { ReactionDetailsDialog } from "./reaction-details-dialog"
import { ReplyPreviewBar } from "./reply-preview-bar"
import type { ChatMessage, DiscussionItem, WsChatEvent } from "./types"
import { cn } from "@/lib/utils"

export function DiscussionChat({
  isDark,
  teamId,
  userRole = "member",
  currentUserId: propCurrentUserId,
  activeDiscussion,
  showDetailsPanel,
  onToggleDetailsPanel,
}: {
  isDark: boolean
  teamId?: string | number
  userRole?: "admin" | "member"
  currentUserId?: number
  activeDiscussion: DiscussionItem | null
  showDetailsPanel: boolean
  onToggleDetailsPanel: () => void
}) {
  const { user } = useAuth()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const isAdmin = userRole === "admin"

  const getAuthToken = () => {
    if (typeof window === "undefined") return null
    return localStorage.getItem("access_token") || localStorage.getItem("token")
  }

  const getProjectId = () => {
    if (typeof window === "undefined") return "1"
    return localStorage.getItem("selected_project_id") || "1"
  }

  const currentUserId = propCurrentUserId || user?.user_id || 1

  // Top-level pagination constant (set to 10 for testing, easily changed to 50 later)
  const MESSAGES_PAGE_SIZE = 10

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting")
  const [inputContent, setInputContent] = useState("")

  // Reply / Edit / Context Menu / Reaction Details States
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null)
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  const [reactionDetailsMsg, setReactionDetailsMsg] = useState<ChatMessage | null>(null)
  const [isReactionDetailsOpen, setIsReactionDetailsOpen] = useState(false)
  const [highlightedMsgId, setHighlightedMsgId] = useState<number | null>(null)

  const handleJumpToMessage = async (targetId: number) => {
    // 1. If element is already in current DOM
    const existingEl = document.getElementById(`msg-${targetId}`)
    if (existingEl) {
      existingEl.scrollIntoView({ behavior: "smooth", block: "center" })
      setHighlightedMsgId(targetId)
      setTimeout(() => {
        setHighlightedMsgId(null)
      }, 500)
      return
    }

    // 2. Element is not in current DOM (fetch all continuous messages between targetId and current oldest message)
    if (!activeDiscussion || !teamId || messages.length === 0) return
    const token = getAuthToken()
    const projectId = getProjectId()
    if (!token) return

    const oldestId = messages[0].id

    try {
      setLoadingMore(true)
      isPrependingRef.current = true

      const res = await fetch(
        `${apiUrl}/projects/${projectId}/teams/${teamId}/discussions/${activeDiscussion.id}/messages?target_id=${targetId}&before_id=${oldestId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (res.ok) {
        const data = await res.json()
        const rangeMsgs: ChatMessage[] = data.messages || []
        if (rangeMsgs.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id))
            const filteredNew = rangeMsgs.filter((m) => !existingIds.has(m.id))
            return [...filteredNew, ...prev].sort((a, b) => a.id - b.id)
          })

          requestAnimationFrame(() => {
            setTimeout(() => {
              const newEl = document.getElementById(`msg-${targetId}`)
              if (newEl) {
                newEl.scrollIntoView({ behavior: "smooth", block: "center" })
                setHighlightedMsgId(targetId)
                setTimeout(() => {
                  setHighlightedMsgId(null)
                }, 500)
              }
              isPrependingRef.current = false
            }, 60)
          })
        } else {
          isPrependingRef.current = false
        }
      } else {
        isPrependingRef.current = false
      }
    } catch (err) {
      console.error("Failed to jump to target message:", err)
      isPrependingRef.current = false
    } finally {
      setLoadingMore(false)
    }
  }

  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number }
    message: ChatMessage
  } | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Fetch REST messages for active discussion
  const fetchMessages = async () => {
    if (!activeDiscussion || !teamId) return
    const token = getAuthToken()
    const projectId = getProjectId()
    if (!token) return

    try {
      setLoadingMessages(true)
      const res = await fetch(
        `${apiUrl}/projects/${projectId}/teams/${teamId}/discussions/${activeDiscussion.id}/messages?limit=${MESSAGES_PAGE_SIZE}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (res.ok) {
        const data = await res.json()
        const fetchedMsgs: ChatMessage[] = data.messages || []
        setMessages(fetchedMsgs)
        setHasMore(data.has_more ?? (fetchedMsgs.length === MESSAGES_PAGE_SIZE))
      } else {
        setMessages([])
        setHasMore(false)
      }
    } catch (err) {
      console.error("Failed to load messages:", err)
    } finally {
      setLoadingMessages(false)
    }
  }

  // Load older messages when scrolling to top (lazy loading)
  const isPrependingRef = useRef(false)

  const loadMoreMessages = async () => {
    if (!activeDiscussion || !teamId || !hasMore || loadingMore || loadingMessages || messages.length === 0) return
    const token = getAuthToken()
    const projectId = getProjectId()
    if (!token) return

    const oldestId = messages[0].id
    const container = containerRef.current
    if (!container) return

    try {
      setLoadingMore(true)
      isPrependingRef.current = true
      const previousScrollHeight = container.scrollHeight

      const res = await fetch(
        `${apiUrl}/projects/${projectId}/teams/${teamId}/discussions/${activeDiscussion.id}/messages?limit=${MESSAGES_PAGE_SIZE}&before_id=${oldestId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (res.ok) {
        const data = await res.json()
        const olderMsgs: ChatMessage[] = data.messages || []
        if (olderMsgs.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id))
            const filteredOlder = olderMsgs.filter((m) => !existingIds.has(m.id))
            return [...filteredOlder, ...prev]
          })
          setHasMore(data.has_more ?? (olderMsgs.length === MESSAGES_PAGE_SIZE))

          requestAnimationFrame(() => {
            if (containerRef.current) {
              const newScrollHeight = containerRef.current.scrollHeight
              containerRef.current.scrollTop = newScrollHeight - previousScrollHeight
            }
            setTimeout(() => {
              isPrependingRef.current = false
            }, 100)
          })
        } else {
          setHasMore(false)
          isPrependingRef.current = false
        }
      } else {
        isPrependingRef.current = false
      }
    } catch (err) {
      console.error("Failed to load older messages:", err)
      isPrependingRef.current = false
    } finally {
      setLoadingMore(false)
    }
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    if (container.scrollTop < 60 && hasMore && !loadingMore && !loadingMessages) {
      loadMoreMessages()
    }
  }

  useEffect(() => {
    if (activeDiscussion) {
      setReplyingTo(null)
      fetchMessages()
    } else {
      setMessages([])
    }
  }, [activeDiscussion?.id, teamId])

  // WebSocket Connection Lifecycle
  useEffect(() => {
    if (!activeDiscussion) return

    const token = getAuthToken()
    if (!token) return

    const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const wsUrl =
      rawApiUrl.replace(/^http/, "ws") +
      `/ws/discussions/${activeDiscussion.id}?token=${encodeURIComponent(token)}`

    setSocketStatus("connecting")
    const socket = new WebSocket(wsUrl)
    socketRef.current = socket

    socket.onopen = () => setSocketStatus("connected")

    socket.onmessage = (event) => {
      try {
        const payload: WsChatEvent = JSON.parse(event.data)
        if (payload && payload.event && payload.message) {
          const incoming = payload.message
          if (incoming.discussion_id !== activeDiscussion.id) return

          setMessages((prev) => {
            if (payload.event === "new_message") {
              if (prev.some((m) => m.id === incoming.id)) return prev
              return [...prev, incoming]
            }
            if (payload.event === "edit_message" || payload.event === "delete_message" || payload.event === "reaction_update") {
              return prev.map((m) => (m.id === incoming.id ? incoming : m))
            }
            return prev
          })
        }
      } catch (err) {
        console.error("WS Parse error:", err)
      }
    }

    socket.onerror = () => setSocketStatus("error")
    socket.onclose = () => setSocketStatus("disconnected")

    return () => {
      socket.close()
    }
  }, [activeDiscussion?.id])

  const isInitialLoadRef = useRef(true)

  useEffect(() => {
    isInitialLoadRef.current = true
  }, [activeDiscussion?.id])

  // Smart Auto-Scroll: Instantly jump to bottom on initial load, smooth scroll on new messages
  useEffect(() => {
    if (!containerRef.current || messages.length === 0) return
    const container = containerRef.current

    // Do NOT scroll to bottom if we are prepending older messages
    if (isPrependingRef.current) return

    if (isInitialLoadRef.current) {
      container.scrollTop = container.scrollHeight
      isInitialLoadRef.current = false
      return
    }

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 140
    const lastMsg = messages[messages.length - 1]
    const isSelfLast = lastMsg && lastMsg.sender_id === currentUserId

    if (isNearBottom || isSelfLast) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [inputContent])

  // Handlers
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputContent.trim() || !activeDiscussion || !teamId) return

    const content = inputContent.trim()
    const parentId = replyingTo?.id || null
    setInputContent("")
    setReplyingTo(null)

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }

    // Try WS send first if open
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          action: "send_message",
          content,
          parent_message_id: parentId,
        })
      )
      return
    }

    // Fallback to REST POST
    const token = getAuthToken()
    const projectId = getProjectId()
    if (!token) return

    try {
      const res = await fetch(
        `${apiUrl}/projects/${projectId}/teams/${teamId}/discussions/${activeDiscussion.id}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content,
            parent_message_id: parentId,
          }),
        }
      )

      if (res.ok) {
        const data = await res.json()
        if (data.data) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.data.id)) return prev
            return [...prev, data.data]
          })
        }
      }
    } catch (err) {
      console.error("Failed to send message via REST:", err)
    }
  }

  // Handle Multi-line Textarea KeyDown (Shift+Enter for newline, Enter to send)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(e)
    }
  }

  const handleEditSave = async (messageId: number, newContent: string) => {
    if (!activeDiscussion || !teamId) return
    const token = getAuthToken()
    const projectId = getProjectId()
    if (!token) return

    setSavingEdit(true)
    try {
      const res = await fetch(
        `${apiUrl}/projects/${projectId}/teams/${teamId}/discussions/${activeDiscussion.id}/messages/${messageId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: newContent }),
        }
      )

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || "Failed to update message")
      }
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeleteMessage = async (msg: ChatMessage) => {
    if (!activeDiscussion || !teamId) return
    const token = getAuthToken()
    const projectId = getProjectId()
    if (!token) return

    try {
      await fetch(
        `${apiUrl}/projects/${projectId}/teams/${teamId}/discussions/${activeDiscussion.id}/messages/${msg.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      )
    } catch (err) {
      console.error("Failed to delete message:", err)
    }
  }

  const handleToggleReaction = async (msg: ChatMessage, emoji: string) => {
    if (!activeDiscussion || !teamId) return
    const token = getAuthToken()
    const projectId = getProjectId()
    if (!token) return

    try {
      await fetch(
        `${apiUrl}/projects/${projectId}/teams/${teamId}/discussions/${activeDiscussion.id}/messages/${msg.id}/reactions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ emoji }),
        }
      )
    } catch (err) {
      console.error("Failed to toggle reaction:", err)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, msg: ChatMessage) => {
    e.preventDefault()
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      message: msg,
    })
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Discussion Header */}
      <header
        onClick={onToggleDetailsPanel}
        className={cn(
          "flex h-[54px] shrink-0 cursor-pointer select-none items-center justify-between border-b px-5 transition-colors",
          isDark
            ? "border-zinc-800 bg-[#101315] hover:bg-[#161a1d]"
            : "border-slate-200 bg-white hover:bg-slate-50"
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-xl text-lg font-bold border",
              isDark ? "border-zinc-700 bg-zinc-900 text-white" : "border-slate-300 bg-slate-100 text-slate-900"
            )}
          >
            <Hash className="size-4 stroke-[2.5]" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="truncate max-w-[200px] sm:max-w-[320px] text-sm font-semibold">
                {activeDiscussion?.name || "Select a Discussion"}
              </h2>
              {activeDiscussion?.is_pinned && (
                <Pin className="size-3 shrink-0 text-amber-500 fill-amber-500" />
              )}
            </div>
            <p className={cn("truncate text-[11px]", isDark ? "text-zinc-400" : "text-slate-500")}>
              {activeDiscussion?.description || "Click header to view discussion info"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {/* WebSocket Status */}
          <div
            className={cn(
              "hidden sm:flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              socketStatus === "connected" &&
                (isDark
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-emerald-300 bg-emerald-50 text-emerald-700"),
              socketStatus === "connecting" &&
                (isDark
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : "border-amber-300 bg-amber-50 text-amber-700"),
              (socketStatus === "disconnected" || socketStatus === "error") &&
                (isDark
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                  : "border-rose-300 bg-rose-50 text-rose-700")
            )}
          >
            {socketStatus === "connected" && <CheckCircle2 className="size-3.5" />}
            {socketStatus === "connecting" && <Loader2 className="size-3.5 animate-spin" />}
            {(socketStatus === "disconnected" || socketStatus === "error") && <XCircle className="size-3.5" />}
            <span>
              {socketStatus === "connected" && "Connected"}
              {socketStatus === "connecting" && "Connecting..."}
              {socketStatus === "disconnected" && "Disconnected"}
              {socketStatus === "error" && "Error"}
            </span>
          </div>

          <Button
            variant={showDetailsPanel ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={onToggleDetailsPanel}
            title="Discussion Info"
            className={cn("rounded-lg", isDark ? "text-zinc-300 hover:bg-zinc-800" : "text-slate-600 hover:bg-slate-100")}
          >
            <Info className="size-4" />
          </Button>
        </div>
      </header>

      {/* Message List */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{ scrollbarWidth: "thin", scrollbarColor: isDark ? "#4b5563 transparent" : "#cbd5e1 transparent" }}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5"
      >
        {loadingMore && (
          <div className="flex items-center justify-center gap-2 py-2 text-xs opacity-70">
            <Loader2 className="size-3.5 animate-spin" />
            <span>Loading older messages...</span>
          </div>
        )}
        {loadingMessages ? (
          <ChatSkeletons isDark={isDark} />
        ) : !activeDiscussion ? (
          <div className="flex h-full flex-col items-center justify-center text-center py-12">
            <Hash className={cn("size-12 mb-3 opacity-40", isDark ? "text-zinc-500" : "text-slate-400")} />
            <p className={cn("text-sm font-semibold", isDark ? "text-zinc-300" : "text-slate-700")}>
              Select a discussion channel to start messaging
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center">
            <div
              className={cn(
                "mb-3 flex size-12 items-center justify-center rounded-full border",
                isDark ? "border-zinc-800 bg-zinc-900 text-zinc-400" : "border-slate-200 bg-slate-100 text-slate-500"
              )}
            >
              <Hash className="size-6 stroke-[2.5]" />
            </div>
            <p className={cn("text-sm font-semibold", isDark ? "text-zinc-200" : "text-slate-800")}>
              Welcome to #{activeDiscussion.name}!
            </p>
            <p className={cn("mt-1 max-w-sm text-xs", isDark ? "text-zinc-400" : "text-slate-500")}>
              This is the start of the #{activeDiscussion.name} discussion channel. Send a message to start the conversation.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageItem
              key={msg.id}
              isDark={isDark}
              message={msg}
              currentUserId={currentUserId}
              isHighlighted={highlightedMsgId === msg.id}
              onJumpToMessage={handleJumpToMessage}
              onContextMenu={handleContextMenu}
              onReact={handleToggleReaction}
              onOpenReactionDetails={(m) => {
                setReactionDetailsMsg(m)
                setIsReactionDetailsOpen(true)
              }}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input & WhatsApp Reply Preview Bar with Multi-line Textarea */}
      <div className={cn("shrink-0 px-4 pb-3 pt-1", isDark ? "bg-[#101315]" : "bg-white")}>
        {replyingTo && (
          <ReplyPreviewBar
            isDark={isDark}
            replyingTo={replyingTo}
            currentUserId={currentUserId}
            onCancel={() => setReplyingTo(null)}
          />
        )}

        <form onSubmit={handleSendMessage} className="flex items-end gap-2">
          <div
            className={cn(
              "flex min-w-0 flex-1 items-end gap-1 border px-2 py-1.5 shadow-sm transition-all",
              replyingTo ? "rounded-b-2xl border-t-0" : "rounded-2xl border",
              isDark ? "border-zinc-700 bg-[#1b2024] shadow-black/20" : "border-slate-200 bg-slate-50"
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={cn("rounded-xl mb-0.5", isDark ? "text-zinc-300 hover:bg-zinc-800" : "text-slate-600 hover:bg-white")}
            >
              <Link2 className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={cn("rounded-xl mb-0.5", isDark ? "text-zinc-300 hover:bg-zinc-800" : "text-slate-600 hover:bg-white")}
            >
              <Smile className="size-4" />
            </Button>

            {/* Auto-resizing Multi-line Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputContent}
              onChange={(e) => setInputContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                activeDiscussion
                  ? "Type a message..."
                  : "Select a discussion channel..."
              }
              disabled={!activeDiscussion}
              style={{ scrollbarWidth: "thin", scrollbarColor: isDark ? "#4b5563 transparent" : "#cbd5e1 transparent" }}
              className={cn(
                "flex-1 border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0 outline-none resize-none py-1 min-h-[36px] max-h-[120px]",
                isDark ? "text-white placeholder:text-zinc-500" : "text-slate-900 placeholder:text-slate-400"
              )}
            />

            <Button
              type="submit"
              size="icon-sm"
              disabled={!activeDiscussion || !inputContent.trim()}
              className={cn(
                "rounded-xl mb-0.5 shrink-0",
                isDark
                  ? "bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-600"
                  : "bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
              )}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </form>
      </div>

      {/* Edit Message Modal */}
      <EditMessageDialog
        isOpen={isEditOpen}
        onOpenChange={setIsEditOpen}
        isDark={isDark}
        message={editingMessage}
        onSave={handleEditSave}
        saving={savingEdit}
      />

      {/* Who Reacted Details Modal */}
      <ReactionDetailsDialog
        isOpen={isReactionDetailsOpen}
        onOpenChange={setIsReactionDetailsOpen}
        isDark={isDark}
        message={reactionDetailsMsg}
        teamId={teamId}
        currentUserId={currentUserId}
        onUndoReaction={async (msg, emoji) => {
          await handleToggleReaction(msg, emoji)
        }}
      />

      {/* WhatsApp Right-Click Context Menu & Floating Emoji Bar */}
      {contextMenu && (
        <MessageContextMenu
          isDark={isDark}
          position={contextMenu.position}
          message={contextMenu.message}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onClose={() => setContextMenu(null)}
          onReply={(msg) => setReplyingTo(msg)}
          onReact={(msg, emoji) => handleToggleReaction(msg, emoji)}
          onEdit={(msg) => {
            setEditingMessage(msg)
            setIsEditOpen(true)
          }}
          onDelete={handleDeleteMessage}
        />
      )}
    </section>
  )
}
