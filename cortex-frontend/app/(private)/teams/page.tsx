"use client"

import { useTheme } from "next-themes"
import { ShieldCheck, Users } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export default function TeamsPage() {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">Teams</p>
        <h1 className={cn("mt-3 text-3xl font-extrabold", isDark ? "text-white" : "text-slate-900")}>Work with your crew</h1>
      </div>

      <Card className={cn(
        "p-6",
        isDark ? "border-white/5 bg-[#121212]" : "border-slate-200 bg-white"
      )}>
        <div className="flex items-center gap-4">
          <div className={cn(
            "rounded-2xl p-3",
            isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-900"
          )}>
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className={cn("text-lg font-semibold", isDark ? "text-white" : "text-slate-900")}>No active teams yet</h2>
            <p className={cn("mt-2 text-sm", isDark ? "text-zinc-400" : "text-slate-600")}>Invite teammates and align work in one space.</p>
          </div>
        </div>
      </Card>

      <Card className={cn(
        "p-6 flex items-center gap-4",
        isDark ? "border-white/5 bg-[#121212]" : "border-slate-200 bg-white"
      )}>
        <ShieldCheck className={cn("w-6 h-6", isDark ? "text-white" : "text-slate-900")} />
        <div>
          <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>Enterprise-ready controls</p>
          <p className={cn("text-sm", isDark ? "text-zinc-400" : "text-slate-600")}>Manage permissions, access, and collaboration securely.</p>
        </div>
      </Card>
    </section>
  )
}
