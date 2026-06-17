"use client"

import { Settings, Share2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Message, PromptCard, ThinkingEvent } from "./types"
import { AgentChatComposer } from "./agent-chat-composer"
import { AgentChatThread } from "./agent-chat-thread"
import { AgentWelcomeView } from "./agent-welcome"

type AgentChatMainProps = {
  messages: Message[]
  prompts: PromptCard[]
  thinkingEvents: ThinkingEvent[]
  input: string
  onInputChange: (value: string) => void
  onSend: (text?: string) => void
  onNewChat: () => void
  isThinking: boolean
  isDark: boolean
  userInitials: string
  activeChatTitle?: string
  onSourceAccessChanged?: () => void
}

export function AgentChatMain({
  messages,
  prompts,
  thinkingEvents,
  input,
  onInputChange,
  onSend,
  onNewChat,
  isThinking,
  isDark,
  userInitials,
  activeChatTitle,
  onSourceAccessChanged,
}: AgentChatMainProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col",
        isDark ? "bg-[#0A0A0A]" : "bg-white"
      )}
    >
      <header
        className={cn(
          "flex shrink-0 items-center justify-between border-b px-6 py-3",
          isDark ? "border-zinc-800" : "border-slate-200"
        )}
      >
        <div className="flex items-center gap-2">
          <h1 className={cn("text-sm font-bold", isDark ? "text-white" : "text-[#090D1A]")}>
            Cortex AI
          </h1>
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
              isDark
                ? "border-zinc-800 text-zinc-400 bg-zinc-900"
                : "border-slate-200 text-slate-500 bg-slate-50"
            )}
          >
            Plus
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors",
              isDark
                ? "border-zinc-800 bg-[#161618] text-zinc-300 hover:bg-zinc-800"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            <Settings className="size-3.5 text-slate-500 dark:text-zinc-400" />
            <span>Configuration</span>
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors",
              isDark
                ? "border-zinc-800 bg-[#161618] text-zinc-300 hover:bg-zinc-800"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            <Share2 className="size-3.5 text-slate-500 dark:text-zinc-400" />
            <span>Share</span>
          </button>
          <button
            type="button"
            onClick={onNewChat}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all shadow-sm",
              isDark
                ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                : "bg-[#090D1A] text-white hover:bg-[#131b31]"
            )}
          >
            <span>New Chat</span>
            <Sparkles className="size-3.5 text-indigo-305 dark:text-indigo-400" />
          </button>
        </div>
      </header>

      {messages.length === 0 ? (
        <AgentWelcomeView
          prompts={prompts}
          onSend={onSend}
          disabled={isThinking}
          isDark={isDark}
        />
      ) : (
        <AgentChatThread
          messages={messages}
          isThinking={isThinking}
          thinkingEvents={thinkingEvents}
          isDark={isDark}
          userInitials={userInitials}
          onSourceAccessChanged={onSourceAccessChanged}
        />
      )}

      <AgentChatComposer
        value={input}
        onChange={onInputChange}
        onSend={() => onSend()}
        disabled={isThinking}
        isDark={isDark}
      />

      <p
        className={cn(
          "shrink-0 px-6 pb-4 pt-1 text-center text-[10.5px] tracking-wide",
          isDark ? "text-zinc-650" : "text-slate-400"
        )}
      >
        Centra may display inaccurate info, so please double check the response.{" "}
        <a href="#" className="underline hover:text-slate-600">Your Privacy &amp; Orbita GPT</a>
      </p>
    </div>
  )
}
