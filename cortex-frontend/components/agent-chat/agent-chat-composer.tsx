"use client"

import { useEffect, useRef } from "react"
import { ArrowUp, Mic, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

type AgentChatComposerProps = {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  isDark: boolean
}

const MAX_HEIGHT = 128

export function AgentChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  isDark,
}: AgentChatComposerProps) {
  const maxChars = 4000
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = "auto"
    const nextHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT ? "auto" : "hidden"
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="shrink-0 px-10 pb-3 pt-1">
      <div
        className={cn(
          // Width: tweak max-w-[52rem] (832px) — e.g. max-w-4xl (896px) wider, max-w-3xl (768px) narrower
          "mx-auto flex w-full max-w-[52rem] items-end gap-1.5 rounded-[26px] border px-2 py-1.5",
          isDark
            ? "border-zinc-800 bg-[#1c1c1e]"
            : "border-slate-200 bg-white shadow-sm"
        )}
      >
        <button
          type="button"
          aria-label="Add attachment"
          className={cn(
            "mb-1 grid size-9 shrink-0 place-items-center rounded-full transition-colors",
            isDark
              ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          )}
        >
          <Plus className="size-5" />
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxChars))}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Ask anything..."
          rows={1}
          className={cn(
            "min-h-[36px] max-h-32 flex-1 resize-none bg-transparent py-2 text-[13.5px] leading-relaxed outline-none",
            "agent-composer-scroll",
            isDark
              ? "text-white placeholder:text-zinc-500"
              : "text-slate-900 placeholder:text-slate-400"
          )}
        />

        <button
          type="button"
          aria-label="Voice input"
          className={cn(
            "mb-1 grid size-9 shrink-0 place-items-center rounded-full transition-colors",
            isDark
              ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          )}
        >
          <Mic className="size-[18px]" />
        </button>

        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          className={cn(
            "mb-1 grid size-9 shrink-0 place-items-center rounded-full transition-all",
            isDark
              ? "bg-white text-zinc-900 hover:bg-zinc-100"
              : "bg-zinc-900 text-white hover:bg-zinc-800",
            (disabled || !value.trim()) && "opacity-40 cursor-not-allowed"
          )}
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  )
}
