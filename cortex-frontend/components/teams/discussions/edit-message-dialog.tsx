"use client"

import { useState, useEffect } from "react"
import { Loader2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
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

export function EditMessageDialog({
  isOpen,
  onOpenChange,
  isDark,
  message,
  onSave,
  saving,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  isDark: boolean
  message: ChatMessage | null
  onSave: (messageId: number, newContent: string) => Promise<void>
  saving: boolean
}) {
  const [content, setContent] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (message) {
      setContent(message.content)
      setError("")
    }
  }, [message])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message || !content.trim()) return
    setError("")
    try {
      await onSave(message.id, content.trim())
      onOpenChange(false)
    } catch (err: any) {
      setError(err.message || "Failed to update message")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-[95vw] sm:max-w-[480px] overflow-hidden",
          isDark ? "border-zinc-800 bg-[#121518] text-white" : "bg-white text-slate-900"
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Pencil className="size-4 text-violet-400" />
            Edit Message
          </DialogTitle>
          <DialogDescription className={cn("text-xs", isDark ? "text-zinc-400" : "text-slate-500")}>
            Update your message content.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2 min-w-0">
          <div className="min-w-0">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Edit your message..."
              rows={4}
              maxLength={5000}
              required
              style={{ scrollbarWidth: "thin" }}
              className={cn(
                "w-full max-w-full min-h-[100px] max-h-[220px] overflow-y-auto text-xs resize-none rounded-xl [overflow-wrap:anywhere] [word-break:break-word]",
                isDark ? "border-zinc-700 bg-[#1b2024] text-white" : "border-slate-300 bg-slate-50"
              )}
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !content.trim() || content.trim() === message?.content}
              className={cn(
                "rounded-xl text-xs font-semibold",
                isDark ? "bg-white text-black hover:bg-zinc-200" : "bg-slate-900 text-white hover:bg-slate-800"
              )}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
