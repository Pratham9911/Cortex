"use client"

import { useEffect, useRef } from "react"
import { ArrowUp, Link2, Mic, Sparkles } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type AgentChatComposerProps = {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  isDark: boolean
}

export function AgentChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  isDark,
}: AgentChatComposerProps) {
  const maxChars = 1000
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="px-6 py-2.5">
      <div
        className={cn(
          "mx-auto max-w-[620px] rounded-[24px] border p-3.5 shadow-sm transition-shadow",
          isDark
            ? "border-zinc-800 bg-[#141416]"
            : "border-slate-200/90 bg-white shadow-slate-100/50 hover:shadow-md"
        )}
      >
        <div className="flex items-start gap-2.5 px-1.5">
          <Sparkles className={cn("size-4 mt-0.5 shrink-0", isDark ? "text-indigo-400" : "text-indigo-500")} />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, maxChars))}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="What are the best open opportunities by comp..."
            rows={1}
            className={cn(
              "w-full resize-none bg-transparent text-[13px] outline-none leading-relaxed",
              isDark
                ? "text-white placeholder:text-zinc-500"
                : "text-slate-900 placeholder:text-slate-400"
            )}
            style={{ minHeight: "20px", maxHeight: "160px", overflowY: "auto" }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 mt-3 px-1">
          <Select defaultValue="project-docs">
            <SelectTrigger
              className={cn(
                "h-7 rounded-full border border-slate-200 px-3 text-[11px] font-medium bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1 shadow-sm w-[130px] justify-between",
                isDark && "border-zinc-850 bg-[#1a1a1d] text-zinc-200 hover:bg-zinc-800/80"
              )}
            >
              <SelectValue placeholder="Select Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all-web">All Web</SelectItem>
              <SelectItem value="project-docs">Project Docs</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                "h-7 rounded-full border border-slate-200 px-3 flex items-center gap-1.5 text-[11px] font-medium bg-white hover:bg-slate-50 text-[#475569] shadow-sm transition-colors",
                isDark && "border-zinc-800 bg-[#1a1a1d] text-zinc-250 hover:bg-zinc-800/80"
              )}
            >
              <Link2 className="size-3 text-slate-500 dark:text-zinc-400 rotate-45" />
              <span>Attach</span>
            </button>
            <button
              type="button"
              className={cn(
                "h-7 rounded-full border border-slate-200 px-3 flex items-center gap-1.5 text-[11px] font-medium bg-white hover:bg-slate-50 text-[#475569] shadow-sm transition-colors",
                isDark && "border-zinc-800 bg-[#1a1a1d] text-zinc-250 hover:bg-zinc-800/80"
              )}
            >
              <Mic className="size-3 text-slate-500 dark:text-zinc-400" />
              <span>Voice</span>
            </button>
            <button
              type="button"
              onClick={onSend}
              disabled={disabled || !value.trim()}
              className={cn(
                "size-7 rounded-full bg-[#0B1528] text-white flex items-center justify-center transition-all hover:bg-[#1A253C]",
                (disabled || !value.trim()) && "opacity-40 cursor-not-allowed"
              )}
            >
              <ArrowUp className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
