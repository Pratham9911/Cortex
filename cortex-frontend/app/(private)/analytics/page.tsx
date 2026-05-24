"use client"

import { useTheme } from "next-themes"
import { BarChart3 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export default function AnalyticsPage() {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">Analytics</p>
        <h1 className={cn("mt-3 text-3xl font-extrabold", isDark ? "text-white" : "text-slate-900")}>Product performance</h1>
      </div>

      <Card className={cn(
        "p-6",
        isDark ? "border-white/5 bg-[#121212]" : "border-slate-200 bg-white"
      )}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className={cn("text-sm text-zinc-500")}>Weekly traffic</p>
            <p className={cn("mt-3 text-3xl font-extrabold", isDark ? "text-white" : "text-slate-900")}>12.4K</p>
          </div>
          <div className={cn(
            "rounded-2xl p-3",
            isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-900"
          )}>
            <BarChart3 className="w-6 h-6" />
          </div>
        </div>
      </Card>

      <Card className={cn(
        "p-6",
        isDark ? "border-white/5 bg-[#121212]" : "border-slate-200 bg-white"
      )}>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Conversions", value: "42%" },
            { label: "Engagement", value: "88%" },
            { label: "Revenue", value: "$14.2K" },
          ].map((item) => (
            <div key={item.label} className="rounded-3xl border p-4">
              <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">{item.label}</p>
              <p className={cn("mt-3 text-2xl font-semibold", isDark ? "text-white" : "text-slate-900")}>{item.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </section>
  )
}
