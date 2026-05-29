"use client"

import { useEffect, useMemo, useState } from "react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import {
  CalendarDays,
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

// ----------------------------------------------------------------------
// SKELETON COMPONENT (Prevents layout jumping on load)
// ----------------------------------------------------------------------
function TeamCardSkeleton({ isDark }: { isDark: boolean }) {
  const panel = isDark ? "bg-[#181a20] border-zinc-800" : "bg-white border-zinc-200"
  const pulse = isDark ? "bg-zinc-800" : "bg-zinc-200"
  
  return (
    <div className={cn("border rounded-2xl p-0 overflow-hidden animate-pulse", panel)}>
      <div className="p-4 md:p-5 space-y-4">
        <div className="flex gap-2 mb-4">
          <div className={cn("h-6 w-16 rounded-full", pulse)} />
          <div className={cn("h-6 w-16 rounded-full", pulse)} />
        </div>
        <div className={cn("h-7 w-3/4 rounded-md", pulse)} />
        <div className="space-y-2 mt-2">
          <div className={cn("h-4 w-full rounded-md", pulse)} />
          <div className={cn("h-4 w-5/6 rounded-md", pulse)} />
        </div>
        <div className={cn("h-4 w-24 rounded-md mt-4", pulse)} />
      </div>
      <div className={cn("px-4 md:px-5 py-3 border-t flex justify-between", isDark ? "border-zinc-800" : "border-zinc-200")}>
        <div className="flex gap-1 -space-x-2">
          <div className={cn("h-8 w-8 rounded-full border-2", pulse, isDark ? "border-[#181a20]" : "border-white")} />
          <div className={cn("h-8 w-8 rounded-full border-2", pulse, isDark ? "border-[#181a20]" : "border-white")} />
        </div>
        <div className={cn("h-4 w-12 rounded-md my-auto", pulse)} />
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------
// MAIN PAGE COMPONENT
// ----------------------------------------------------------------------
export default function TeamsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => { setMounted(true) }, [])
  const isDark = mounted && theme === "dark"
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
          avatar_url: member.user_id === user?.user_id ? user?.avatar_url || member.avatar_url : member.avatar_url,
        }))
      })

      const allUserIds = Array.from(new Set(Object.values(membersMap).flat().filter(m => !m.avatar_url).map(m => m.user_id)))

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
    return [...list].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
  }, [teams, query, sortBy])

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return "CX"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  const colorTagClass = (tag: string) => {
    const tagStyles = isDark
      ? ["bg-pink-500/10 text-pink-400", "bg-amber-500/10 text-amber-400", "bg-violet-500/10 text-violet-400", "bg-blue-500/10 text-blue-400", "bg-emerald-500/10 text-emerald-400", "bg-rose-500/10 text-rose-400"]
      : ["bg-pink-100 text-pink-700", "bg-amber-100 text-amber-700", "bg-violet-100 text-violet-700", "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-rose-100 text-rose-700"]
    let hash = 0
    for (let i = 0; i < tag.length; i++) { hash = tag.charCodeAt(i) + ((hash << 5) - hash) }
    return tagStyles[Math.abs(hash) % tagStyles.length]
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

      const tags = teamTags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 3)

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
      setError(e instanceof Error ? e.message : "Could not create team.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <section className="w-full">
      <h1 className={cn("text-3xl font-semibold tracking-tight", strong)}>My Teams</h1>

      <div className="mt-4 md:mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full md:w-auto">
          <div className="relative">
            <Search className={cn("pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2", muted)} />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teams"
              className={cn(
                "h-10 w-full sm:w-[430px] rounded-xl pl-10 text-sm",
                isDark ? "border-zinc-700 bg-[#14161d] text-zinc-100 placeholder:text-zinc-500" : "border-slate-300 bg-white"
              )}
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setSortBy(sortBy === "name" ? "recent" : "name")}
            className={cn("h-10 rounded-xl px-4 text-sm font-semibold", isDark ? "border-zinc-700 bg-[#14161d] text-zinc-100 hover:bg-zinc-800" : "")}
          >
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            {sortBy === "name" ? "Sorted by name" : "Sorted by recent"}
          </Button>
        </div>

        <div className="flex items-center gap-3 md:ml-47 w-full md:w-auto justify-end">
          <Button onClick={() => setOpenCreate(true)} className="h-10 rounded-xl bg-[#009f5c] px-4 md:px-6 text-sm font-semibold text-white hover:bg-[#00b166]">
            <Plus className="mr-2 h-4 w-4" /> Create team
          </Button>
        </div>
      </div>

      <div className="mt-4 min-h-[28px]">
        {error && <p className="text-base text-red-400">{error}</p>}
      </div>

      <div className={cn("mt-7 min-h-[420px] rounded-2xl p-0")}>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full">
            <TeamCardSkeleton isDark={isDark} />
            <TeamCardSkeleton isDark={isDark} />
            <TeamCardSkeleton isDark={isDark} />
            <TeamCardSkeleton isDark={isDark} />
          </div>
        ) : filteredTeams.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full">
              {filteredTeams.map((team) => (
                <Card
                  key={team.team_id}
                  onClick={() => router.push(`/teams/${team.team_id}`)}
                  className={cn("border rounded-2xl p-0 cursor-pointer transition-all hover:-translate-y-0.5 overflow-hidden", panel)}
                >
                <div className="p-4 md:p-5">
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {(team.tags || []).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className={cn("inline-flex px-3 py-1 rounded-full text-xs font-semibold", colorTagClass(tag))}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <h3 className={cn("text-2xl font-semibold leading-tight", strong)}>{team.name}</h3>
                  <p className={cn("mt-2 text-base leading-relaxed line-clamp-3", muted)}>
                    {team.description || "No description provided."}
                  </p>

                  <div className={cn("mt-4 flex items-center gap-2 text-sm font-medium", isDark ? "text-zinc-400" : "text-zinc-500")}>
                    <CalendarDays className="w-4 h-4" />
                    {team.created_at ? new Date(team.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : "No date"}
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
        ) : (
          <div className="min-h-[420px] flex items-start">
            <div className={cn(
              "w-full rounded-3xl border border-dashed px-8 py-12 text-center",
              isDark ? "border-zinc-700 bg-[#111318]" : "border-slate-200 bg-white"
            )}>
              <div className="mx-auto max-w-md">
                <h2 className={cn("text-2xl font-semibold", strong)}>No teams found</h2>
                <p className={cn("mt-3 text-sm leading-6", muted)}>Try adjusting your search terms or create a new team.</p>
              </div>
            </div>
          </div>
        )}
      </div>

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
