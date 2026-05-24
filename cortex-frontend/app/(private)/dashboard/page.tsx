"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { Folder, FileText, Activity, User } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/protected-route"

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [projectName, setProjectName] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
    const selectedProjectId = localStorage.getItem("selected_project_id")
    if (!selectedProjectId) {
      router.push("/workspace")
      return
    }
    setProjectName(localStorage.getItem("selected_project_name"))
  }, [])

  const isDark = mounted && theme === "dark"

  return (
    <section className="space-y-8">
      <div
        className={cn(
          "rounded-3xl border p-8 overflow-hidden transition-all duration-300",
          isDark ? "border-white/5 bg-[#121212]" : "border-slate-200 bg-white"
        )}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <p className={cn("text-xs uppercase tracking-[0.35em] font-semibold", isDark ? "text-zinc-400" : "text-zinc-500")}>
              Overview
            </p>
            <h1 className={cn("text-3xl sm:text-4xl font-extrabold tracking-tight", isDark ? "text-white" : "text-slate-900")}>
              Welcome back, {user?.name || "Cortex creator"}
            </h1>
            <p className={cn("max-w-2xl leading-relaxed", isDark ? "text-zinc-400" : "text-slate-600")}>
              Cortex is ready. Use the sidebar to move between dashboard, analytics, reports, documents, projects, teams, and trash.
            </p>
            <p className={cn("text-sm font-semibold", isDark ? "text-sky-300" : "text-sky-700")}>
              Active project: {projectName || "Selected project"}
            </p>
          </div>
          <div className={cn("rounded-3xl border p-5 min-w-[260px]", isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50")}>
            <p className={cn("text-xs uppercase tracking-[0.35em] font-semibold", isDark ? "text-zinc-400" : "text-zinc-500")}>
              Active user
            </p>
            <p className={cn("mt-2 text-lg font-semibold truncate", isDark ? "text-white" : "text-slate-900")}>
              {user?.email || "user@example.com"}
            </p>
            <p className={cn("mt-1 text-sm", isDark ? "text-zinc-400" : "text-slate-600")}>Your secure workspace is live.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {[
          { title: "Projects", value: "0", icon: Folder, description: "Create and manage your next launch." },
          { title: "Documents", value: "0", icon: FileText, description: "Store your knowledge and assets." },
          { title: "Analytics", value: "0", icon: Activity, description: "Track usage, trends, and velocity." },
          { title: "Team", value: user?.name ? user.name.charAt(0).toUpperCase() : "C", icon: User, description: "Your profile and collaboration center." },
        ].map((item) => (
          <Card
            key={item.title}
            className={cn(
              "p-6 rounded-3xl border shadow-sm transition-all duration-300",
              isDark ? "border-white/5 bg-[#121212]" : "border-slate-200 bg-white"
            )}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className={cn("text-xs uppercase tracking-[0.35em] text-zinc-500 font-semibold")}>{item.title}</p>
                <p className={cn("mt-3 text-3xl font-extrabold", isDark ? "text-white" : "text-slate-900")}>{item.value}</p>
              </div>
              <div className={cn("rounded-2xl p-3", isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-900")}>
                <item.icon className="w-5 h-5" />
              </div>
            </div>
            <p className={cn("mt-4 text-sm", isDark ? "text-zinc-400" : "text-slate-600")}>{item.description}</p>
          </Card>
        ))}
      </div>
    </section>
  )
}
