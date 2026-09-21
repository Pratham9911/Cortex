"use client"

import { Hash, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

export function CreateDiscussionDialog({
  isOpen,
  onOpenChange,
  isDark,
  name,
  description,
  onNameChange,
  onDescriptionChange,
  onSubmit,
  creating,
  error,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  isDark: boolean
  name: string
  description: string
  onNameChange: (val: string) => void
  onDescriptionChange: (val: string) => void
  onSubmit: (e: React.FormEvent) => void
  creating: boolean
  error: string
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "sm:max-w-[425px]",
          isDark ? "border-zinc-800 bg-[#121518] text-white" : "bg-white text-slate-900"
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-lg border text-sm",
                isDark ? "border-zinc-700 bg-zinc-800 text-white" : "border-slate-300 bg-slate-100 text-slate-800"
              )}
            >
              <Hash className="size-4 stroke-[2.5]" />
            </span>
            Create New Discussion
          </DialogTitle>
          <DialogDescription className={cn("text-xs", isDark ? "text-zinc-400" : "text-slate-500")}>
            Add a new discussion channel for your team members to communicate.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 py-2">
          <div>
            <label className={cn("text-xs font-semibold block mb-1.5", isDark ? "text-zinc-300" : "text-slate-700")}>
              Discussion Name <span className="text-red-400">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g. Frontend Architecture"
              maxLength={50}
              required
              className={cn("h-10 text-xs rounded-xl", isDark ? "border-zinc-700 bg-[#1b2024] text-white" : "border-slate-300 bg-slate-50")}
            />
          </div>

          <div>
            <label className={cn("text-xs font-semibold block mb-1.5", isDark ? "text-zinc-300" : "text-slate-700")}>
              Description <span className="text-zinc-500 font-normal">(optional)</span>
            </label>
            <Textarea
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Brief summary of what this discussion topic is about..."
              rows={3}
              maxLength={500}
              className={cn("text-xs resize-none rounded-xl", isDark ? "border-zinc-700 bg-[#1b2024] text-white" : "border-slate-300 bg-slate-50")}
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
              disabled={creating || !name.trim()}
              className={cn(
                "rounded-xl text-xs font-semibold",
                isDark ? "bg-white text-black hover:bg-zinc-200" : "bg-slate-900 text-white hover:bg-slate-800"
              )}
            >
              {creating ? <Loader2 className="size-3.5 animate-spin" /> : "Create Discussion"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
