"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { Menu } from "lucide-react"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { Sidebar } from "@/components/layout/sidebar"
import { CortexCommandSearch } from "@/components/search/cortex-command-search"
import { InboxControllerProvider, useInboxController } from "@/components/inbox/inbox-dialog"
import { cn } from "@/lib/utils"

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAgentRoute = pathname.startsWith("/ai-agent")
  const isSettingsRoute = pathname.startsWith("/settings")
  const isTeamDetailRoute = pathname.startsWith("/teams/")
  const isInboxRoute = pathname.startsWith("/inbox")
  const isFullPageRoute = isAgentRoute || isSettingsRoute || isTeamDetailRoute
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [projectName, setProjectName] = useState("Project")
  const [commandOpen, setCommandOpen] = useState(false)
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0)
  const preFullPageCollapsedRef = useRef<boolean | null>(null)
  const { theme } = useTheme()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL!
  const inbox = useInboxController({ apiUrl })

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem("sidebar_collapsed")
    const selectedProjectName = localStorage.getItem("selected_project_name")
    if (saved !== null) {
      setIsCollapsed(saved === "true")
    }
    if (selectedProjectName) {
      setProjectName(selectedProjectName)
    }
  }, [])

  useEffect(() => {
    const loadNotificationCount = async () => {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      if (!token || !projectId) return setNotificationUnreadCount(0)
      try {
        const response = await fetch(`${apiUrl}/projects/${projectId}/notifications?unread_only=true`, { headers: { Authorization: `Bearer ${token}` } })
        const data = await response.json().catch(() => ({}))
        setNotificationUnreadCount(response.ok ? (data.unread_count || 0) : 0)
      } catch { setNotificationUnreadCount(0) }
    }
    void loadNotificationCount()
  }, [apiUrl, pathname])

  useEffect(() => {
    if (isFullPageRoute) {
      if (preFullPageCollapsedRef.current === null) {
        preFullPageCollapsedRef.current = isCollapsed
      }
      if (!isCollapsed) {
        setIsCollapsed(true)
      }
      setIsMobileOpen(false)
      return
    }
    if (preFullPageCollapsedRef.current !== null) {
      setIsCollapsed(preFullPageCollapsedRef.current)
      preFullPageCollapsedRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to route changes
  }, [isFullPageRoute])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setCommandOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  const handleSetCollapsed = (collapsed: boolean) => {
    setIsCollapsed(collapsed)
    localStorage.setItem("sidebar_collapsed", String(collapsed))
  }

  const isDark = mounted && theme === "dark"
  const sidebarOffset = isFullPageRoute || isCollapsed ? 68 : 260

  return (
    <ProtectedRoute>
      <InboxControllerProvider controller={inbox}>
      <div
        className={cn(
          "flex h-dvh min-h-0 overflow-hidden transition-colors duration-300 font-quicksand",
          isDark ? "bg-[#0A0A0A] text-white" : "bg-slate-50 text-slate-900"
        )}
        style={{ fontWeight: 400 }}
      >
        <Sidebar
          isCollapsed={isFullPageRoute ? true : isCollapsed}
          setIsCollapsed={handleSetCollapsed}
          isMobileOpen={isMobileOpen}
          setIsMobileOpen={setIsMobileOpen}
          agentMode={isFullPageRoute}
          unreadInboxCount={inbox.unreadCount}
          unreadNotificationCount={notificationUnreadCount}
          onOpenSearch={() => setCommandOpen(true)}
        />

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden transition-[padding-left] duration-300 ease-in-out",
            "pl-0 md:pl-[var(--sidebar-offset)]"
          )}
          style={{
            "--sidebar-offset": `${mounted ? sidebarOffset : 260}px`,
          } as React.CSSProperties}
        >
          {!isFullPageRoute && (
          <header
            className={cn(
              "sticky top-0 z-30 border-b",
              isDark ? "border-zinc-800/70 bg-[#0d0f14]" : "border-slate-200 bg-white"
            )}
          >
            <div className="mx-auto flex h-16 max-w-[1800px] items-center justify-between px-3 md:px-5">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsMobileOpen(true)}
                  className={cn(
                    "md:hidden p-2 rounded-lg border transition-all",
                    isDark
                      ? "bg-[#1A1A1A] border-white/10 text-zinc-400 hover:text-white"
                      : "bg-white border-slate-200 text-slate-600 hover:text-slate-900"
                  )}
                  aria-label="Open menu drawer"
                >
                  <Menu className="w-4 h-4" />
                </button>
                <span
                  className={cn(
                    "inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-widest uppercase",
                    isDark ? "bg-zinc-800 text-zinc-200" : "bg-slate-100 text-slate-700"
                  )}
                >
                  {projectName}
                </span>
              </div>

              <div />
            </div>
          </header>
          )}

          <main
            className={cn(
              "min-h-0 min-w-0 flex-1",
              isFullPageRoute || isInboxRoute ? "overflow-hidden p-0" : "overflow-auto px-6 py-8"
            )}
          >
            {children}
          </main>

          <CortexCommandSearch
            open={commandOpen}
            onOpenChange={setCommandOpen}
            onOpenInbox={inbox.openInbox}
          />

        </div>
      </div>
      </InboxControllerProvider>
    </ProtectedRoute>
  )
}
