"use client"

import { useEffect, useRef } from "react"
import { CheckCircle2, Clock3, Folder, LayoutGrid, MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export const teamTabNames = ["Discussions", "Tasks", "Timelines", "Files", "Overview"] as const
export type TeamTabName = (typeof teamTabNames)[number]

const icons = { Discussions: MessageCircle, Tasks: CheckCircle2, Timelines: Clock3, Files: Folder, Overview: LayoutGrid }

export function TeamTabs({ activeTab, onChange, isDark }: { activeTab: TeamTabName; onChange: (tab: TeamTabName) => void; isDark: boolean }) {
  const activeRef = useRef<HTMLButtonElement>(null)
  const indicatorRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const active = activeRef.current
    const indicator = indicatorRef.current
    if (!active || !indicator) return
    indicator.style.width = `${active.offsetWidth - 16}px`
    indicator.style.transform = `translateX(${active.offsetLeft + 8}px)`
  }, [activeTab])

  return (
    <nav className="relative flex gap-1" aria-label="Team sections">
      {teamTabNames.map((label) => {
        const Icon = icons[label]
        return (
          <button
            key={label}
            ref={activeTab === label ? activeRef : undefined}
            type="button"
            onClick={() => onChange(label)}
            className={cn(
              "relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-medium transition-colors duration-200",
              activeTab === label ? (isDark ? "text-white" : "text-black") : (isDark ? "text-zinc-300 hover:text-white" : "text-slate-700 hover:text-black")
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        )
      })}
      <span ref={indicatorRef} className={cn("pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full transition-[transform,width] duration-300 ease-out", isDark ? "bg-white" : "bg-black")} />
    </nav>
  )
}
