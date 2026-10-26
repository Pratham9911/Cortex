"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { ThinkingEvent } from "./types"

type AgentThinkingIndicatorProps = {
  events: ThinkingEvent[]
  isDark: boolean
}

const WAITING_MESSAGES = [
  "Starting request...",
  "Connecting to Cortex brain...",
  "Analyzing query and context...",
  "Thinking and processing...",
  "Working on response...",
]

export function AgentThinkingIndicator({
  events,
  isDark,
}: AgentThinkingIndicatorProps) {
  const [phaseIndex, setPhaseIndex] = useState(0)

  useEffect(() => {
    // Cycle every 2.8 seconds while waiting for events
    if (events.length > 1) return
    const timer = setInterval(() => {
      setPhaseIndex((prev) => (prev < WAITING_MESSAGES.length - 1 ? prev + 1 : prev))
    }, 2800)
    return () => clearInterval(timer)
  }, [events.length])

  const latestRealEvent = events
    .slice()
    .reverse()
    .find((e) => e.message && e.message !== "Connected to server")

  const currentMessage = latestRealEvent?.message || WAITING_MESSAGES[phaseIndex]

  const displayEvents = events.filter((e) => e.message && e.message !== "Connected to server")

  return (
    <div className="w-full py-1">
      <div className="flex items-center gap-2.5 text-slate-400 dark:text-zinc-500">
        <span className="flex shrink-0 items-center gap-1">
          <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s] dark:bg-zinc-500" />
          <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s] dark:bg-zinc-500" />
          <span className="size-1.5 animate-bounce rounded-full bg-slate-400 dark:bg-zinc-500" />
        </span>
        <p className="thinking-sweep text-[12.5px] font-semibold">
          {currentMessage}
        </p>
      </div>

      {displayEvents.length > 0 ? (
        <div
          className={cn(
            "mt-3 space-y-1.5 border-l pl-3",
            isDark ? "border-zinc-800" : "border-slate-200"
          )}
        >
          {displayEvents.map((event) => (
            <div
              key={event.id}
              className={cn(
                "text-[12px] leading-relaxed",
                isDark ? "text-zinc-400" : "text-slate-500"
              )}
            >
              {event.message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
