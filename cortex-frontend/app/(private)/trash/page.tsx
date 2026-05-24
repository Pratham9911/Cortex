"use client"

import { useTheme } from "next-themes"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export default function TrashPage() {
  const { theme } = useTheme()
  const isDark = theme === "dark"

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">Trash</p>
        <h1 className={cn("mt-3 text-3xl font-extrabold", isDark ? "text-white" : "text-slate-900")}>Deleted items</h1>
      </div>

      <Card className={cn(
        "p-6 flex flex-col gap-4",
        isDark ? "border-white/5 bg-[#121212]" : "border-slate-200 bg-white"
      )}>
        <div className="flex items-center gap-4">
          <Trash2 className={cn("w-6 h-6", isDark ? "text-white" : "text-slate-900")} />
          <div>
            <h2 className={cn("text-lg font-semibold", isDark ? "text-white" : "text-slate-900")}>Trash is empty</h2>
            <p className={cn("text-sm", isDark ? "text-zinc-400" : "text-slate-600")}>No deleted items yet. Remove unused docs to see them here.</p>
          </div>
        </div>

        <Button className={cn(
          "w-fit",
          isDark ? "bg-white text-black hover:bg-slate-200" : "bg-slate-900 text-white hover:bg-slate-800"
        )}>
          Restore items
        </Button>
      </Card>
    </section>
  )
}
