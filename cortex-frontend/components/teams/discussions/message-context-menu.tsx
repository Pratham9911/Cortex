"use client"

import { useEffect, useRef } from "react"
import { Copy, CornerUpLeft, Pencil, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "./types"

const POPULAR_EMOJIS = ["👍", "❤️", "😂", "😲", "😢", "🙏"]

export function MessageContextMenu({
  isDark,
  position,
  message,
  currentUserId,
  isAdmin,
  onClose,
  onReply,
  onReact,
  onEdit,
  onDelete,
}: {
  isDark: boolean
  position: { x: number; y: number }
  message: ChatMessage
  currentUserId: number
  isAdmin: boolean
  onClose: () => void
  onReply: (msg: ChatMessage) => void
  onReact: (msg: ChatMessage, emoji: string) => void
  onEdit: (msg: ChatMessage) => void
  onDelete: (msg: ChatMessage) => void
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

  const canEdit = !message.is_deleted && message.sender_id === currentUserId
  const canDelete = !message.is_deleted && (message.sender_id === currentUserId || isAdmin)

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    onClose()
  }

  // Ensure menu stays on screen
  const menuStyle: React.CSSProperties = {
    top: Math.min(position.y, window.innerHeight - 300),
    left: Math.min(position.x, window.innerWidth - 220),
  }

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className={cn(
        "fixed z-50 flex flex-col gap-1.5 shadow-2xl rounded-2xl border p-1.5 min-w-[210px] animate-in fade-in zoom-in-95 duration-100 select-none",
        isDark ? "border-zinc-800 bg-[#161a1e] text-white shadow-black/80" : "border-slate-200 bg-white text-slate-900 shadow-slate-300"
      )}
    >
      {/* WhatsApp-style Floating Quick Emoji Reaction Bar */}
      {!message.is_deleted && (
        <div
          className={cn(
            "flex items-center justify-between rounded-xl px-2 py-1.5 border mb-0.5",
            isDark ? "border-zinc-800 bg-[#1f262c]" : "border-slate-100 bg-slate-50"
          )}
        >
          {POPULAR_EMOJIS.map((emoji) => {
            const hasReacted = message.reactions.some((r) => r.emoji === emoji && r.user_reacted)
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onReact(message, emoji)
                  onClose()
                }}
                className={cn(
                  "flex size-7 items-center justify-center rounded-lg text-base transition-transform hover:scale-125 active:scale-95",
                  hasReacted && (isDark ? "bg-zinc-700/80 ring-1 ring-violet-400" : "bg-violet-100 ring-1 ring-violet-400")
                )}
              >
                {emoji}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => {
              const customEmoji = prompt("Enter custom emoji:")
              if (customEmoji) {
                onReact(message, customEmoji.trim())
              }
              onClose()
            }}
            className={cn(
              "flex size-7 items-center justify-center rounded-lg text-xs font-bold transition-transform hover:scale-110",
              isDark ? "text-zinc-400 hover:bg-zinc-700" : "text-slate-500 hover:bg-slate-200"
            )}
            title="Add reaction"
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}

      {/* Action Menu Items */}
      {!message.is_deleted && (
        <button
          type="button"
          onClick={() => {
            onReply(message)
            onClose()
          }}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 text-xs font-medium rounded-xl transition-colors text-left",
            isDark ? "hover:bg-zinc-800 text-zinc-200" : "hover:bg-slate-100 text-slate-800"
          )}
        >
          <CornerUpLeft className="size-4 opacity-70" />
          <span>Reply</span>
        </button>
      )}

      <button
        type="button"
        onClick={handleCopy}
        className={cn(
          "flex items-center gap-3 w-full px-3 py-2 text-xs font-medium rounded-xl transition-colors text-left",
          isDark ? "hover:bg-zinc-800 text-zinc-200" : "hover:bg-slate-100 text-slate-800"
        )}
      >
        <Copy className="size-4 opacity-70" />
        <span>Copy</span>
      </button>

      {canEdit && (
        <button
          type="button"
          onClick={() => {
            onEdit(message)
            onClose()
          }}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 text-xs font-medium rounded-xl transition-colors text-left",
            isDark ? "hover:bg-zinc-800 text-zinc-200" : "hover:bg-slate-100 text-slate-800"
          )}
        >
          <Pencil className="size-4 opacity-70" />
          <span>Edit</span>
        </button>
      )}

      {canDelete && (
        <button
          type="button"
          onClick={() => {
            onDelete(message)
            onClose()
          }}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 text-xs font-medium rounded-xl transition-colors text-left border-t mt-0.5 pt-2 text-rose-500",
            isDark ? "border-zinc-800 hover:bg-rose-950/30" : "border-slate-100 hover:bg-rose-50"
          )}
        >
          <Trash2 className="size-4 opacity-80" />
          <span>Delete</span>
        </button>
      )}
    </div>
  )
}
