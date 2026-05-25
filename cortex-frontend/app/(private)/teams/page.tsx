"use client"

import { useEffect, useMemo, useState } from "react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import {
  CalendarDays,
  Loader2,
  LayoutList,
  MessageCircle,
  Plus,
  Search,
  SlidersHorizontal,
  Link2,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

type Team = {
  team_id: number
  name: string
  description: string
  tags?: string[]
  member_count: number
  created_at?: string
}

type TeamMember = {
  user_id: number
  name: string
  email: string
  avatar_url?: string
}

export default function TeamsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const [teams, setTeams] = useState<Team[]>([])
  const [query, setQuery] = useState("")
  const [sortBy, setSortBy] = useState<"name" | "recent">("name")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [openCreate, setOpenCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [teamName, setTeamName] = useState("")
  const [teamDescription, setTeamDescription] = useState("")
  const [teamTags, setTeamTags] = useState("")
  const [teamMembersMap, setTeamMembersMap] = useState<Record<number, TeamMember[]>>({})

  const bg = isDark ? "bg-[#101115]" : "bg-[#f3f4f6]"
  const panel = isDark ? "bg-[#181a20] border-zinc-800" : "bg-white border-zinc-200"
  const muted = isDark ? "text-zinc-400" : "text-zinc-500"
  const strong = isDark ? "text-white" : "text-zinc-900"

  const fetchTeams = async () => {
    setLoading(true)
    setError("")
    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      if (!token || !projectId) throw new Error("missing-context")

      const response = await fetch(`${apiUrl}/projects/${projectId}/teams`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) throw new Error("fetch-failed")
      const data = await response.json()
      const list = Array.isArray(data) ? data : []
      setTeams(list)

      const membersEntries = await Promise.all(
        list.map(async (team: Team) => {
          try {
            const membersRes = await fetch(`${apiUrl}/projects/${projectId}/teams/${team.team_id}/members`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (!membersRes.ok) return [team.team_id, [] as TeamMember[]] as const
            const membersData = await membersRes.json()
            return [team.team_id, Array.isArray(membersData?.members) ? membersData.members : []] as const
          } catch {
            return [team.team_id, [] as TeamMember[]] as const
          }
        })
      )

      const membersMap = Object.fromEntries(membersEntries) as Record<number, TeamMember[]>

      Object.keys(membersMap).forEach((teamIdKey) => {
        const teamId = Number(teamIdKey)
        membersMap[teamId] = (membersMap[teamId] || []).map((member) => ({
          ...member,
          avatar_url:
            member.user_id === user?.user_id
              ? user?.avatar_url || member.avatar_url
              : member.avatar_url,
        }))
      })

      const allUserIds = Array.from(
        new Set(
          Object.values(membersMap)
            .flat()
            .filter((member) => !member.avatar_url)
            .map((member) => member.user_id)
        )
      )

      if (allUserIds.length > 0) {
        const avatarQuery = allUserIds.map((id) => `user_ids=${id}`).join("&")
        const avatarsRes = await fetch(`${apiUrl}/users/avatars?force_refresh=false&${avatarQuery}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (avatarsRes.ok) {
          const avatarData = await avatarsRes.json()
          const avatarMap = (avatarData?.avatars || {}) as Record<string, string | null>
          Object.keys(membersMap).forEach((teamIdKey) => {
            const teamId = Number(teamIdKey)
            membersMap[teamId] = (membersMap[teamId] || []).map((member) => ({
              ...member,
              avatar_url: member.avatar_url || avatarMap[String(member.user_id)] || undefined,
            }))
          })
        }
      }

      setTeamMembersMap(membersMap)
    } catch {
      setError("Could not load teams. Please select a project from workspace and try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTeams()
  }, [user?.user_id, user?.avatar_url])

  const filteredTeams = useMemo(() => {
    const list = teams.filter((team) => team.name.toLowerCase().includes(query.toLowerCase()))
    if (sortBy === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name))
    return [...list].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )
  }, [teams, query, sortBy])

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return "CX"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  const colorTagClass = (idx: number) => {
    const tagStyles = isDark
      ? ["bg-pink-500/20 text-pink-300", "bg-amber-500/20 text-amber-300", "bg-violet-500/20 text-violet-300"]
      : ["bg-pink-100 text-pink-700", "bg-amber-100 text-amber-700", "bg-violet-100 text-violet-700"]
    return tagStyles[idx % tagStyles.length]
  }

  const handleCreateTeam = async () => {
    const name = teamName.trim()
    const description = teamDescription.trim()
    if (name.length < 2 || description.length < 5) {
      setError("Team name must be at least 2 chars and description at least 5 chars.")
      return
    }

    setCreating(true)
    setError("")
    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      if (!token || !projectId) throw new Error("missing-context")

      const tags = teamTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 3)

      const response = await fetch(`${apiUrl}/projects/${projectId}/teams`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          description,
          tags: tags.length ? tags : undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.detail || "create-failed")
      }

      setOpenCreate(false)
      setTeamName("")
      setTeamDescription("")
      setTeamTags("")
      await fetchTeams()
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not create team."
      setError(message || "Could not create team.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className={cn("rounded-3xl border p-4 md:p-6 space-y-5 md:space-y-7", panel, bg)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h1 className={cn("text-2xl md:text-4xl font-bold tracking-tight", strong)}>Teams</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className={cn(panel, "h-10 px-4")}>
            <LayoutList className="w-4 h-4 mr-2" /> List
          </Button>
          <Button onClick={() => setOpenCreate(true)} className="h-10 px-5 rounded-2xl bg-[#f78a2a] hover:bg-[#e0781f] text-white">
            <Plus className="w-4 h-4 mr-2" /> Create team
          </Button>
        </div>
      </div>

      <Card className={cn("border p-3 md:p-4", panel)}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4", muted)} />
            <Input
              placeholder="Search teams..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={cn(
                "pl-10 h-10 border-0 focus-visible:ring-0 text-sm",
                isDark ? "bg-transparent text-zinc-200 placeholder:text-zinc-500" : "bg-transparent text-zinc-700 placeholder:text-zinc-400"
              )}
            />
          </div>
          <div className={cn("h-px lg:h-8 lg:w-px", isDark ? "bg-zinc-800" : "bg-zinc-200")} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" className={cn("h-9", muted)} onClick={() => setSortBy("name")}>
              <SlidersHorizontal className="w-4 h-4 mr-2" /> Sort by
            </Button>
            <Button
              variant="ghost"
              className={cn("h-9", sortBy === "recent" ? strong : muted)}
              onClick={() => setSortBy("recent")}
            >
              Recent
            </Button>
          </div>
        </div>
      </Card>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className={cn("w-6 h-6 animate-spin", muted)} />
        </div>
      ) : (
        <div className={cn("rounded-2xl border p-3 md:p-4", isDark ? "border-zinc-800 bg-[#14161d]" : "border-zinc-200 bg-white/70")}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredTeams.map((team) => (
              <Card
                key={team.team_id}
                onClick={() => router.push(`/teams/${team.team_id}`)}
                className={cn("border rounded-2xl p-0 cursor-pointer transition-all hover:-translate-y-0.5 overflow-hidden", panel)}
              >
                <div className="p-4 md:p-5">
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {(team.tags || []).slice(0, 3).map((tag, idx) => (
                      <span
                        key={tag}
                        className={cn("inline-flex px-3 py-1 rounded-full text-xs font-semibold", colorTagClass(idx))}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <h3 className={cn("text-2xl font-semibold leading-tight", strong)}>{team.name}</h3>
                  <p className={cn("mt-2 text-base leading-relaxed line-clamp-3", muted)}>
                    {team.description || "No description provided."}
                  </p>

                  <div className={cn("mt-4 inline-flex items-center gap-2 border rounded-xl px-3 py-1.5 text-sm", isDark ? "border-zinc-700 text-zinc-300" : "border-zinc-300 text-zinc-700")}>
                    <CalendarDays className="w-4 h-4" />
                    {team.created_at ? new Date(team.created_at).toLocaleDateString() : "No date"}
                  </div>
                </div>
                <div className={cn("px-4 md:px-5 py-3 border-t flex items-center justify-between", isDark ? "border-zinc-800" : "border-zinc-200")}>
                  <div className="flex items-center -space-x-2">
                    {(teamMembersMap[team.team_id] || []).slice(0, 2).map((member, idx) => (
                      <span
                        key={member.user_id}
                        className={cn(
                          "w-8 h-8 rounded-full border text-[10px] font-bold flex items-center justify-center uppercase overflow-hidden",
                          idx === 0 ? "z-10 bg-emerald-500 text-white" : "z-20 bg-fuchsia-500 text-white",
                          isDark ? "border-[#181a20]" : "border-white"
                        )}
                        title={member.name}
                      >
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
                    ))}
                    {(teamMembersMap[team.team_id] || []).length > 2 && (
                      <span
                        className={cn(
                          "w-8 h-8 rounded-full border text-xs font-bold flex items-center justify-center z-30 shrink-0",
                          isDark ? "bg-white text-black border-[#181a20]" : "bg-black text-white border-white"
                        )}
                        title={`${(teamMembersMap[team.team_id] || []).length - 2} more members`}
                      >
                        +{(teamMembersMap[team.team_id] || []).length - 2}
                      </span>
                    )}
                    {(teamMembersMap[team.team_id] || []).length === 0 && (
                      <span className={cn("text-xs", muted)}>No members</span>
                    )}
                  </div>

                  <div className={cn("flex items-center gap-3 text-sm", muted)}>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="w-4 h-4" /> {team.member_count ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Link2 className="w-4 h-4" /> {team.tags?.length ?? 0}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {!filteredTeams.length && (
            <div className={cn("rounded-xl border border-dashed p-10 text-center mt-2", isDark ? "border-zinc-700 text-zinc-400" : "border-zinc-300 text-zinc-500")}>
              No teams found.
            </div>
          )}
        </div>
      )}

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className={cn("sm:max-w-lg", isDark ? "border-zinc-700 bg-[#171920] text-white" : "")}>
          <DialogHeader>
            <DialogTitle>Create team</DialogTitle>
            <DialogDescription className={isDark ? "text-zinc-400" : ""}>
              Add a team for this project. You can manage members later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Team name"
              className={isDark ? "border-zinc-700 bg-[#111318]" : ""}
            />
            <Input
              value={teamDescription}
              onChange={(e) => setTeamDescription(e.target.value)}
              placeholder="Description (min 5 chars)"
              className={isDark ? "border-zinc-700 bg-[#111318]" : ""}
            />
            <Input
              value={teamTags}
              onChange={(e) => setTeamTags(e.target.value)}
              placeholder="Tags (comma separated, max 3)"
              className={isDark ? "border-zinc-700 bg-[#111318]" : ""}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTeam} disabled={creating} className="bg-sky-500 text-white hover:bg-sky-400">
              {creating ? "Creating..." : "Create team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
