"use client"

import { useTheme } from "next-themes"
import { FileText, FolderOpen } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export default function DocumentsPage() {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">Documents</p>
        <h1 className={cn("mt-3 text-3xl font-extrabold", isDark ? "text-white" : "text-slate-900")}>Manage your files</h1>
      </div>

      <Card className={cn(
        "p-6",
        isDark ? "border-white/5 bg-[#121212]" : "border-slate-200 bg-white"
      )}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className={cn("text-sm text-zinc-500")}>Connected documents</p>
            <p className={cn("mt-3 text-3xl font-extrabold", isDark ? "text-white" : "text-slate-900")}>
              0
            </p>
          </div>
          <div className={cn(
            "rounded-2xl p-3",
            isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-900"
          )}>
            <FolderOpen className="w-6 h-6" />
          </div>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {[
          { title: "Upload file", description: "Bring new content into Cortex." },
          { title: "View folders", description: "Organize project documents." },
        ].map((item) => (
          <Card key={item.title} className={cn(
            "p-6",
            isDark ? "border-white/5 bg-[#121212]" : "border-slate-200 bg-white"
          )}>
            <h2 className={cn("text-lg font-semibold", isDark ? "text-white" : "text-slate-900")}>{item.title}</h2>
            <p className={cn("mt-2 text-sm", isDark ? "text-zinc-400" : "text-slate-600")}>{item.description}</p>
          </Card>
        ))}
      </div>
    </section>
  )
}
