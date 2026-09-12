"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Briefcase, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Project = {
  project_id: number
  name: string
  current_user_role?: string
}

export default function ProjectSettingsPage() {
  const router = useRouter()
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projectNameInput, setProjectNameInput] = useState("")
  const [projectSaving, setProjectSaving] = useState(false)
  const [projectDeleting, setProjectDeleting] = useState(false)
  const [projectError, setProjectError] = useState("")
  const [projectMessage, setProjectMessage] = useState("")

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
  const selectedProjectId =
    typeof window !== "undefined" ? Number(localStorage.getItem("selected_project_id")) : null

  const loadProject = async () => {
    if (!token || !selectedProjectId) return
    setProjectError("")
    try {
      const res = await fetch(`${apiUrl}/getprojects`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        const found = Array.isArray(data)
          ? data.find((p: Project) => p.project_id === selectedProjectId)
          : null
        if (found) {
          setSelectedProject(found)
          setProjectNameInput(found.name)
        }
      }
    } catch (err) {
      console.error("Failed to load project:", err)
    }
  }

  useEffect(() => {
    loadProject()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedProjectId])

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
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Update failed")
      }
      setProjectMessage("Project name updated successfully.")
      await loadProject()
    } catch (err: unknown) {
      setProjectError(err instanceof Error ? err.message : "Failed to update project")
    } finally {
      setProjectSaving(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!selectedProject || !token) return
    if (!confirm(`Delete project '${selectedProject.name}'? This action cannot be undone.`)) return

    setProjectDeleting(true)
    setProjectError("")
    try {
      const res = await fetch(`${apiUrl}/projects/${selectedProject.project_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Delete failed")
      }
      localStorage.removeItem("selected_project_id")
      localStorage.removeItem("selected_project_name")
      router.push("/workspace")
    } catch (err: unknown) {
      setProjectError(err instanceof Error ? err.message : "Failed to delete project")
    } finally {
      setProjectDeleting(false)
    }
  }

  if (!selectedProject) {
    return (
      <div className="p-12 border border-zinc-800/80 rounded-xl bg-[#181a24] text-center text-zinc-500 text-sm">
        No project selected. Select a project from the workspace to manage settings.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-sky-400" /> Admin Project Settings
        </h2>
        <p className="text-xs text-zinc-400 mt-1">
          Manage the private project context. Only project admins can update or delete this project.
        </p>
      </div>

      <div className="bg-[#181a24] border border-zinc-800 rounded-xl p-6 space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Current Project</p>
          <p className="text-2xl font-bold text-white mt-1">{selectedProject.name}</p>
          <p className="text-xs text-zinc-400 mt-1">
            Your Role:{" "}
            <span className="font-semibold text-sky-400">
              {selectedProject.current_user_role || "member"}
            </span>
          </p>
        </div>

        {projectError && (
          <p className="p-3 bg-red-500/10 text-red-400 rounded-lg text-xs">{projectError}</p>
        )}
        {projectMessage && (
          <p className="p-3 bg-emerald-500/10 text-emerald-300 rounded-lg text-xs">{projectMessage}</p>
        )}

        <div className="space-y-4 max-w-md">
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-300">Project Name</Label>
            <Input
              value={projectNameInput}
              onChange={(e) => setProjectNameInput(e.target.value)}
              className="bg-[#0d0e14] border-zinc-800 text-white text-xs"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleUpdateProject}
              disabled={projectSaving || selectedProject.current_user_role !== "admin"}
              className="inline-flex items-center gap-1.5 text-xs"
            >
              <Pencil className="h-3.5 w-3.5" /> {projectSaving ? "Saving..." : "Update Name"}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteProject}
              disabled={projectDeleting || selectedProject.current_user_role !== "admin"}
              className="inline-flex items-center gap-1.5 text-xs"
            >
              <Trash2 className="h-3.5 w-3.5" /> {projectDeleting ? "Deleting..." : "Delete Project"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
