"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/protected-route"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Settings, Trash2, Pencil, RefreshCcw } from "lucide-react"

type Project = {
  project_id: number
  name: string
  current_user_role?: string
  created_by?: { name?: string }
  member_count?: number
  admin_count?: number
  created_at?: string
}

export default function ProjectSettingsPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const { user } = useAuth()
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [newName, setNewName] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const isDark = theme === "dark"
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
  const selectedProjectId = typeof window !== "undefined" ? Number(localStorage.getItem("selected_project_id")) : null

  const loadProject = async () => {
    setLoading(true)
    setError("")
    setMessage("")

    if (!token) {
      router.push("/login")
      return
    }

    if (!selectedProjectId) {
      router.push("/workspace")
      return
    }

    try {
      const response = await fetch(`${apiUrl}/getprojects`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error("Failed to load project")
      }

      const data = await response.json()
      const project = Array.isArray(data)
        ? data.find((item) => item.project_id === selectedProjectId)
        : null

      if (!project) {
        setError("Project not found. Please open the project from Workspace.")
        return
      }

      setSelectedProject(project)
      setNewName(project.name)
    } catch (err) {
      setError("Unable to load project. Please refresh.")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProject()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateProject = async () => {
    if (!selectedProject) return
    if (selectedProject.current_user_role !== "admin") {
      setError("Only project admins can update this project.")
      return
    }

    const trimmedName = newName.trim()
    if (!trimmedName) {
      setError("Project name cannot be empty.")
      return
    }

    setSaving(true)
    setError("")
    setMessage("")

    try {
      const response = await fetch(`${apiUrl}/projects/${selectedProject.project_id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmedName }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.detail || "Failed to update project")
      }

      setMessage("Project updated successfully.")
      await loadProject()
    } catch (err) {
      setError((err as Error).message || "Update failed.")
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const deleteProject = async () => {
    if (!selectedProject) return
    if (selectedProject.current_user_role !== "admin") {
      setError("Only project admins can delete this project.")
      return
    }

    const confirmed = window.confirm(`Delete project '${selectedProject.name}'? This cannot be undone.`)
    if (!confirmed) return

    setDeleting(true)
    setError("")
    setMessage("")

    try {
      const response = await fetch(`${apiUrl}/projects/${selectedProject.project_id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.detail || "Failed to delete project")
      }

      localStorage.removeItem("selected_project_id")
      localStorage.removeItem("selected_project_name")
      setMessage("Project deleted successfully.")
      router.push("/workspace")
    } catch (err) {
      setError((err as Error).message || "Delete failed.")
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main className={cn("min-h-screen px-4 py-6 md:px-8", isDark ? "bg-[#0d0f14] text-white" : "bg-[#f7f7fb] text-slate-900")}> 
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sky-400">
              <Settings className="h-5 w-5" />
              <h1 className="text-3xl font-semibold">Project Settings</h1>
            </div>
            <p className={cn("mt-2 max-w-2xl text-sm", isDark ? "text-zinc-400" : "text-slate-600")}>Manage the current project in a private project context. Only admins can update or delete this project.</p>
          </div>
          <Button variant="outline" onClick={loadProject} className="inline-flex items-center gap-2">
            <RefreshCcw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr]">
          <Card className={cn("space-y-6 border px-6 py-6", isDark ? "border-zinc-700 bg-[#13161f]" : "border-slate-200 bg-white")}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Current project</p>
                <p className={cn("mt-2 text-2xl font-semibold", isDark ? "text-white" : "text-slate-900")}>{selectedProject?.name || "No project selected"}</p>
                <p className={cn("mt-1 text-sm", isDark ? "text-zinc-400" : "text-slate-600")}>Role: {selectedProject?.current_user_role || "unknown"}</p>
              </div>
              <div className="space-y-2">
                <Button variant="secondary" onClick={() => router.push("/workspace")}>Back to workspace</Button>
              </div>
            </div>

            {error ? (
              <p className="rounded-xl bg-red-500/10 p-3 text-sm text-red-400">{error}</p>
            ) : message ? (
              <p className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="project-name" className={cn(isDark ? "text-zinc-300" : "text-slate-700")}>Project name</Label>
                <Input
                  id="project-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Project name"
                  className={cn(isDark ? "border-zinc-700 bg-[#0f131d] text-white" : "border-slate-300 bg-white text-slate-900")}
                />
              </div>
              <div className="space-y-2">
                <Label className={cn(isDark ? "text-zinc-300" : "text-slate-700")}>Actions</Label>
                <div className="flex flex-col gap-2">
                  <Button onClick={updateProject} disabled={!selectedProject || saving || selectedProject?.current_user_role !== "admin"} className="inline-flex items-center gap-2">
                    <Pencil className="h-4 w-4" /> {saving ? "Saving…" : "Update project"}
                  </Button>
                  <Button variant="destructive" onClick={deleteProject} disabled={!selectedProject || deleting || selectedProject?.current_user_role !== "admin"} className="inline-flex items-center gap-2">
                    <Trash2 className="h-4 w-4" /> {deleting ? "Deleting…" : "Delete project"}
                  </Button>
                </div>
              </div>
            </div>

            {selectedProject && selectedProject.current_user_role !== "admin" ? (
              <p className={cn("text-sm", isDark ? "text-zinc-400" : "text-slate-600")}>You must be a project admin to update or delete this project.</p>
            ) : null}
          </Card>
        </div>
      </div>
    </main>
  )
}
