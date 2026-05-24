"use client"

import { useTheme } from "next-themes"
import { Folder } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export default function ProjectsPage() {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">Projects</p>
        <h1 className={cn("mt-3 text-3xl font-extrabold", isDark ? "text-white" : "text-slate-900")}>Build together</h1>
      </div>

      <Card className={cn(
        "p-6 flex flex-col gap-6",
        isDark ? "border-white/5 bg-[#121212]" : "border-slate-200 bg-white"
      )}>
        <div className="flex items-center gap-4">
          <div className={cn(
            "rounded-2xl p-3",
            isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-900"
          )}>
            <Folder className="w-6 h-6" />
          </div>
          <div>
            <h2 className={cn("text-lg font-semibold", isDark ? "text-white" : "text-slate-900")}>No active projects</h2>
            <p className={cn("mt-2 text-sm", isDark ? "text-zinc-400" : "text-slate-600")}>Create a project to start tracking progress.</p>
          </div>
        </div>
        <Button className={cn(
          "w-fit",
          isDark ? "bg-white text-black hover:bg-slate-200" : "bg-slate-900 text-white hover:bg-slate-800"
        )}>
          Start a project
        </Button>
      </Card>
    </section>
  )
}
