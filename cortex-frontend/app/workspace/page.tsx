"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  BookOpen,
  Code2,
  Cog,
  EllipsisVertical,
  Keyboard,
  Grid3X3,
  HelpCircle,
  Lightbulb,
  List,
  Plus,
  Search,
  Settings,
  Wrench,
  FlaskConical,
  ScrollText,
} from "lucide-react"
import { ProtectedRoute, useAuth } from "@/components/auth/protected-route"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type Project = {
  project_id: number
  name: string
  member_count?: number
  admin_count?: number
  created_at?: string
  current_user_role?: string
  created_by?: {
    user_id: number
    name: string
  }
}

function WorkspaceContent() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [view, setView] = useState<"grid" | "list">("grid")
  const [sortBy, setSortBy] = useState<"name" | "recent">("name")
  const [profileOpen, setProfileOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [creating, setCreating] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

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

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])

  const isDark = mounted ? theme === "dark" : true

  const loadProjects = async () => {
    setLoading(true)
    setError("")
    try {
      const token = localStorage.getItem("access_token")
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const res = await fetch(`${apiUrl}/getprojects`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error("failed")
      const data = await res.json()
      setProjects(Array.isArray(data) ? data : [])
    } catch {
      setError("Could not load projects right now.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  const filteredProjects = useMemo(() => {
    const byName = projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    const sorted = [...byName].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name)
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    })
    return sorted
  }, [projects, query, sortBy])

  const noProjects = !loading && filteredProjects.length === 0

  const openProject = (project: Project) => {
    localStorage.setItem("selected_project_id", String(project.project_id))
    localStorage.setItem("selected_project_name", project.name)
    router.push("/dashboard")
  }

  const createProject = async () => {
    const name = newProjectName.trim()
    if (!name || name.length < 2) {
      setError("Project name must be at least 2 characters.")
      return
    }

    setCreating(true)
    setError("")
    try {
      const token = localStorage.getItem("access_token")
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const res = await fetch(`${apiUrl}/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error("failed")
      setCreateOpen(false)
      setNewProjectName("")
      await loadProjects()
    } catch {
      setError("Could not create project.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className={cn("min-h-screen font-quicksand", isDark ? "bg-[#0d0f14] text-white" : "bg-[#f5f7fb] text-slate-900")} style={{ fontWeight: 400 }}>
      <header className={cn("sticky top-0 z-30 border-b", isDark ? "border-zinc-800/70 bg-[#0d0f14]" : "border-slate-200 bg-white")}>
        <div className="mx-auto flex h-16 max-w-[1800px] items-center justify-between px-3 md:px-5">
          <div className="flex items-center gap-3">
            <Image
              src="/cortex_icon.png"
              alt="Cortex"
              width={28}
              height={28}
              className={cn("object-contain", !isDark && "invert")}
            />
            <p className="text-xl leading-none font-semibold tracking-tight">Cortex</p>
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
            <Button className="hidden md:inline-flex h-6 min-h-6 rounded-md bg-sky-500 px-3 text-xs font-semibold leading-none text-white hover:bg-sky-400">
              Inbox
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
                <DropdownMenuItem>
                  <Plus className="h-4 w-4" /> Inbox
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <HelpCircle className="h-4 w-4" /> Help
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Lightbulb className="h-4 w-4" /> Feedback
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="relative" ref={profileRef}>
              <button onClick={() => setProfileOpen((s) => !s)} className={cn("rounded-full border p-1 overflow-hidden", isDark ? "border-zinc-700" : "border-slate-300")}>
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name || "User Avatar"}
                    className="h-8 w-8 rounded-full object-cover shrink-0"
                    onError={(e) => {
                      e.currentTarget.style.display = "none"
                      const fallback = e.currentTarget.nextElementSibling as HTMLElement
                      if (fallback) fallback.style.display = "flex"
                    }}
                  />
                ) : null}
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                    isDark ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900 text-white"
                  )}
                  style={user?.avatar_url ? { display: "none" } : {}}
                >
                  {user?.name?.slice(0, 2).toUpperCase() || "CX"}
                </span>
              </button>

              {profileOpen && (
                <div className={cn("absolute right-0 mt-2 w-[280px] overflow-hidden rounded-xl border shadow-2xl", isDark ? "border-zinc-700 bg-[#1a1c21]" : "border-slate-200 bg-white")}>
                  <div className="border-b px-5 py-4">
                    <p className="text-lg font-bold">{user?.name || "Cortex User"}</p>
                    <p className={cn("text-sm", isDark ? "text-zinc-300" : "text-slate-600")}>{user?.email || "user@cortex.com"}</p>
                  </div>

                  <div className="space-y-1 border-b p-2">
                    <button className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold", isDark ? "bg-zinc-700/40 text-zinc-100" : "bg-slate-100 text-slate-900")}>
                      <Settings className="h-4 w-4" /> Account preferences
                    </button>
                    <button className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm", isDark ? "text-zinc-300 hover:bg-zinc-800" : "text-slate-700 hover:bg-slate-50")}>
                      <FlaskConical className="h-4 w-4" /> Feature previews
                    </button>
                    <button className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm", isDark ? "text-zinc-300 hover:bg-zinc-800" : "text-slate-700 hover:bg-slate-50")}>
                      <ScrollText className="h-4 w-4" /> Changelog
                    </button>
                  </div>

                  <div className="border-b px-5 py-4">
                    <p className={cn("mb-2 text-sm", isDark ? "text-zinc-400" : "text-slate-500")}>Theme</p>
                    <div className="space-y-1">
                      <button onClick={() => setTheme("dark")} className={cn("block w-full rounded-md px-3 py-2 text-left text-sm", theme === "dark" ? (isDark ? "bg-zinc-700/40 text-white" : "bg-slate-100 text-slate-900") : (isDark ? "text-zinc-300 hover:bg-zinc-800" : "text-slate-700 hover:bg-slate-50"))}>
                        Dark
                      </button>
                      <button onClick={() => setTheme("light")} className={cn("block w-full rounded-md px-3 py-2 text-left text-sm", theme === "light" ? (isDark ? "bg-zinc-700/40 text-white" : "bg-slate-100 text-slate-900") : (isDark ? "text-zinc-300 hover:bg-zinc-800" : "text-slate-700 hover:bg-slate-50"))}>
                        Light
                      </button>
                    </div>
                  </div>

                  <button onClick={logout} className={cn("w-full px-5 py-4 text-left text-base", isDark ? "text-zinc-100 hover:bg-zinc-800" : "text-slate-900 hover:bg-slate-50")}>
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="px-3 md:px-7 pt-6 md:pt-10 pb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>

        <div className="mt-4 md:mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full md:w-auto">
            <div className="relative">
              <Search className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2", isDark ? "text-zinc-500" : "text-slate-500")} />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a project"
                className={cn("h-10 w-full sm:w-[430px] rounded-xl pl-10 text-sm", isDark ? "border-zinc-700 bg-[#14161d] text-zinc-100 placeholder:text-zinc-500" : "border-slate-300 bg-white")}
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "name" | "recent")}
              className={cn("h-10 rounded-xl border px-4 text-sm font-semibold w-full sm:w-auto", isDark ? "border-zinc-700 bg-[#14161d] text-zinc-100" : "border-slate-300 bg-white text-slate-800")}
            >
              <option value="name">Sorted by name</option>
              <option value="recent">Recently created</option>
            </select>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <Button
              variant="outline"
              onClick={() => setView("grid")}
              className={cn("h-10 w-10 rounded-xl p-0", isDark ? "border-zinc-700 bg-[#14161d] text-zinc-200 hover:bg-zinc-800" : "", view === "grid" && "ring-1 ring-zinc-400")}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => setView("list")}
              className={cn("h-10 w-10 rounded-xl p-0", isDark ? "border-zinc-700 bg-[#14161d] text-zinc-200 hover:bg-zinc-800" : "", view === "list" && "ring-1 ring-zinc-400")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="h-10 rounded-xl bg-[#009f5c] px-4 md:px-6 text-sm font-semibold text-white hover:bg-[#00b166]">
              <Plus className="mr-2 h-4 w-4" /> New project
            </Button>
          </div>
        </div>

        {error && <p className="mt-4 text-base text-red-400">{error}</p>}

        {loading ? (
          <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Card key={i} className={cn("h-[260px] animate-pulse rounded-xl border", isDark ? "border-zinc-700 bg-[#14161d]" : "border-slate-200 bg-slate-100")} />
            ))}
          </div>
        ) : noProjects ? (
          <div className={cn(
            "mt-10 rounded-3xl border border-dashed px-8 py-12 text-center",
            isDark ? "border-zinc-700 bg-[#111318]" : "border-slate-200 bg-white"
          )}>
            <div className="mx-auto max-w-md">
              <Image
                src="/illustraions/empty_box.svg"
                alt="No projects yet"
                width={180}
                height={180}
                className="mx-auto"
              />
              <h2 className={cn("mt-8 text-2xl font-semibold", isDark ? "text-white" : "text-slate-900")}>No projects yet</h2>
              <p className={cn("mt-3 text-sm leading-6", isDark ? "text-zinc-400" : "text-slate-600")}>Create or join a project to start collaborating and building in Cortex.</p>
            </div>
          </div>
        ) : view === "grid" ? (
          <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <Card
                key={project.project_id}
                onClick={() => openProject(project)}
                className={cn("cursor-pointer rounded-xl border p-5 transition-all hover:-translate-y-0.5", isDark ? "border-zinc-700 bg-[#171920] hover:border-zinc-500" : "border-slate-200 bg-white hover:border-slate-400")}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xl font-semibold tracking-tight">{project.name}</p>
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-widest", isDark ? "bg-zinc-800 text-zinc-200" : "bg-slate-100 text-slate-700")}>
                      {(project.current_user_role || "member").toUpperCase()}
                    </span>
                    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-widest", isDark ? "bg-zinc-100 text-zinc-900" : "bg-white border border-slate-300 text-slate-700")}>
                      FREE
                    </span>
                  </div>
                </div>
                <p className={cn("mt-3 text-sm", isDark ? "text-zinc-300" : "text-slate-700")}>
                  Members {project.member_count ?? 0} | Admin {project.admin_count ?? 0}
                </p>
                <p className={cn("mt-1 text-sm", isDark ? "text-zinc-400" : "text-slate-600")}>
                  created by : {project.created_by?.name || "Unknown"}
                </p>
              </Card>
            ))}
          </div>
        ) : (
          <Card className={cn("mt-7 rounded-xl border", isDark ? "border-zinc-700 bg-[#171920]" : "border-slate-200 bg-white")}>
            <div className="overflow-x-auto">
              <div className="min-w-[780px]">
                <div className={cn("grid grid-cols-12 px-5 py-3 text-sm font-semibold", isDark ? "bg-[#14161d] text-zinc-400" : "bg-slate-100 text-slate-600")}>
                  <div className="col-span-3">Project</div>
                  <div className="col-span-2">Created By</div>
                  <div className="col-span-2">Members</div>
                  <div className="col-span-2">Admins</div>
                  <div className="col-span-2">Plan</div>
                  <div className="col-span-1">Created At</div>
                </div>
                {filteredProjects.map((project) => (
                  <div
                    key={project.project_id}
                    onClick={() => openProject(project)}
                    className={cn("grid grid-cols-12 items-center border-t px-5 py-4 text-sm cursor-pointer", isDark ? "border-zinc-700 hover:bg-zinc-800/40" : "border-slate-200 hover:bg-slate-50")}
                  >
                    <div className="col-span-3 font-semibold">{project.name}</div>
                    <div className="col-span-2">{project.created_by?.name || "Unknown"}</div>
                    <div className="col-span-2">{project.member_count ?? 0}</div>
                    <div className="col-span-2">{project.admin_count ?? 0}</div>
                    <div className="col-span-2">
                      <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-widest", isDark ? "bg-zinc-100 text-zinc-900" : "bg-white border border-slate-300 text-slate-700")}>
                        FREE
                      </span>
                    </div>
                    <div className="col-span-1">{project.created_at ? new Date(project.created_at).toLocaleDateString() : "N/A"}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className={cn("sm:max-w-md font-quicksand", isDark ? "border-zinc-700 bg-[#171920] text-white" : "")} style={{ fontWeight: 400 }}>
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Create new project</DialogTitle>
            <DialogDescription className={cn(isDark ? "text-zinc-400" : "text-slate-600")}>
              Give your project a clear name. You can rename it later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className={cn("text-sm font-semibold", isDark ? "text-zinc-300" : "text-slate-700")}>Project name</label>
            <Input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="e.g. cortex-db"
              className={cn(isDark ? "border-zinc-700 bg-[#111318] text-white placeholder:text-zinc-500" : "")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createProject} disabled={creating} className="bg-sky-500 text-white hover:bg-sky-400">
              {creating ? "Creating..." : "Create project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CommandDialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        className={cn("sm:max-w-[860px] font-quicksand", isDark ? "border-zinc-700 bg-[#1b1d23] text-zinc-100" : "bg-white")}
        title="Search Commands"
        description="Run a command or search..."
        style={{ fontWeight: 400 }}
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
    </main>
  )
}

export default function WorkspacePage() {
  return (
    <ProtectedRoute>
      <WorkspaceContent />
    </ProtectedRoute>
  )
}
