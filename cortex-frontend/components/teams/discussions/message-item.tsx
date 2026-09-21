"use client"

import { MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "./types"

export function MessageItem({
  isDark,
  message,
  currentUserId,
  onContextMenu,
  onReact,
}: {
  isDark: boolean
  message: ChatMessage
  currentUserId: number
  onContextMenu: (e: React.MouseEvent, message: ChatMessage) => void
  onReact: (message: ChatMessage, emoji: string) => void
}) {
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

  return (
    <div
      onContextMenu={(e) => onContextMenu(e, message)}
      className={cn(
        "group relative flex items-start gap-3 transition-colors rounded-2xl p-1",
        isSelf ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Sender Avatar / Badge */}
      {message.sender_avatar_url ? (
        <img
          src={message.sender_avatar_url}
          alt={message.sender_name}
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

      {/* Message Content Container */}
      <div className={cn("max-w-[580px] min-w-0 flex flex-col", isSelf ? "items-end" : "items-start")}>
        {/* Header Name & Timestamp */}
        <div className="flex items-center gap-2 text-xs mb-1 px-1">
          <span className="font-semibold truncate">{isSelf ? "You" : message.sender_name}</span>
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
            "relative rounded-2xl px-4 py-2.5 text-sm shadow-sm border transition-shadow",
            message.is_deleted
              ? isDark
                ? "border-zinc-800 bg-[#161a1e]/60 text-zinc-400 italic"
                : "border-slate-200 bg-slate-100 text-slate-500 italic"
              : isSelf
              ? isDark
                ? "border-violet-500/30 bg-violet-950/40 text-violet-100 shadow-violet-950/20"
                : "border-violet-200 bg-violet-50 text-violet-950 shadow-violet-100"
              : isDark
              ? "border-zinc-800 bg-[#1c2227] text-zinc-100 shadow-black/20"
              : "border-slate-200 bg-slate-50 text-slate-900"
          )}
        >
          {/* Reply Quote Block Preview */}
          {!message.is_deleted && message.parent_message && (
            <div
              className={cn(
                "mb-2 flex flex-col border-l-4 rounded-r-xl px-3 py-1.5 text-xs transition-colors",
                isDark
                  ? "border-violet-400 bg-zinc-900/80 text-zinc-300"
                  : "border-violet-600 bg-white/80 text-slate-800 shadow-inner"
              )}
            >
              <span className="font-bold text-violet-400 text-[11px]">
                {message.parent_message.sender_name}
              </span>
              <span className="truncate opacity-80">
                {message.parent_message.is_deleted
                  ? "Deleted message"
                  : message.parent_message.content}
              </span>
            </div>
          )}

          {/* Text Content */}
          <p className="whitespace-pre-wrap break-words text-xs sm:text-sm leading-relaxed">
            {message.content}
          </p>

          {/* Quick Context Menu Options Trigger (Hover Icon) */}
          <button
            type="button"
            onClick={(e) => onContextMenu(e, message)}
            className={cn(
              "absolute right-2 top-2 rounded-lg p-1 opacity-0 group-hover:opacity-100 transition-opacity",
              isDark ? "hover:bg-zinc-700 text-zinc-300" : "hover:bg-slate-200 text-slate-600"
            )}
            title="Message options"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </div>

        {/* Reactions Summary List (Top 3 Reactions) */}
        {!message.is_deleted && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5 px-1">
            {message.reactions.slice(0, 3).map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReact(message, r.emoji)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border transition-all hover:scale-105 active:scale-95",
                  r.user_reacted
                    ? isDark
                      ? "border-violet-500/60 bg-violet-950/60 text-violet-300"
                      : "border-violet-400 bg-violet-100 text-violet-900"
                    : isDark
                    ? "border-zinc-800 bg-[#161a1e] text-zinc-300 hover:bg-zinc-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                )}
                title={`Reacted with ${r.emoji}`}
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
