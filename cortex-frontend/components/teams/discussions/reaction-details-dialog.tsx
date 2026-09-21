"use client"

import { useEffect, useState } from "react"
import { Loader2, Smile, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "./types"

type Reactor = {
  user_id: number
  name: string
  avatar_url: string | null
  emoji: string
}

export function ReactionDetailsDialog({
  isOpen,
  onOpenChange,
  isDark,
  message,
  teamId,
  currentUserId,
  onUndoReaction,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  isDark: boolean
  message: ChatMessage | null
  teamId?: string | number
  currentUserId: number
  onUndoReaction: (message: ChatMessage, emoji: string) => Promise<void>
}) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const [reactors, setReactors] = useState<Reactor[]>([])
  const [loading, setLoading] = useState(false)
  const [undoing, setUndoing] = useState(false)

  const fetchReactors = async () => {
    if (!message || !teamId) return
    const token = localStorage.getItem("access_token") || localStorage.getItem("token")
    const projectId = localStorage.getItem("selected_project_id") || "1"
    if (!token) return

    try {
      setLoading(true)
      const res = await fetch(
        `${apiUrl}/projects/${projectId}/teams/${teamId}/discussions/${message.discussion_id}/messages/${message.id}/reactions/details`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      if (res.ok) {
        const data = await res.json()
        setReactors(data.reactors || [])
      }
    } catch (err) {
      console.error("Failed to fetch reactors:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && message) {
      fetchReactors()
    } else {
      setReactors([])
    }
  }, [isOpen, message?.id])

  const handleUndo = async (emoji: string) => {
    if (!message) return
    setUndoing(true)
    try {
      await onUndoReaction(message, emoji)
      await fetchReactors()
    } finally {
      setUndoing(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "sm:max-w-[420px]",
          isDark ? "border-zinc-800 bg-[#121518] text-white" : "bg-white text-slate-900"
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Smile className="size-4 text-violet-400" />
            Message Reactions
          </DialogTitle>
          <DialogDescription className={cn("text-xs", isDark ? "text-zinc-400" : "text-slate-500")}>
            People who reacted to this message. Tap your reaction to undo it.
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-2 max-h-[300px] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 text-xs opacity-60">
              <Loader2 className="mb-2 size-5 animate-spin" />
              <span>Loading reactions...</span>
            </div>
          ) : reactors.length === 0 ? (
            <div className="py-8 text-center text-xs opacity-60">No reactions found.</div>
          ) : (
            reactors.map((r) => {
              const isSelf = r.user_id === currentUserId
              const initials = r.name
                ? r.name
                    .trim()
                    .split(/\s+/)
                    .map((p) => p[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)
                : "U"

              return (
                <div
                  key={`${r.user_id}-${r.emoji}`}
                  className={cn(
                    "flex items-center justify-between rounded-xl p-2.5 transition-colors border",
                    isSelf
                      ? isDark
                        ? "border-violet-500/30 bg-violet-950/30"
                        : "border-violet-200 bg-violet-50"
                      : isDark
                      ? "border-zinc-800/80 bg-[#171b1f]"
                      : "border-slate-200 bg-slate-50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <AvatarBadge avatarUrl={r.avatar_url} name={r.name} initials={initials} isDark={isDark} />
                    <div>
                      <p className="text-xs font-semibold">
                        {r.name} {isSelf && <span className="text-violet-400 font-normal">(You)</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-lg">{r.emoji}</span>
                    {isSelf && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={undoing}
                        onClick={() => handleUndo(r.emoji)}
                        className={cn(
                          "h-7 px-2 text-[11px] rounded-lg gap-1",
                          isDark ? "text-rose-400 hover:bg-rose-950/40" : "text-rose-600 hover:bg-rose-100"
                        )}
                        title="Click to remove your reaction"
                      >
                        {undoing ? <Loader2 className="size-3 animate-spin" /> : <Undo2 className="size-3" />}
                        <span>Undo</span>
                      </Button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AvatarBadge({
  avatarUrl,
  name,
  initials,
  isDark,
}: {
  avatarUrl: string | null
  name: string
  initials: string
  isDark: boolean
}) {
  const [imgError, setImgError] = useState(false)

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgError(true)}
        className="size-8 rounded-full object-cover border"
      />
    )
  }

  return (
    <span
      className={cn(
        "flex size-8 items-center justify-center rounded-full text-xs font-bold border",
        isDark ? "border-zinc-700 bg-zinc-800 text-zinc-200" : "border-slate-300 bg-slate-200 text-slate-800"
      )}
    >
      {initials}
    </span>
  )
}
