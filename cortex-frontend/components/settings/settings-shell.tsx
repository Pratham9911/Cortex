"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { Search, X } from "lucide-react"
import { SETTINGS_NAV_ITEMS } from "./settings-nav-config"

type Project = {
  project_id: number
  name: string
  current_user_role?: string
}

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [hasProject, setHasProject] = useState(false)

  useEffect(() => {
    setMounted(true)
    setHasProject(!!localStorage.getItem("selected_project_id"))
  }, [])

  const isDark = mounted && theme === "dark"

  const settingsItems = SETTINGS_NAV_ITEMS.filter((item) => item.group === "settings")
  const customizeItems = SETTINGS_NAV_ITEMS.filter((item) => item.group === "customize")
  const adminItems = SETTINGS_NAV_ITEMS.filter((item) => item.group === "admin" && hasProject)

  const navLink = (href: string, label: string, Icon: React.ElementType, isAdmin = false) => {
    const isActive = pathname === href || pathname.startsWith(`${href}/`)
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all text-left",
          isActive
            ? isAdmin
              ? "bg-sky-500/20 border border-sky-500/40 text-sky-300 font-semibold"
              : "bg-zinc-800 text-white font-semibold shadow-sm"
            : isAdmin
              ? "text-sky-400 hover:bg-sky-500/10"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <span>{label}</span>
      </Link>
    )
  }

  return (
    <div
      className={cn(
        "flex h-[100dvh] w-full overflow-hidden font-sans",
        isDark ? "bg-[#0d0f14] text-white" : "bg-[#f8f9fc] text-slate-900"
      )}
    >
      <aside className="hidden md:flex w-[240px] shrink-0 flex-col border-r border-zinc-800/80 bg-[#161822] p-4 space-y-6 overflow-y-auto dark-scroll">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search"
            className="w-full rounded-lg bg-[#0d0e14] border border-zinc-800 pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>

        <div className="space-y-1">
          <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Settings</p>
          {settingsItems.map((item) => navLink(item.href, item.label, item.icon))}
          {adminItems.map((item) => navLink(item.href, item.label, item.icon, true))}
        </div>

        <div className="space-y-1">
          <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Customize</p>
          {customizeItems.map((item) => navLink(item.href, item.label, item.icon))}
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto dark-scroll">
        <div className="h-full p-6 md:p-8">{children}</div>
      </main>

      <button
        onClick={() => router.push("/dashboard")}
        className="fixed top-4 right-4 z-50 md:hidden p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
        aria-label="Close settings"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
