"use client"

import React, { useState, useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/protected-route"
import { ProfileSettingsDialog } from "@/components/settings/profile-settings-dialog"
import { cn } from "@/lib/utils"
import {
  Search, Inbox, Bell, LayoutGrid, BarChart3, LineChart,
  Bot, FileText, Building2, Trash2, Sparkles,
  Sliders, Moon, Sun, HelpCircle, ChevronsUpDown,
  PanelLeftClose, PanelLeftOpen, LogOut, User, X, Settings, ClipboardList,
  ChevronRight,
} from "lucide-react"

interface SidebarProps {
  isCollapsed: boolean
  setIsCollapsed: (v: boolean) => void
  isMobileOpen: boolean
  setIsMobileOpen: (v: boolean) => void
  agentMode?: boolean
  unreadInboxCount?: number
  unreadNotificationCount?: number
  onOpenSearch?: () => void
}

const MENU_ITEMS = [
  { id: "Dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "Analytics", label: "Analytics", icon: BarChart3 },
  { id: "Reporting", label: "Reporting", icon: LineChart },
  { id: "Agent", label: "AI Agent", icon: Bot },
  { id: "Documents", label: "Documents", icon: FileText },
  { id: "Teams", label: "Teams", icon: Building2 },
  { id: "AuditLogs", label: "Audit logs", icon: ClipboardList },
  { id: "Trash", label: "Trash", icon: Trash2 },
  { id: "Settings", label: "Settings", icon: Settings },
]

interface SidebarTeam {
  team_id: number
  name: string
  is_member: boolean
}

/* ─── Shared inner content used by both desktop & mobile ─── */
function SidebarContent({
  isCollapsed,
  setIsCollapsed,
  setIsMobileOpen,
  unreadInboxCount = 0,
  unreadNotificationCount = 0,
  onOpenSearch,
}: {
  isCollapsed: boolean
  setIsCollapsed: (v: boolean) => void
  setIsMobileOpen: (v: boolean) => void
  unreadInboxCount?: number
  unreadNotificationCount?: number
  onOpenSearch?: () => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [active, setActive] = useState("Dashboard")
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false)
  const [teamsExpanded, setTeamsExpanded] = useState(false)
  const [sidebarTeams, setSidebarTeams] = useState<SidebarTeam[]>([])
  const [teamsLoadError, setTeamsLoadError] = useState(false)
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
  const planName = user?.plan_name || "Free"
  const isPro = planName.toUpperCase() === "PRO"
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  useEffect(() => {
    let cancelled = false

    const loadSidebarTeams = async () => {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      if (!token || !projectId) {
        setSidebarTeams([])
        setTeamsLoadError(false)
        return
      }

      try {
        const headers = { Authorization: `Bearer ${token}` }
        const [teamsResponse, projectsResponse] = await Promise.all([
          fetch(`${apiUrl}/projects/${projectId}/teams`, { headers }),
          fetch(`${apiUrl}/getprojects`, { headers }),
        ])
        if (!teamsResponse.ok || !projectsResponse.ok) {
          throw new Error("Failed to load sidebar teams")
        }

        const [teamsData, projectsData] = await Promise.all([
          teamsResponse.json(),
          projectsResponse.json(),
        ])
        const project = Array.isArray(projectsData)
          ? projectsData.find((item: { project_id: number }) => item.project_id === Number(projectId))
          : null
        const isProjectAdmin = project?.current_user_role === "admin"
          || project?.created_by?.user_id === user?.user_id
        const accessibleTeams = (Array.isArray(teamsData) ? teamsData : [])
          .filter((team: SidebarTeam) => isProjectAdmin || team.is_member)
          .map((team: SidebarTeam) => ({
            team_id: team.team_id,
            name: team.name,
            is_member: team.is_member,
          }))

        if (!cancelled) {
          setSidebarTeams(accessibleTeams)
          setTeamsLoadError(false)
        }
      } catch (error) {
        console.error("Could not load teams in the sidebar:", error)
        if (!cancelled) {
          setSidebarTeams([])
          setTeamsLoadError(true)
        }
      }
    }

    void loadSidebarTeams()
    return () => { cancelled = true }
  }, [apiUrl, pathname, user?.user_id])

  const divider = isDark ? "bg-zinc-800" : "bg-zinc-200"
  const navText = isDark ? "text-zinc-300" : "text-zinc-600"
  const activeCard = isDark
    ? "bg-[#26262b] text-white"
    : "bg-zinc-100 text-zinc-950"
  const activeMarker = cn(
    "relative before:absolute before:left-0 before:top-1/4 before:h-1/2 before:w-[3px] before:rounded-r-full before:content-['']",
    isDark ? "before:bg-white" : "before:bg-zinc-900"
  )
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
      AgentInspector: "/agent-inspector",
      Documents: "/documents",
      Projects: "/projects",
      Settings: "/settings",
      Teams: "/teams",
      AuditLogs: "/audit-logs",
      Inbox: "/inbox",
      Notifications: "/notifications",
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
    if (pathname.startsWith("/agent-inspector") || pathname.startsWith("/agent-test")) {
      setActive("AgentInspector")
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
    if (pathname.startsWith("/settings") || pathname.startsWith("/project-settings")) {
      setActive("Settings")
      return
    }
    if (pathname.startsWith("/trash")) {
      setActive("Trash")
      return
    }
    if (pathname.startsWith("/audit-logs")) {
      setActive("AuditLogs")
      return
    }
    if (pathname.startsWith("/inbox")) {
      setActive("Inbox")
      return
    }
    if (pathname.startsWith("/notifications")) {
      setActive("Notifications")
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
          "relative w-full flex items-center gap-3 rounded-lg px-2.5 h-9 text-xs font-semibold transition-colors duration-150 outline-none",
          isActive ? cn(activeCard, activeMarker) : cn(navText, hoverRow)
        )}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {badge && (
          <span className={cn(
            "shrink-0 text-[10px] font-bold",
            id === "Notifications" || id === "Inbox"
              ? "flex size-5 items-center justify-center rounded-full bg-red-500 text-white shadow-sm"
              : cn("rounded px-1.5 py-0.5", badgeBg)
          )}>
            {badge}
          </span>
        )}
      </button>
    )
  }

  const TeamsNavRow = () => {
    const isActive = active === "Teams"
    return (
      <div>
        <div className={cn(
          "group flex h-9 w-full items-center rounded-lg text-xs font-semibold transition-colors duration-150",
          isActive ? cn(activeCard, activeMarker) : cn(navText, hoverRow)
        )}>
          <button
            type="button"
            onClick={() => {
              if (isCollapsed) setIsCollapsed(false)
              setTeamsExpanded((expanded) => !expanded)
            }}
            title={isCollapsed ? "Expand teams" : teamsExpanded ? "Collapse teams" : "Expand teams"}
            aria-label={teamsExpanded ? "Collapse teams" : "Expand teams"}
            aria-expanded={teamsExpanded}
            className="flex h-full w-9 shrink-0 items-center justify-center rounded-l-lg outline-none"
          >
            <Building2 className="h-4 w-4 group-hover:hidden" />
            <ChevronRight className={cn(
              "hidden h-4 w-4 transition-transform group-hover:block",
              teamsExpanded && "rotate-90"
            )} />
          </button>
          {!isCollapsed && (
            <button
              type="button"
              onClick={() => handleNav("Teams")}
              className="h-full min-w-0 flex-1 truncate pr-2 text-left outline-none"
            >
              Teams
            </button>
          )}
        </div>

        {!isCollapsed && teamsExpanded && (
          <div className={cn(
            "ml-[18px] mt-1 max-h-[184px] overflow-y-auto overflow-x-hidden border-l pl-2 sidebar-scroll",
            isDark ? "border-zinc-800" : "border-zinc-200"
          )}>
            {teamsLoadError ? (
              <p className={cn("px-2 py-2 text-[10px]", navText)}>Could not load teams.</p>
            ) : sidebarTeams.length ? (
              <div className="flex flex-col gap-0.5">
                {sidebarTeams.map((team) => (
                  <button
                    key={team.team_id}
                    type="button"
                    onClick={() => {
                      router.push(`/teams/${team.team_id}`)
                      setIsMobileOpen(false)
                    }}
                    title={team.name}
                    className={cn(
                      "h-8 w-full truncate rounded-md px-2 text-left text-xs font-medium transition-colors",
                      pathname === `/teams/${team.team_id}`
                        ? cn(activeCard, activeMarker)
                        : cn(navText, hoverRow)
                    )}
                  >
                    {team.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className={cn("px-2 py-2 text-[10px]", navText)}>No teams available.</p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0">

      {/* ── FIXED TOP: logo, search, inbox ── */}
      <div className="shrink-0 flex flex-col gap-3">

        {/* Logo + collapse toggle */}
        <div className="flex items-center h-8 overflow-hidden">
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
        <button onClick={onOpenSearch} className={cn(
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
          <NavRow id="Inbox" label="Inbox" icon={Inbox} badge={unreadInboxCount > 0 ? String(unreadInboxCount) : undefined} onClick={() => handleNav("Inbox")} />
          <NavRow id="Notifications" label="Notifications" icon={Bell} badge={unreadNotificationCount > 0 ? String(unreadNotificationCount) : undefined} onClick={() => handleNav("Notifications")} />
        </div>

        {/* Divider + Menu label */}
        <div>
          <div className={cn("h-px w-full", divider)} />
          <p className={cn(
            "text-[10px] font-bold uppercase tracking-widest text-zinc-500 mt-2.5 mb-1 px-1 truncate whitespace-nowrap transition-opacity",
            isCollapsed && "opacity-0"
          )}>Menu</p>
        </div>
      </div>

      {/* ── SCROLLABLE: menu items only ── */}
      <div
        className={cn(
          "flex-1 min-h-0 overflow-y-auto overflow-x-hidden sidebar-scroll mt-1 -mr-3",
          isCollapsed && "sidebar-scroll-collapsed"
        )}
      >
        <div className={cn("flex flex-col gap-0.5 pb-1", !isCollapsed && "pr-2")}>
          {MENU_ITEMS.map(item => item.id === "Teams"
            ? <TeamsNavRow key={item.id} />
            : <NavRow key={item.id} {...item} />
          )}
        </div>
      </div>

      {/* ── FIXED BOTTOM: profile ── */}
      <div className="flex flex-col gap-2 shrink-0 pt-2">

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
                <NavRow id="Help" label="Help" icon={HelpCircle} />
              </div>

              {isPro ? (
                <div className={cn(
                  "mx-2 my-2 rounded-xl border p-3",
                  isDark
                    ? "border-violet-300/20 bg-gradient-to-br from-[#262b47] to-[#1d2030]"
                    : "border-[#d8ddeb] bg-gradient-to-br from-[#e4e8f8] to-[#f5f6fb]"
                )}>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full border",
                      isDark ? "border-violet-200/40 bg-[#f8f9ff] text-indigo-600" : "border-[#b9c5e4] bg-white text-indigo-600"
                    )}>
                      <Sparkles className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block text-xs", isDark ? "text-zinc-300" : "text-slate-700")}>Current plan:</span>
                      <span className={cn("block truncate text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>PRO</span>
                    </span>
                  </div>
                </div>
              ) : (
                <div className={cn(
                  "mx-2 my-2 rounded-xl border p-3",
                  isDark
                    ? "border-violet-300/20 bg-gradient-to-br from-[#262b47] to-[#1d2030]"
                    : "border-[#d8ddeb] bg-gradient-to-br from-[#e4e8f8] to-[#f5f6fb]"
                )}>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full border",
                      isDark ? "border-violet-200/40 bg-[#f8f9ff] text-indigo-600" : "border-[#b9c5e4] bg-white text-indigo-600"
                    )}>
                      <Sparkles className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block text-xs", isDark ? "text-zinc-300" : "text-slate-700")}>Current plan:</span>
                      <span className={cn("block truncate text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>{planName}</span>
                    </span>
                  </div>
                  <p className={cn("mt-3 text-sm leading-5", isDark ? "text-zinc-300" : "text-slate-700")}>
                    Upgrade to Pro to get the latest and exclusive features
                  </p>
                  <button
                    onClick={() => {
                      router.push("/settings/billing")
                      setProfileOpen(false)
                    }}
                    className={cn(
                      "mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm font-semibold shadow-sm transition-colors",
                      isDark
                        ? "border-zinc-600 bg-[#f8f9ff] text-zinc-900 hover:bg-white"
                        : "border-[#d2d5dc] bg-white text-slate-900 hover:bg-slate-50"
                    )}
                  >
                    <Sparkles className="size-4 text-indigo-600" /> Upgrade to Pro
                  </button>
                </div>
              )}

              {/* Sign out / profile settings */}
              <div className={cn("border-t p-1.5 flex flex-col gap-0.5", isDark ? "border-zinc-700/60" : "border-zinc-100")}>
                <button
                  onClick={() => {
                    setProfileOpen(false)
                    setProfileSettingsOpen(true)
                  }}
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
              title={isCollapsed ? `${user?.name ?? "Profile"} · ${planName}` : undefined}
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
              <span className="relative shrink-0">
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
                {isCollapsed && (
                  <span className={cn(
                    "absolute -bottom-0.5 -right-1 rounded-sm px-1 text-[6px] font-bold uppercase leading-[10px] ring-1",
                    isPro
                      ? isDark ? "bg-violet-500 text-white ring-[#121215]" : "bg-violet-700 text-white ring-[#f7f7f8]"
                      : isDark ? "bg-zinc-700 text-zinc-100 ring-[#121215]" : "bg-zinc-200 text-zinc-800 ring-[#f7f7f8]"
                  )}>
                    {planName}
                  </span>
                )}
              </span>

              {/* Name + plan — disappears instantly when collapsed */}
              <span className={cn("flex flex-col min-w-0 flex-1 overflow-hidden text-left", isCollapsed && "hidden")}>
                <span className="text-xs font-extrabold truncate leading-tight">
                  {user?.name ?? "Cortex User"}
                </span>
                <span className={cn(
                  "mt-0.5 w-fit rounded-sm px-1 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wide",
                  isPro
                    ? isDark ? "bg-violet-500 text-white" : "bg-violet-700 text-white"
                    : isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-100 text-zinc-600"
                )}>
                  {planName}
                </span>
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
      <ProfileSettingsDialog open={profileSettingsOpen} onOpenChange={setProfileSettingsOpen} />
    </div>
  )
}

/* ─── Main export ─── */
export function Sidebar({ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen, agentMode = false, unreadInboxCount = 0, unreadNotificationCount = 0, onOpenSearch }: SidebarProps) {
  const pathname = usePathname()
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [hoverExpanded, setHoverExpanded] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const isDark = mounted && theme === "dark"

  useEffect(() => {
    setHoverExpanded(false)
  }, [agentMode, pathname])

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
    "h-full flex flex-col overflow-hidden min-h-0 p-3 font-quicksand",
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
        <div
          className={panelClass}
          style={{ height: "100vh", fontWeight: 400, colorScheme: isDark ? "dark" : "light" }}
        >
          <SidebarContent
            isCollapsed={effectiveCollapsed}
            setIsCollapsed={setIsCollapsed}
            setIsMobileOpen={setIsMobileOpen}
            unreadInboxCount={unreadInboxCount}
            unreadNotificationCount={unreadNotificationCount}
            onOpenSearch={onOpenSearch}
          />
        </div>
      </aside>

      {/* Mobile drawer overlay */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex overscroll-none">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileOpen(false)} />
          <aside className={cn(
            "relative z-10 w-[260px] h-full overflow-hidden animate-in slide-in-from-left duration-200",
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
            <div className="h-full p-3 overflow-hidden min-h-0" style={{ fontWeight: 400 }}>
              <SidebarContent isCollapsed={false} setIsCollapsed={() => { }} setIsMobileOpen={setIsMobileOpen} unreadInboxCount={unreadInboxCount} unreadNotificationCount={unreadNotificationCount} onOpenSearch={onOpenSearch} />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
