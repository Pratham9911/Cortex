"use client"

import { useEffect, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { Message } from "./types"
import { AgentThinkingIndicator } from "./agent-thinking-indicator"

type AgentChatThreadProps = {
  messages: Message[]
  isThinking: boolean
  isDark: boolean
  userInitials: string
}

export function AgentChatThread({
  messages,
  isThinking,
  isDark,
}: AgentChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector("[data-slot=scroll-area-viewport]")
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [messages, isThinking])

  return (
    <ScrollArea ref={scrollRef} className="min-h-0 flex-1">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-8 py-8">
        {messages.map((message) => {
          const isUser = message.role === "user"
          return (
            <div
              key={message.id}
              className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "text-[13.5px] leading-relaxed whitespace-pre-wrap",
                  isUser
                    ? isDark
                      ? "max-w-[80%] rounded-[20px] px-4.5 py-2.5 bg-[#1C1C1E] text-zinc-105 shadow-sm"
                      : "max-w-[80%] rounded-[20px] px-4.5 py-2.5 bg-[#F4F4F5] text-slate-800 shadow-sm"
                    : "w-full bg-transparent text-slate-800 dark:text-zinc-200 py-1.5"
                )}
              >
                {message.content}
              </div>
            </div>
          )
        })}
        {isThinking && (
          <div className="flex w-full justify-start">
            <AgentThinkingIndicator />
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
