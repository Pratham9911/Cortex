"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "./types"

export function ReplyPreviewBar({
  isDark,
  replyingTo,
  currentUserId,
  onCancel,
}: {
  isDark: boolean
  replyingTo: ChatMessage
  currentUserId: number
  onCancel: () => void
}) {
  const isSelf = replyingTo.sender_id === currentUserId
  const senderLabel = isSelf ? "You" : replyingTo.sender_name

  return (
    <div
      className={cn(
        "flex items-center justify-between border-t border-x rounded-t-2xl px-4 py-2.5 shadow-sm transition-all select-none",
        isDark ? "border-zinc-800 bg-[#161a1e] text-white" : "border-slate-200 bg-slate-100 text-slate-900"
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Vertical Accent Bar (WhatsApp purple/blue reference bar) */}
        <div className="h-9 w-1 shrink-0 rounded-full bg-violet-500" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-violet-400 truncate">{senderLabel}</p>
          <p className={cn("text-xs truncate mt-0.5", isDark ? "text-zinc-300" : "text-slate-600")}>
            {replyingTo.is_deleted ? "Deleted message" : replyingTo.content}
          </p>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onCancel}
        className={cn(
          "rounded-full shrink-0 ml-2",
          isDark ? "text-zinc-400 hover:bg-zinc-800 hover:text-white" : "text-slate-500 hover:bg-slate-200"
        )}
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}
