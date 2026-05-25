"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

type TeamMember = {
  user_id: number
  name: string
  email: string
  avatar_url?: string
}

export default function TeamDetailPage() {
  const params = useParams<{ teamId: string }>()
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const [teamName, setTeamName] = useState("Team")
  const [members, setMembers] = useState<TeamMember[]>([])
  const [error, setError] = useState("")

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return "CX"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  useEffect(() => {
    const load = async () => {
      setError("")
      try {
        const token = localStorage.getItem("access_token")
        const projectId = localStorage.getItem("selected_project_id")
        if (!token || !projectId || !params?.teamId) throw new Error("missing-context")

        const response = await fetch(`${apiUrl}/projects/${projectId}/teams/${params.teamId}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!response.ok) throw new Error("failed")
        const data = await response.json()
        setTeamName(data?.team_name || "Team")
        const fetchedMembers: TeamMember[] = Array.isArray(data?.members) ? data.members : []

        setMembers(fetchedMembers)

        const missingAvatarIds = fetchedMembers.filter((m) => !m.avatar_url).map((m) => m.user_id)
        if (missingAvatarIds.length > 0) {
          const avatarQuery = missingAvatarIds.map((id) => `user_ids=${id}`).join("&")
          const avatarsRes = await fetch(`${apiUrl}/users/avatars?force_refresh=false&${avatarQuery}`, {
            headers: { Authorization: `Bearer ${token}` },
          })

          if (avatarsRes.ok) {
            const avatarData = await avatarsRes.json()
            const avatarMap = (avatarData?.avatars || {}) as Record<string, string | null>
            setMembers(
              fetchedMembers.map((member) => ({
                ...member,
                avatar_url: member.avatar_url || avatarMap[String(member.user_id)] || undefined,
              }))
            )
          }
        }
      } catch {
        setError("Could not load team details.")
      }
    }

    load()
  }, [apiUrl, params?.teamId])

  return (
    <section className="space-y-4">
      <p className={cn("text-xs uppercase tracking-[0.3em]", isDark ? "text-zinc-500" : "text-zinc-500")}>Team</p>
      <h1 className={cn("text-3xl md:text-5xl font-bold tracking-tight", isDark ? "text-white" : "text-zinc-900")}>
        {teamName}
      </h1>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <p className={cn("text-sm", isDark ? "text-zinc-400" : "text-zinc-600")}>
        Members: {members.length}
      </p>

      <Card className={cn("border rounded-2xl p-4", isDark ? "border-zinc-800 bg-[#171920]" : "border-zinc-200 bg-white")}>
        <h2 className={cn("text-base font-semibold mb-3", isDark ? "text-zinc-100" : "text-zinc-900")}>Team Members</h2>
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.user_id}
              className={cn("flex items-center justify-between rounded-xl border px-3 py-2", isDark ? "border-zinc-700 bg-zinc-900/30" : "border-zinc-200 bg-zinc-50")}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-full bg-sky-500 text-white text-[10px] font-bold flex items-center justify-center uppercase overflow-hidden shrink-0">
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt={member.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none"
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement
                        if (fallback) fallback.style.display = "flex"
                      }}
                    />
                  ) : null}
                  <span
                    className="h-full w-full items-center justify-center flex"
                    style={member.avatar_url ? { display: "none" } : {}}
                  >
                    {getInitials(member.name)}
                  </span>
                </span>
                <div className="min-w-0">
                  <p className={cn("text-sm font-semibold truncate", isDark ? "text-zinc-100" : "text-zinc-900")}>{member.name}</p>
                  <p className={cn("text-xs truncate", isDark ? "text-zinc-400" : "text-zinc-600")}>{member.email}</p>
                </div>
              </div>
            </div>
          ))}
          {members.length === 0 && (
            <p className={cn("text-sm", isDark ? "text-zinc-400" : "text-zinc-600")}>No members found.</p>
          )}
        </div>
      </Card>
    </section>
  )
}
