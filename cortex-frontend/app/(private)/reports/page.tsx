"use client"

import { useTheme } from "next-themes"
import { FileText, CalendarDays } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export default function ReportsPage() {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">Reporting</p>
        <h1 className={cn("mt-3 text-3xl font-extrabold", isDark ? "text-white" : "text-slate-900")}>Your latest reports</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {[
          { title: "Usage summary", description: "A quick look at recent activity.", icon: FileText },
          { title: "Team cadence", description: "Track collaboration velocity.", icon: CalendarDays },
          { title: "Storage report", description: "Current document and file usage.", icon: FileText },
        ].map((item) => (
          <Card key={item.title} className={cn(
            "p-6",
            isDark ? "border-white/5 bg-[#121212]" : "border-slate-200 bg-white"
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "rounded-2xl p-3",
                isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-900"
              )}>
                <item.icon className="w-5 h-5" />
              </div>
              <div>
                <h2 className={cn("text-lg font-semibold", isDark ? "text-white" : "text-slate-900")}>
                  {item.title}
                </h2>
                <p className={cn("mt-2 text-sm", isDark ? "text-zinc-400" : "text-slate-600")}>{item.description}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  )
}
