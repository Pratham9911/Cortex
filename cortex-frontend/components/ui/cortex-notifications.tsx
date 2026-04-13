"use client"

import { cn } from "@/lib/utils"
import { AnimatedList } from "@/components/ui/animated-list"

interface Item {
  name: string
  description: string
  icon: string
  color: string
  time: string
}

const baseNotifications = [
  {
    name: "Agent completed research",
    description: "Cortex AI",
    time: "15s ago",
    icon: "🤖",
    color: "#7C3AED",
  },
  {
    name: "Document indexed",
    description: "Knowledge Engine",
    time: "30s ago",
    icon: "📄",
    color: "#06B6D4",
  },
  {
    name: "Answer generated",
    description: "AI Search",
    time: "45s ago",
    icon: "⚡",
    color: "#F59E0B",
  },
  {
    name: "Graph updated",
    description: "Knowledge Graph",
    time: "1m ago",
    icon: "🧠",
    color: "#10B981",
  },
]

const notifications = Array.from({ length: 20 }, () => baseNotifications).flat()


const Notification = ({ name, description, icon, color, time }: Item) => {
  return (
    <figure
  className={cn(
    "relative mx-auto w-full max-w-[400px] overflow-hidden rounded-2xl p-4",
    "transition-all duration-200 hover:scale-[103%]",
    "bg-background/80 backdrop-blur-md ",
    "shadow-sm dark:bg-background/40"
  )}
>
      <div className="flex items-center gap-3">
        <div
          className="flex size-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: color }}
        >
          <span>{icon}</span>
        </div>

        <div className="flex flex-col">
<span className="text-sm font-semibold text-foreground">{name}</span>
              <span className="text-xs text-muted-foreground">
            {description} · {time}
          </span>
        </div>
      </div>
    </figure>
  )
}

export function CortexNotifications({
  className,
}: {
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative flex h-[300px] w-full flex-col overflow-hidden p-2",
        className
      )}
    >
      <AnimatedList>
        {notifications.map((item, idx) => (
          <Notification {...item} key={idx} />
        ))}
      </AnimatedList>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-background"></div>
    </div>
  )
}