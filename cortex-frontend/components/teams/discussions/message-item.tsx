"use client"

import { useState } from "react"
import { Brain } from "lucide-react"
import { AssistantMessageContent, MessageSources } from "@/components/agent-chat/agent-chat-thread"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "./types"

export function MessageItem({
  isDark,
  message,
  currentUserId,
  isHighlighted,
  onJumpToMessage,
  onContextMenu,
  onReact,
  onOpenReactionDetails,
}: {
  isDark: boolean
  message: ChatMessage
  currentUserId: number
  isHighlighted?: boolean
  onJumpToMessage?: (messageId: number) => void
  onContextMenu: (e: React.MouseEvent, message: ChatMessage) => void
  onReact: (message: ChatMessage, emoji: string) => void
  onOpenReactionDetails: (message: ChatMessage) => void
}) {
  const [imgError, setImgError] = useState(false)
  const [cortexIconError, setCortexIconError] = useState(false)
  const isSelf = message.sender_id === currentUserId
  const initials = message.sender_name
    ? message.sender_name
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U"

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return ""
    try {
      return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    } catch {
      return ""
    }
  }

  const isEdited =
    !message.is_deleted &&
    message.updated_at &&
    message.created_at &&
    new Date(message.updated_at).getTime() - new Date(message.created_at).getTime() > 1000

  const truncateText = (str?: string | null, maxLen = 20) => {
    if (!str) return ""
    return str.length > maxLen ? `${str.slice(0, maxLen)}...` : str
  }

  const isAi = message.is_ai_message || message.sender_id === -1 || message.sender_id === null || message.sender_id === undefined

  return (
    <div
      id={`msg-${message.id}`}
      onContextMenu={(e) => onContextMenu(e, message)}
      className={cn(
        "group relative flex w-full min-w-0 items-start gap-3 rounded-lg p-1 select-none transition-all duration-300",
        isSelf ? "flex-row-reverse justify-start" : "flex-row justify-start",
        isHighlighted && (isDark ? "bg-zinc-800/90" : "bg-slate-200/80")
      )}
    >
      {/* Sender Avatar with onError Fallback */}
      {isAi ? (
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full border shadow-md",
            isDark
              ? "border-zinc-700/80 bg-zinc-900 shadow-black/30"
              : "border-slate-200 bg-white shadow-slate-200"
          )}
          title="Cortex AI Assistant"
        >
          {cortexIconError ? (
            <Brain className={cn("size-4", isDark ? "text-white" : "text-slate-900")} />
          ) : (
            <img
              src={isDark ? "/cortex_icon.png" : "/cortex-iconb.png"}
              alt="Cortex AI"
              onError={() => setCortexIconError(true)}
              className="size-5 object-contain"
            />
          )}
        </span>
      ) : message.sender_avatar_url && !imgError ? (
        <img
          src={message.sender_avatar_url}
          alt={message.sender_name}
          onError={() => setImgError(true)}
          className="size-9 shrink-0 rounded-full border object-cover shadow-sm"
        />
      ) : (
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold shadow-sm",
            isSelf
              ? "border-violet-500 bg-violet-600 text-white"
              : isDark
              ? "border-zinc-700 bg-zinc-800 text-zinc-200"
              : "border-slate-300 bg-slate-200 text-slate-800"
          )}
        >
          {initials}
        </span>
      )}

      {/* Message Content Container with w-fit max-w-[70%] bound */}
      <div className={cn(
        "w-fit min-w-0 flex flex-col",
        isAi ? "max-w-[92%] sm:max-w-[88%]" : "max-w-[70%] sm:max-w-[75%]",
        isSelf ? "items-end" : "items-start"
      )}>
        {/* Header Name & Timestamp */}
        <div className="flex items-center gap-2 text-xs mb-1 px-1">
          <span className="font-semibold truncate flex items-center gap-1">
            {isSelf ? "You" : isAi ? "Cortex AI" : message.sender_name}
            {isAi && (
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] font-bold border",
                isDark
                  ? "border-zinc-700 bg-zinc-800 text-zinc-300"
                  : "border-slate-200 bg-slate-100 text-slate-700"
              )}>
                AI
              </span>
            )}
          </span>
          <span className={cn("text-[10px]", isDark ? "text-zinc-500" : "text-slate-400")}>
            {formatTime(message.created_at)}
          </span>
          {isEdited && (
            <span className={cn("text-[10px] italic", isDark ? "text-zinc-500" : "text-slate-400")}>
              (edited)
            </span>
          )}
        </div>

        {/* Message Bubble */}
        <div
          className={cn(
            "relative rounded-lg px-4 py-2.5 text-sm shadow-sm border transition-all w-fit max-w-full [overflow-wrap:anywhere] [word-break:break-word]",
            message.is_deleted
              ? isDark
                ? "border-zinc-800 bg-[#161a1e]/60 text-zinc-400 italic"
                : "border-slate-200 bg-slate-100 text-slate-500 italic"
              : isAi
              ? isDark
                ? "border-zinc-700/80 bg-[#181c20] text-zinc-100 shadow-black/20"
                : "border-slate-200 bg-white text-slate-900 shadow-slate-100"
              : isSelf
              ? isDark
                ? "border-violet-500/30 bg-violet-950/40 text-violet-100 shadow-violet-950/20"
                : "border-violet-200 bg-violet-50 text-violet-950 shadow-violet-100"
              : isDark
              ? "border-zinc-800 bg-[#1c2227] text-zinc-100 shadow-black/20"
              : "border-slate-200 bg-slate-50 text-slate-900"
          )}
        >
          {/* Reply Quote Block Preview — Click jumps to original message */}
          {!message.is_deleted && message.parent_message && (
            <div
              onClick={(e) => {
                e.stopPropagation()
                if (message.parent_message_id && onJumpToMessage) {
                  onJumpToMessage(message.parent_message_id)
                }
              }}
              title="Click to jump to original message"
              className={cn(
                "mb-2 flex flex-col border-l-4 rounded-r-md px-2.5 py-1 text-xs transition-all max-w-full cursor-pointer hover:opacity-90 select-none overflow-hidden min-w-0",
                isDark
                  ? "border-violet-400 bg-zinc-900/80 text-zinc-300 hover:bg-zinc-900"
                  : "border-violet-600 bg-white/90 text-slate-800 shadow-inner hover:bg-white"
              )}
            >
              <span className="font-bold text-violet-400 text-[11px] truncate block max-w-full">
                {message.parent_message.sender_name}
              </span>
              <span className="truncate opacity-80 block max-w-full text-[11px]">
                {message.parent_message.is_deleted
                  ? "Deleted message"
                  : truncateText(message.parent_message.content, 20)}
              </span>
            </div>
          )}

          {/* Content: Rich Markdown for AI messages, plain text for user messages */}
          {isAi && !message.is_deleted ? (
            <AssistantMessageContent
              content={message.content}
              isDark={isDark}
              sources={message.ai_sources}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words text-xs sm:text-sm leading-relaxed max-w-full">
              {message.content}
            </p>
          )}
        </div>

        {/* AI Sources drawer (clickable document badges & web favicons) */}
        {isAi && !message.is_deleted && message.ai_sources && (
          <div className="mt-1 px-1">
            <MessageSources
              message={
                {
                  content: message.content,
                  sources: message.ai_sources,
                } as any
              }
              isDark={isDark}
            />
          </div>
        )}

        {/* Reactions Summary List (Top 3 Reactions) — Clicking opens Who Reacted Modal */}
        {!message.is_deleted && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5 px-1">
            {message.reactions.slice(0, 3).map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onOpenReactionDetails(message)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs font-semibold border transition-all hover:scale-105 active:scale-95",
                  r.user_reacted
                    ? isDark
                      ? "border-violet-500/60 bg-violet-950/60 text-violet-300"
                      : "border-violet-400 bg-violet-100 text-violet-900"
                    : isDark
                    ? "border-zinc-800 bg-[#161a1e] text-zinc-300 hover:bg-zinc-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                )}
                title={`Click to view who reacted with ${r.emoji}`}
              >
                <span>{r.emoji}</span>
                <span className="text-[10px] opacity-80">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

}
