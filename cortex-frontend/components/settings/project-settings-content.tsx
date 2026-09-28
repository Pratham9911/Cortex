"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Check, FolderKanban, Loader2, LogOut, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/protected-route"

type Project = {
  project_id: number
  name: string
  current_user_role?: string
  created_by?: {
    user_id: number
    name: string
  }
}

export default function ProjectSettingsContent() {
  const router = useRouter()
  const { user } = useAuth()
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projectNameInput, setProjectNameInput] = useState("")
  const [loadingProject, setLoadingProject] = useState(true)
  const [projectSaving, setProjectSaving] = useState(false)
  const [projectDeleting, setProjectDeleting] = useState(false)
  const [projectLeaving, setProjectLeaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [projectError, setProjectError] = useState("")
  const [projectMessage, setProjectMessage] = useState("")

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
  const selectedProjectId =
    typeof window !== "undefined" ? Number(localStorage.getItem("selected_project_id")) : null
  const isAdmin = selectedProject?.current_user_role === "admin"
  const isOwner = selectedProject?.created_by?.user_id === user?.user_id

  const loadProject = async () => {
    if (!token || !selectedProjectId) {
      setSelectedProject(null)
      setLoadingProject(false)
      return
    }

    setProjectError("")
    try {
      const res = await fetch(`${apiUrl}/getprojects`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.detail || "Could not load project settings.")

      const found = Array.isArray(data)
        ? data.find((project: Project) => project.project_id === selectedProjectId)
        : null
      setSelectedProject(found || null)
      setProjectNameInput(found?.name || "")
      if (!found) setProjectError("This project is unavailable or you are no longer a member.")
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "Could not load project settings.")
    } finally {
      setLoadingProject(false)
    }
  }

  useEffect(() => {
    void loadProject()
    // Load the current project when the selected workspace project changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedProjectId])

  const clearSelectedProject = () => {
    localStorage.removeItem("selected_project_id")
    localStorage.removeItem("selected_project_name")
    router.push("/workspace")
  }

  const handleUpdateProject = async () => {
    if (!selectedProject || !token) return
    setProjectSaving(true)
    setProjectError("")
    setProjectMessage("")
    try {
      const res = await fetch(`${apiUrl}/projects/${selectedProject.project_id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: projectNameInput.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || "Could not update project.")

      localStorage.setItem("selected_project_name", projectNameInput.trim())
      setProjectMessage("Project name updated.")
      await loadProject()
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "Could not update project.")
    } finally {
      setProjectSaving(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!selectedProject || !token || deleteConfirmation !== selectedProject.name) return
    setProjectDeleting(true)
    setProjectError("")
    try {
      const res = await fetch(`${apiUrl}/projects/${selectedProject.project_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || "Could not delete project.")

      setDeleteOpen(false)
      clearSelectedProject()
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "Could not delete project.")
    } finally {
      setProjectDeleting(false)
    }
  }

  const handleLeaveProject = async () => {
    if (!selectedProject || !token || isOwner) return
    setProjectLeaving(true)
    setProjectError("")
    try {
      const res = await fetch(`${apiUrl}/projects/${selectedProject.project_id}/leave`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || "Could not leave project.")

      setLeaveOpen(false)
      clearSelectedProject()
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "Could not leave project.")
    } finally {
      setProjectLeaving(false)
    }
  }

  if (loadingProject) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-2xl border border-zinc-800 bg-[#181a24] text-sm text-zinc-400">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading project settings...
      </div>
    )
  }

  if (!selectedProject) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-[#181a24] p-10 text-center">
        <FolderKanban className="mx-auto size-8 text-zinc-500" />
        <p className="mt-3 text-sm font-semibold text-zinc-200">No project selected</p>
        <p className="mt-1 text-xs text-zinc-500">
          Select a project from the workspace to manage its settings.
        </p>
        {projectError && <p className="mt-4 text-xs text-red-400">{projectError}</p>}
        <Button className="mt-5" onClick={() => router.push("/workspace")}>Open workspace</Button>
      </div>
    )
  }

  const canSaveName = isAdmin && projectNameInput.trim().length >= 2 && projectNameInput.trim() !== selectedProject.name

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <header className="border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
            <FolderKanban className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-white">General</h1>
            <p className="mt-1 text-sm text-zinc-400">Manage the name and membership of this project.</p>
          </div>
        </div>
      </header>

      {projectError && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {projectError}
        </div>
      )}
      {projectMessage && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          <Check className="size-4" /> {projectMessage}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#14161d]">
        <div className="border-b border-zinc-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Project details</h2>
          <p className="mt-1 text-xs text-zinc-500">Changes apply to everyone in this project.</p>
        </div>
        <div className="space-y-5 p-5">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_160px]">
            <div className="space-y-2">
              <Label htmlFor="project-name" className="text-xs font-semibold text-zinc-300">Project name</Label>
              <Input
                id="project-name"
                value={projectNameInput}
                onChange={(event) => setProjectNameInput(event.target.value)}
                disabled={!isAdmin || projectSaving}
                maxLength={100}
                className="h-10 border-zinc-700 bg-[#0d0e14] text-sm text-white placeholder:text-zinc-500 focus-visible:ring-sky-500"
              />
              <p className="text-xs text-zinc-500">
                {isAdmin ? "Use a clear name your teammates will recognize." : "Only project admins can change the name."}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-zinc-300">Your role</Label>
              <div className="flex h-10 items-center rounded-lg border border-zinc-700 bg-[#0d0e14] px-3 text-sm capitalize text-zinc-200">
                {selectedProject.current_user_role || "member"}
              </div>
            </div>
          </div>
          {isAdmin && (
            <div className="flex justify-end border-t border-zinc-800 pt-4">
              <Button onClick={handleUpdateProject} disabled={!canSaveName || projectSaving} className="gap-2">
                {projectSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save changes
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-amber-500/30 bg-[#14161d]">
        <div className="border-b border-amber-500/20 px-5 py-4">
          <div className="flex items-center gap-2">
            <LogOut className="size-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-white">Leave project</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Leave if you no longer need access. You can be invited back later.
          </p>
        </div>
        <div className="flex flex-col justify-between gap-4 px-5 py-4 sm:flex-row sm:items-center">
          <p className="max-w-xl text-xs leading-5 text-zinc-400">
            You will lose access to this project and its teams. Your project owner role cannot leave the project.
          </p>
          <Button
            variant="outline"
            onClick={() => setLeaveOpen(true)}
            disabled={isOwner}
            className="shrink-0 gap-2 border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
          >
            <LogOut className="size-4" /> Leave project
          </Button>
        </div>
      </section>

      {isAdmin && (
        <section className="overflow-hidden rounded-2xl border border-red-500/40 bg-[#14161d]">
          <div className="border-b border-red-500/25 px-5 py-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-red-400" />
              <h2 className="text-sm font-semibold text-white">Danger zone</h2>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Deleting a project permanently removes its teams, documents, and project data.
            </p>
          </div>
          <div className="flex flex-col justify-between gap-4 px-5 py-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold text-zinc-200">Delete this project</p>
              <p className="mt-1 text-xs text-zinc-500">This action cannot be undone.</p>
            </div>
            <Button variant="destructive" onClick={() => { setDeleteConfirmation(""); setDeleteOpen(true) }} className="shrink-0 gap-2">
              <Trash2 className="size-4" /> Delete project
            </Button>
          </div>
        </section>
      )}

      <Dialog open={deleteOpen} onOpenChange={(open) => !projectDeleting && setDeleteOpen(open)}>
        <DialogContent className="border-red-500/30 bg-[#15171d] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-red-400" /> Delete project permanently?
            </DialogTitle>
            <DialogDescription className="pt-1 text-zinc-400">
              This will permanently delete the project and its data. To confirm, type{" "}
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono font-semibold text-zinc-100">{selectedProject.name}</span>
              {" "}below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-project-name" className="text-xs text-zinc-300">Project name</Label>
            <Input
              id="confirm-project-name"
              autoComplete="off"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              disabled={projectDeleting}
              className="border-zinc-700 bg-[#0d0e14] text-white"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={projectDeleting}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteProject}
              disabled={projectDeleting || deleteConfirmation !== selectedProject.name}
            >
              {projectDeleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leaveOpen} onOpenChange={(open) => !projectLeaving && setLeaveOpen(open)}>
        <DialogContent className="border-amber-500/30 bg-[#15171d] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave {selectedProject.name}?</DialogTitle>
            <DialogDescription className="pt-1 text-zinc-400">
              You will immediately lose access to this project and all its teams. A project admin can invite you back later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveOpen(false)} disabled={projectLeaving}>Stay in project</Button>
            <Button
              onClick={handleLeaveProject}
              disabled={projectLeaving || isOwner}
              className={cn("bg-amber-600 text-white hover:bg-amber-500")}
            >
              {projectLeaving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Leave project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
