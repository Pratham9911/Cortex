"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { BookOpen, Code2, Cog, EllipsisVertical, HelpCircle, Inbox, Keyboard, Lightbulb, Menu, Plus, Search, Wrench } from "lucide-react"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { Sidebar } from "@/components/layout/sidebar"
import { Button } from "@/components/ui/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InboxDialog, InboxUnreadBadge, useInboxController } from "@/components/inbox/inbox-dialog"
import { cn } from "@/lib/utils"

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAgentRoute = pathname.startsWith("/ai-agent")
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [projectName, setProjectName] = useState("Project")
  const [commandOpen, setCommandOpen] = useState(false)
  const preAgentCollapsedRef = useRef<boolean | null>(null)
  const { theme } = useTheme()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
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
    if (isAgentRoute) {
      if (preAgentCollapsedRef.current === null) {
        preAgentCollapsedRef.current = isCollapsed
      }
      if (!isCollapsed) {
        setIsCollapsed(true)
      }
      return
    }
    if (preAgentCollapsedRef.current !== null) {
      setIsCollapsed(preAgentCollapsedRef.current)
      preAgentCollapsedRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to route changes
  }, [isAgentRoute])

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

  return (
    <ProtectedRoute>
      <div
        className={cn(
          "min-h-screen flex transition-colors duration-300 font-quicksand",
          isDark ? "bg-[#0A0A0A] text-white" : "bg-slate-50 text-slate-900"
        )}
        style={{ fontWeight: 400 }}
      >
        <Sidebar
          isCollapsed={isAgentRoute ? true : isCollapsed}
          setIsCollapsed={handleSetCollapsed}
          isMobileOpen={isMobileOpen}
          setIsMobileOpen={setIsMobileOpen}
          agentMode={isAgentRoute}
        />

        <div
          className={cn(
            "flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out",
            isAgentRoute ? "md:pl-[68px]" : isCollapsed ? "md:pl-[68px]" : "md:pl-[260px]",
            "pl-0"
          )}
        >
          {!isAgentRoute && (
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

              <div className="flex items-center gap-3">
                <button className={cn("hidden md:block text-sm font-medium", isDark ? "text-zinc-200 hover:text-white" : "text-slate-700 hover:text-slate-900")}>Feedback</button>
                <button
                  onClick={() => setCommandOpen(true)}
                  className={cn(
                    "hidden md:flex h-9 items-center gap-2 rounded-full border px-4",
                    isDark ? "border-zinc-700 text-zinc-400 hover:border-zinc-600" : "border-slate-300 text-slate-600"
                  )}
                >
                  <Search className="h-4 w-4" />
                  <span className="text-sm">Search...</span>
                  <span className={cn("text-xs", isDark ? "text-zinc-500" : "text-slate-500")}>Ctrl K</span>
                </button>
                <Button
                  onClick={inbox.openInbox}
                  className="relative hidden md:inline-flex h-9 min-h-9 rounded-full bg-sky-500 px-3 text-xs font-semibold leading-none text-white hover:bg-sky-400"
                  aria-label={`Inbox${inbox.unreadCount ? `, ${inbox.unreadCount} unread` : ""}`}
                >
                  <Inbox className="h-4 w-4" />
                  <InboxUnreadBadge count={inbox.unreadCount} />
                </Button>
                <button className={cn("hidden md:grid h-9 w-9 place-items-center rounded-full border", isDark ? "border-zinc-700 text-zinc-300" : "border-slate-300 text-slate-600")}>
                  <HelpCircle className="h-4 w-4" />
                </button>
                <button className={cn("hidden md:grid h-9 w-9 place-items-center rounded-full border", isDark ? "border-zinc-700 text-zinc-300" : "border-slate-300 text-slate-600")}>
                  <Lightbulb className="h-4 w-4" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className={cn("md:hidden grid h-9 w-9 place-items-center rounded-full border", isDark ? "border-zinc-700 text-zinc-300" : "border-slate-300 text-slate-600")}>
                      <EllipsisVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className={cn("w-48", isDark ? "border-zinc-700 bg-[#1a1c21] text-zinc-100" : "")}>
                    <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setCommandOpen(true)}>
                      <Search className="h-4 w-4" /> Search
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={inbox.openInbox}>
                      <span className="relative">
                        <Inbox className="h-4 w-4" />
                        <InboxUnreadBadge count={inbox.unreadCount} />
                      </span>
                      Inbox
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <HelpCircle className="h-4 w-4" /> Help
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Lightbulb className="h-4 w-4" /> Feedback
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>
          )}

          <main
            className={cn(
              "flex-1 min-h-0",
              isAgentRoute ? "overflow-hidden p-0" : "px-6 py-8"
            )}
          >
            {children}
          </main>

          <CommandDialog
            open={commandOpen}
            onOpenChange={setCommandOpen}
            className={cn("sm:max-w-[860px] font-quicksand", isDark ? "border-zinc-700 bg-[#1b1d23] text-zinc-100" : "bg-white")}
            title="Search Commands"
            description="Run a command or search..."
          >
            <CommandInput placeholder="Run a command or search..." />
            <CommandList className="max-h-[560px]">
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="SHORTCUTS">
                <CommandItem>
                  <Keyboard className="h-4 w-4" />
                  <span>Show all keyboard shortcuts</span>
                  <CommandShortcut>Ctrl /</CommandShortcut>
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="QUERIES">
                <CommandItem>
                  <Code2 className="h-4 w-4" />
                  <span>Run SQL</span>
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="ACTIONS">
                <CommandItem>
                  <Plus className="h-4 w-4" />
                  <span>Create...</span>
                </CommandItem>
                <CommandItem>
                  <Cog className="h-4 w-4" />
                  <span>Configure organization...</span>
                </CommandItem>
                <CommandItem>
                  <Wrench className="h-4 w-4" />
                  <span>Switch project...</span>
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="DOCS">
                <CommandItem>
                  <BookOpen className="h-4 w-4" />
                  <span>Search the docs</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </CommandDialog>

          <InboxDialog controller={inbox} isDark={isDark} />
        </div>
      </div>
    </ProtectedRoute>
  )
}
