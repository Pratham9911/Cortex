"use client"

import { cn } from "@/lib/utils"
import type { ThinkingEvent } from "./types"

type AgentThinkingIndicatorProps = {
  events: ThinkingEvent[]
  isDark: boolean
}

export function AgentThinkingIndicator({
  events,
  isDark,
}: AgentThinkingIndicatorProps) {
  return (
    <div className="w-full py-1">
      <div className="flex items-center gap-2.5 text-slate-400 dark:text-zinc-500">
        <span className="flex shrink-0 items-center gap-1">
          <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s] dark:bg-zinc-500"></span>
          <span className="size-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s] dark:bg-zinc-500"></span>
          <span className="size-1.5 animate-bounce rounded-full bg-slate-400 dark:bg-zinc-500"></span>
        </span>
        <p className="thinking-sweep text-[12.5px] font-semibold">
          {events.at(-1)?.message || "Starting request..."}
        </p>
      </div>

      {events.length > 0 ? (
        <div
          className={cn(
            "mt-3 space-y-1.5 border-l pl-3",
            isDark ? "border-zinc-800" : "border-slate-200"
          )}
        >
          {events.map((event) => (
            <div
              key={event.id}
              className={cn(
                "text-[12px] leading-relaxed",
                isDark ? "text-zinc-450" : "text-slate-500"
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
