"use client"

import React, { useState, useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/protected-route"
import { cn } from "@/lib/utils"
import {
  Search, Inbox, Bell, LayoutGrid, BarChart3, LineChart,
  Bot, FileText, Receipt, Building2, Trash2, Sparkles,
  Sliders, Moon, Sun, Palette, HelpCircle, ChevronsUpDown,
  PanelLeftClose, PanelLeftOpen, LogOut, User, X, Settings
} from "lucide-react"

interface SidebarProps {
  isCollapsed: boolean
  setIsCollapsed: (v: boolean) => void
  isMobileOpen: boolean
  setIsMobileOpen: (v: boolean) => void
  agentMode?: boolean
}

const MENU_ITEMS = [
  { id: "Dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "Analytics", label: "Analytics", icon: BarChart3 },
  { id: "Reporting", label: "Reporting", icon: LineChart },
  { id: "Agent", label: "AI Agent", icon: Bot },
  { id: "Documents", label: "Documents", icon: FileText },
  { id: "Projects", label: "Projects", icon: Receipt },
  { id: "ProjectSettings", label: "Project settings", icon: Settings },
  { id: "Teams", label: "Teams", icon: Building2 },
  { id: "Trash", label: "Trash", icon: Trash2 },
]

/* ─── Shared inner content used by both desktop & mobile ─── */
function SidebarContent({
  isCollapsed,
  setIsCollapsed,
  setIsMobileOpen,
}: {
  isCollapsed: boolean
  setIsCollapsed: (v: boolean) => void
  setIsMobileOpen: (v: boolean) => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [active, setActive] = useState("Dashboard")
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  // Close popup on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // Close profile popup when sidebar collapses
  useEffect(() => {
    if (isCollapsed) setProfileOpen(false)
  }, [isCollapsed])

  const isDark = mounted && theme === "dark"

  const divider = isDark ? "bg-zinc-800" : "bg-zinc-200"
  const navText = isDark ? "text-zinc-300" : "text-zinc-600"
  const activeCard = isDark
    ? "bg-[#26262b] border border-zinc-700 text-white"
    : "bg-zinc-100 border border-zinc-200 text-zinc-900"
  const hoverRow = isDark
    ? "hover:bg-[#26262b] hover:text-white"
    : "hover:bg-zinc-100 hover:text-zinc-900"
  const badgeBg = isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"

  const handleNav = (id: string) => {
    setActive(id)
    const routeMap: Record<string, string> = {
      Dashboard: localStorage.getItem("selected_project_id") ? "/dashboard" : "/workspace",
      Analytics: "/analytics",
      Reporting: "/reports",
      Agent: "/ai-agent",
      Documents: "/documents",
      Projects: "/projects",
      ProjectSettings: "/project-settings",
      Teams: "/teams",
      Trash: "/trash",
    }
    const target = routeMap[id]
    if (target) {
      router.push(target)
    }
    setIsMobileOpen(false)
  }

  useEffect(() => {
    if (pathname.startsWith("/teams")) {
      setActive("Teams")
      return
    }
    if (pathname.startsWith("/dashboard")) {
      setActive("Dashboard")
      return
    }
    if (pathname.startsWith("/analytics")) {
      setActive("Analytics")
      return
    }
    if (pathname.startsWith("/reports")) {
      setActive("Reporting")
      return
    }
    if (pathname.startsWith("/ai-agent")) {
      setActive("Agent")
      return
    }
    if (pathname.startsWith("/documents")) {
      setActive("Documents")
      return
    }
    if (pathname.startsWith("/projects")) {
      setActive("Projects")
      return
    }
    if (pathname.startsWith("/project-settings")) {
      setActive("ProjectSettings")
      return
    }
    if (pathname.startsWith("/trash")) {
      setActive("Trash")
      return
    }
    setActive("Dashboard")
  }, [pathname])

  const handleProfileTrigger = () => {
    if (isCollapsed) {
      setIsCollapsed(false)
    }
    setProfileOpen((open) => !open)
  }

  /* ── Generic nav row ──
   * Key design: icon is always in a fixed 16px box on the left.
   * The label sits in an overflow-hidden container. When collapsed,
   * the parent's width is just 44px (icon + padding) so text is
   * naturally clipped – NO max-w / opacity transition on the text.
   * This prevents any icon shifting during collapse/expand. */
  const NavRow = ({
    id, label, icon: Icon, badge, onClick,
  }: {
    id: string; label: string; icon: React.ElementType; badge?: string; onClick?: () => void
  }) => {
    const isActive = active === id
    return (
      <button
        onClick={onClick ?? (() => handleNav(id))}
        title={isCollapsed ? label : undefined}
        className={cn(
          "w-full flex items-center gap-3 rounded-lg px-2.5 h-9 text-xs font-semibold transition-colors duration-150 outline-none",
          isActive ? activeCard : cn(navText, hoverRow)
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {badge && (
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0",
            badgeBg
          )}>
            {badge}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="h-full flex flex-col justify-between">

      {/* ── TOP ── */}
      <div className="flex flex-col gap-3">

        {/* Logo + collapse toggle */}
        <div className="flex items-center h-8 overflow-hidden">
          {/* Left cluster: logo + brand name */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="relative w-7 h-7 rounded-lg overflow-hidden shrink-0 border border-zinc-400/20 hover:opacity-80 transition-all ml-[2px]"
              title={isCollapsed ? "Open sidebar" : "Collapse sidebar"}
            >
              <Image
                src="/cortex_icon.png"
                alt="Cortex"
                fill
                className={cn("object-contain", !isDark && "invert")}
              />
            </button>
            <button
              onClick={() => {
                router.push("/workspace")
                setIsMobileOpen(false)
              }}
              className={cn(
                "overflow-hidden whitespace-nowrap font-extrabold text-sm tracking-tight hover:opacity-80 truncate",
                isDark ? "text-white" : "text-zinc-950",
                isCollapsed && "hidden"
              )}
            >
              Cortex
            </button>
          </div>
          {/* Right: collapse/expand icon */}
          {!isCollapsed && (
            <button
              onClick={() => {
                setIsCollapsed(true)
                setProfileOpen(false)
              }}
              title="Collapse"
              className={cn(
                "p-1.5 rounded-md border shrink-0 transition-colors hover:opacity-80",
                isDark ? "border-zinc-700 text-zinc-400" : "border-zinc-200 text-zinc-500"
              )}
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick search */}
        <button className={cn(
          "flex h-9 items-center gap-3 rounded-lg border px-2.5 text-xs font-medium transition-colors",
          isDark
            ? "bg-[#26262b] border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:bg-[#2d2d33]"
            : "bg-zinc-50 border-zinc-200 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
        )}>
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Quick search</span>
        </button>

        {/* Inbox + Notifications */}
        <div className="flex flex-col gap-0.5">
          <NavRow id="Inbox" label="Inbox" icon={Inbox} badge="12" onClick={() => handleNav("Inbox")} />
          <NavRow id="Notifications" label="Notifications" icon={Bell} badge="15+" onClick={() => handleNav("Notifications")} />
        </div>

        {/* Divider + Menu label */}
        <div>
          <div className={cn("h-px w-full", divider)} />
          <p className={cn(
            "text-[10px] font-bold uppercase tracking-widest text-zinc-500 mt-2.5 mb-1 px-1 truncate whitespace-nowrap transition-opacity",
            isCollapsed && "opacity-0"
          )}>Menu</p>
        </div>

        {/* Main nav */}
        <div className="flex flex-col gap-0.5">
          {MENU_ITEMS.map(item => <NavRow key={item.id} {...item} />)}
        </div>
      </div>

      {/* ── BOTTOM — only profile row shown by default ── */}
      <div className="flex flex-col gap-2">

        <div className={cn("h-px w-full", divider)} />

        {/* Profile row + popup anchor */}
        <div className="relative" ref={profileRef}>

          {/* Popup — slides up on click */}
          {profileOpen && (
            <div className={cn(
              "absolute bottom-[calc(100%+6px)] left-0 right-0 rounded-xl border z-50 overflow-hidden",
              "animate-in fade-in slide-in-from-bottom-2 duration-200",
              isDark ? "bg-[#1a1a1d] border-zinc-700" : "bg-white border-zinc-200"
            )}>
              {/* User info header */}
              <div className={cn("px-3 py-2.5 border-b", isDark ? "border-zinc-700/60" : "border-zinc-100")}>
                <p className={cn("text-xs font-bold truncate", isDark ? "text-white" : "text-zinc-900")}>{user?.name}</p>
                <p className="text-[9px] text-zinc-500 truncate">{user?.email}</p>
              </div>

              {/* Settings rows */}
              <div className="p-1.5 flex flex-col gap-0.5">
                <NavRow id="Preferences" label="Preferences" icon={Sliders} />
                <NavRow
                  id="DarkMode"
                  label="Dark mode"
                  icon={isDark ? Sun : Moon}
                  onClick={() => setTheme(isDark ? "light" : "dark")}
                />
                <NavRow id="Themes" label="Themes" icon={Palette} />
                <NavRow id="Help" label="Help" icon={HelpCircle} />
              </div>

              {/* Upgrade card */}
              <div className={cn(
                "mx-1.5 mb-1.5 p-3 rounded-lg border flex flex-col gap-2",
                isDark ? "bg-[#1e1e2e] border-indigo-900/50" : "bg-indigo-50/60 border-indigo-100"
              )}>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-500/15">
                    <Sparkles className="w-3 h-3 text-indigo-500" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Current plan</p>
                    <p className={cn("text-[11px] font-extrabold", isDark ? "text-white" : "text-zinc-900")}>Pro trial</p>
                  </div>
                </div>
                <button className={cn(
                  "w-full h-7 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 border transition-all",
                  isDark ? "bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700" : "bg-white border-zinc-200 text-zinc-900 hover:bg-zinc-50"
                )}>
                  <Sparkles className="w-3 h-3 text-indigo-500" /> Upgrade to Pro
                </button>
              </div>

              {/* Sign out / profile settings */}
              <div className={cn("border-t p-1.5 flex flex-col gap-0.5", isDark ? "border-zinc-700/60" : "border-zinc-100")}>
                <button
                  onClick={() => setProfileOpen(false)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-zinc-500/10",
                    isDark ? "text-zinc-300 hover:text-white" : "text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  <User className="w-3.5 h-3.5" /> Profile Settings
                </button>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-red-500/10 text-red-500"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            </div>
          )}

          {/* Profile trigger button wrapper — fixed height prevents vertical jumping */}
          <div className="h-12 flex items-center w-full">
            <button
              onClick={handleProfileTrigger}
              title={isCollapsed ? (user?.name ?? "Profile") : undefined}
              className={cn(
                "w-full flex items-center gap-2.5 transition-all duration-300",
                isCollapsed ? "rounded-full border-transparent h-9 px-1" : "rounded-xl border h-12 pl-1 pr-1",
                profileOpen
                  ? isDark ? "bg-[#26262b] border-zinc-600 text-white" : "bg-zinc-100 border-zinc-300 text-zinc-900"
                  : isDark ? "bg-[#1e1e21] border-zinc-800 hover:bg-[#26262b] hover:border-zinc-700 text-white"
                    : "bg-white border-zinc-200 hover:bg-zinc-50 text-zinc-900"
              )}
            >
              {/* Avatar — always in same spot */}
              <span className="shrink-0">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name || "User Avatar"}
                    className="w-7 h-7 rounded-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none"
                      const fallback = e.currentTarget.nextElementSibling as HTMLElement
                      if (fallback) fallback.style.display = "flex"
                    }}
                  />
                ) : null}
                <span
                  className="w-7 h-7 rounded-full bg-zinc-600 text-white text-[11px] font-extrabold flex items-center justify-center select-none uppercase"
                  style={user?.avatar_url ? { display: "none" } : {}}
                >
                  {user?.name ? user.name.slice(0, 2) : "CX"}
                </span>
              </span>

              {/* Name + plan — disappears instantly when collapsed */}
              <span className={cn("flex flex-col min-w-0 flex-1 overflow-hidden text-left", isCollapsed && "hidden")}>
                <span className="text-xs font-extrabold truncate leading-tight">
                  {user?.name ?? "Cortex User"}
                </span>
                <span className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wide">Pro trial</span>
              </span>

              {/* Chevron — also just clips away */}
              <ChevronsUpDown className={cn(
                "w-3.5 h-3.5 shrink-0 text-zinc-400",
                profileOpen && "rotate-180",
                isCollapsed && "hidden"
              )} />
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

/* ─── Main export ─── */
export function Sidebar({ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen, agentMode = false }: SidebarProps) {
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [hoverExpanded, setHoverExpanded] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const isDark = mounted && theme === "dark"

  const effectiveCollapsed = agentMode ? !hoverExpanded : isCollapsed
  const desktopWidth = agentMode
    ? hoverExpanded ? "w-[260px]" : "w-[60px]"
    : isCollapsed ? "w-[60px]" : "w-[260px]"

  useEffect(() => {
    if (!isMobileOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [isMobileOpen])

  const panelClass = cn(
    "h-full flex flex-col overflow-hidden p-3 font-quicksand",
    isDark ? "bg-[#121215] border-zinc-800" : "bg-[#f7f7f8] border-zinc-200"
  )

  return (
    <>
      {/* Desktop fixed panel */}
      <aside
        onMouseEnter={agentMode ? () => setHoverExpanded(true) : undefined}
        onMouseLeave={agentMode ? () => setHoverExpanded(false) : undefined}
        className={cn(
          "hidden md:block fixed top-0 left-0 h-screen overflow-hidden border-r transition-[width] duration-300 ease-in-out",
          desktopWidth,
          agentMode && hoverExpanded ? "z-50 shadow-2xl" : "z-40",
          isDark ? "border-zinc-800" : "border-zinc-200"
        )}
      >
        <div className={panelClass} style={{ height: "100vh", fontWeight: 400 }}>
          <SidebarContent
            isCollapsed={effectiveCollapsed}
            setIsCollapsed={setIsCollapsed}
            setIsMobileOpen={setIsMobileOpen}
          />
        </div>
      </aside>

      {/* Mobile drawer overlay */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex overscroll-none">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileOpen(false)} />
          <aside className={cn(
            "relative z-10 w-[260px] h-full overflow-y-scroll overscroll-contain touch-pan-y animate-in slide-in-from-left duration-200",
            isDark ? "bg-[#121215]" : "bg-[#f7f7f8]"
          )}>
            <button
              onClick={() => setIsMobileOpen(false)}
              className={cn(
                "absolute top-3 right-3 p-1.5 rounded-md border z-20",
                isDark ? "border-zinc-700 text-zinc-400" : "border-zinc-200 text-zinc-500"
              )}
            >
              <X className="w-4 h-4" />
            </button>
            <div className="h-full p-3 overflow-y-scroll overscroll-contain touch-pan-y" style={{ fontWeight: 400 }}>
              <SidebarContent isCollapsed={false} setIsCollapsed={() => { }} setIsMobileOpen={setIsMobileOpen} />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
