"use client"

import { useEffect, useState } from "react"
import { THINKING_STEPS } from "./types"

export function AgentThinkingIndicator() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((prev) => (prev + 1) % THINKING_STEPS.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-2.5 py-1 text-slate-400 dark:text-zinc-500">
      <span className="flex items-center gap-1 mt-1 shrink-0">
        <span className="size-1.5 rounded-full bg-slate-400 dark:bg-zinc-500 animate-bounce [animation-delay:-0.3s]"></span>
        <span className="size-1.5 rounded-full bg-slate-400 dark:bg-zinc-500 animate-bounce [animation-delay:-0.15s]"></span>
        <span className="size-1.5 rounded-full bg-slate-400 dark:bg-zinc-500 animate-bounce"></span>
      </span>
      <p className="thinking-sweep text-[12.5px] font-semibold ml-1.5">{THINKING_STEPS[step]}</p>
    </div>
  )
}
