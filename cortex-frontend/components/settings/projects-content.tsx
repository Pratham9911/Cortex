"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { FolderKanban, Loader2 } from "lucide-react"

interface Project {
  project_id: number
  name: string
  member_count: number
  current_user_role: string
  plan_name?: string
}

function isProject(value: unknown): value is Project {
  if (typeof value !== "object" || value === null) return false
  const project = value as Record<string, unknown>
  return (
    typeof project.project_id === "number" &&
    typeof project.name === "string" &&
    typeof project.member_count === "number" &&
    typeof project.current_user_role === "string" &&
    (project.plan_name === undefined || typeof project.plan_name === "string")
  )
}

export default function ProjectsSettingsContent() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  useEffect(() => {
    let active = true
    const loadProjects = async () => {
      const token = localStorage.getItem("access_token")
      if (!token) {
        if (active) {
          setError("Your session is missing. Please sign in again.")
          setLoading(false)
        }
        return
      }

      try {
        const response = await fetch(`${apiUrl}/getprojects`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          throw new Error(`Could not load your projects (${response.status}).`)
        }
        const data: unknown = await response.json()
        if (!Array.isArray(data) || !data.every(isProject)) {
          throw new Error("The projects response was not in the expected format.")
        }
        if (active) setProjects(data)
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Could not load your projects.")
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadProjects()
    return () => {
      active = false
    }
  }, [apiUrl])

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <header className="border-b border-zinc-800 pb-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
            <FolderKanban className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-white">Projects</h1>
            <p className="mt-1 text-sm text-zinc-400">Projects you are a member of.</p>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-zinc-400">
          <Loader2 className="size-4 animate-spin" /> Loading projects…
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-[#14161d] px-5 py-8 text-center">
          <p className="text-sm font-medium text-zinc-200">No projects yet</p>
          <p className="mt-1 text-xs text-zinc-500">Projects you join will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <button
              key={project.project_id}
              type="button"
              onClick={() => {
                localStorage.setItem("selected_project_id", String(project.project_id))
                localStorage.setItem("selected_project_name", project.name)
                router.push("/dashboard")
              }}
              className="rounded-2xl border border-zinc-800 bg-[#14161d] p-5 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-800/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-white">{project.name}</h2>
                  <p className="mt-2 text-xs capitalize text-zinc-400">
                    {project.current_user_role} · {project.member_count} {project.member_count === 1 ? "member" : "members"}
                  </p>
                </div>
                {project.plan_name && (
                  <span className="shrink-0 rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-300">
                    {project.plan_name}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
