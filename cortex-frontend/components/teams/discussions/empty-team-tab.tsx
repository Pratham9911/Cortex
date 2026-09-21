import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function EmptyTeamTab({
  isDark,
  icon,
  title,
  description,
}: {
  isDark: boolean
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed text-center",
        isDark ? "border-zinc-800 bg-[#111315]" : "border-slate-200 bg-white"
      )}
    >
      {icon}
      <h2 className={cn("mt-4 text-lg font-semibold", isDark ? "text-white" : "text-slate-900")}>
        {title}
      </h2>
      <p className={cn("mt-2 max-w-sm text-sm", isDark ? "text-zinc-500" : "text-slate-500")}>
        {description}
      </p>
    </div>
  )
}
