"use client"

import { Mail, MessageSquare, SlidersHorizontal, User } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PromptCard } from "./types"

type AgentWelcomeViewProps = {
  prompts: PromptCard[]
  onSend: (text: string) => void
  disabled?: boolean
  isDark: boolean
}

const ICON_MAP = {
  user: User,
  mail: Mail,
  message: MessageSquare,
  sliders: SlidersHorizontal,
}

export function AgentWelcomeView({
  prompts,
  onSend,
  disabled,
  isDark,
}: AgentWelcomeViewProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 max-w-2xl mx-auto w-full">
      <div className="text-center w-full">
        <h2
          className={cn(
            "text-2xl font-semibold tracking-tight",
            isDark ? "text-white" : "text-[#090D1A]"
          )}
        >
          What would you like to know?
        </h2>
        <p className={cn("mt-1.5 text-xs", isDark ? "text-zinc-500" : "text-slate-500")}>
          Select one of the prompts below or ask your own question to begin.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {prompts.map((prompt) => {
            const Icon = ICON_MAP[prompt.icon]
            return (
              <button
                key={prompt.id}
                type="button"
                onClick={() => onSend(prompt.text)}
                disabled={disabled}
                className={cn(
                  "flex min-h-[72px] flex-col justify-between rounded-2xl border p-3.5 text-left text-xs font-medium transition-all shadow-sm",
                  isDark
                    ? "border-zinc-800 bg-[#141416]/60 text-zinc-300 hover:border-zinc-700 hover:bg-[#1a1a1d]"
                    : "border-slate-200/80 bg-white text-slate-700 hover:border-slate-350 hover:bg-slate-50/50 hover:shadow-md hover:shadow-slate-100/50"
                )}
              >
                <span>{prompt.text}</span>
                <div className="flex w-full justify-end mt-1">
                  <Icon className={cn("size-3.5", isDark ? "text-zinc-650" : "text-slate-400")} />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
