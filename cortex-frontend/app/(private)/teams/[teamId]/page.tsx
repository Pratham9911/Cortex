"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Check,
  Loader2,
  Mail,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react"
import { cn } from "@/lib/utils"
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
import { useAuth } from "@/components/auth/protected-route"
import { DiscussionsTab } from "@/components/teams/discussions-tab"
import { FilesTab } from "@/components/teams/files-tab"
import { OverviewTab } from "@/components/teams/overview-tab"
import { TasksTab } from "@/components/teams/tasks-tab"
import { TeamTabs, type TeamTabName } from "@/components/teams/team-tabs"
import { TimelinesTab } from "@/components/teams/timelines-tab"

type TeamMember = {
  user_id: number
  name: string
  email: string
  avatar_url?: string
  role?: "admin" | "member"
  is_project_owner?: boolean
  joined_at?: string
  added_at?: string
}

type SearchUser = TeamMember & {
  invite_pending: boolean
}

type AvailableTeamUser = TeamMember & {
  role: "admin" | "member"
}

type MemberDetails = TeamMember & {
  role: "admin" | "member"
  is_project_owner?: boolean
  joined_at?: string
  teams: Array<{
    team_id: number
    name: string
    added_at?: string
  }>
  can_remove: boolean
  can_remove_project_member?: boolean
  can_remove_team_member?: boolean
  can_change_role?: boolean
}

function PageUserAvatar({
  name,
  avatarUrl,
  size = "sm",
  onClick,
  className,
}: {
  name: string
  avatarUrl?: string
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  onClick?: () => void
  className?: string
}) {
  const [imgError, setImgError] = useState(false)

  const initials = (() => {
    if (!name || name.startsWith("User #")) return "U"
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return "U"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  })()

  const sizeMap: Record<string, string> = {
    xs: "size-5 text-[8px]",
    sm: "size-7 text-[9px]",
    md: "size-10 text-xs",
    lg: "size-12 text-xs",
    xl: "size-14 text-base",
  }

  return (
    <span
      title={name}
      onClick={onClick}
      className={cn(
        sizeMap[size],
        "flex items-center justify-center overflow-hidden rounded-full border border-black bg-white text-black font-extrabold shrink-0 shadow-xs",
        onClick && "cursor-pointer hover:scale-105 transition-transform",
        className
      )}
    >
      {avatarUrl && !imgError ? (
        <img
          src={avatarUrl}
          alt={name}
          onError={() => setImgError(true)}
          className="size-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  )
}

export default function TeamDetailPage() {
  const params = useParams<{ teamId: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const [teamName, setTeamName] = useState("Team")
  const [teamDescription, setTeamDescription] = useState("")
  const [teamTags, setTeamTags] = useState<string[]>([])
  const [teamCreatedAt, setTeamCreatedAt] = useState<string | undefined>()
  const [currentUserRole, setCurrentUserRole] = useState<"admin" | "member">("member")
  const [isProjectOwner, setIsProjectOwner] = useState(false)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [error, setError] = useState("")
  const [memberDetailsOpen, setMemberDetailsOpen] = useState(false)
  const [memberDetails, setMemberDetails] = useState<MemberDetails | null>(null)
  const [memberDetailsLoading, setMemberDetailsLoading] = useState(false)
  const [memberDetailsError, setMemberDetailsError] = useState("")
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removingMember, setRemovingMember] = useState(false)
  const [updatingMemberRole, setUpdatingMemberRole] = useState(false)
  const [pendingMemberRole, setPendingMemberRole] = useState<"admin" | "member" | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteQuery, setInviteQuery] = useState("")
  const [inviteResults, setInviteResults] = useState<SearchUser[]>([])
  const [inviteSearching, setInviteSearching] = useState(false)
  const [inviteError, setInviteError] = useState("")
  const [selectedInviteUser, setSelectedInviteUser] = useState<SearchUser | null>(null)
  const [sendingInvite, setSendingInvite] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState("")
  const [teamAddOpen, setTeamAddOpen] = useState(false)
  const [teamAddQuery, setTeamAddQuery] = useState("")
  const [teamAddResults, setTeamAddResults] = useState<AvailableTeamUser[]>([])
  const [teamAddLoading, setTeamAddLoading] = useState(false)
  const [teamAddError, setTeamAddError] = useState("")
  const [teamAddSuccess, setTeamAddSuccess] = useState("")
  const [addingTeamMemberId, setAddingTeamMemberId] = useState<number | null>(null)
  const [removingTeamMemberId, setRemovingTeamMemberId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<TeamTabName>("Tasks")

  const getInitials = (name: string) => {
    if (!name || name.startsWith("User #")) return "U"
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return "U"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }

  const formatDate = (value?: string) => {
    if (!value) return "Not available"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "Not available"
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  }

  const loadTeam = async () => {
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
      setTeamDescription(data?.team_description || "")
      setTeamTags(Array.isArray(data?.team_tags) ? data.team_tags : [])
      setTeamCreatedAt(data?.team_created_at || undefined)
      setIsProjectOwner(data?.current_user_is_project_owner === true)
      setCurrentUserRole(
        data?.current_user_role === "admin" || data?.current_user_is_project_owner
          ? "admin"
          : "member"
      )
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

  useEffect(() => {
    loadTeam()
  }, [apiUrl, params?.teamId])

  useEffect(() => {
    if (!inviteOpen) return

    const query = inviteQuery.trim()
    if (query.length < 1) {
      setInviteResults([])
      setInviteSearching(false)
      setInviteError("")
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setInviteSearching(true)
      setInviteError("")

      try {
        const token = localStorage.getItem("access_token")
        const projectId = localStorage.getItem("selected_project_id")
        if (!token || !projectId) throw new Error("Project context is missing.")

        const response = await fetch(
          `${apiUrl}/projects/${projectId}/invite/search?q=${encodeURIComponent(query)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }
        )

        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.detail || "Could not search Cortex users.")
        setInviteResults(Array.isArray(data?.users) ? data.users : [])
      } catch (searchError) {
        if (controller.signal.aborted) return
        setInviteResults([])
        setInviteError(searchError instanceof Error ? searchError.message : "Could not search Cortex users.")
      } finally {
        if (!controller.signal.aborted) setInviteSearching(false)
      }
    }, 350)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [apiUrl, inviteOpen, inviteQuery])

  useEffect(() => {
    if (!teamAddOpen) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setTeamAddLoading(true)
      setTeamAddError("")

      try {
        const token = localStorage.getItem("access_token")
        const projectId = localStorage.getItem("selected_project_id")
        if (!token || !projectId || !params?.teamId) throw new Error("Project context is missing.")

        const response = await fetch(
          `${apiUrl}/projects/${projectId}/teams/${params.teamId}/available-members?q=${encodeURIComponent(teamAddQuery.trim())}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }
        )
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.detail || "Could not search project members.")

        setTeamAddResults(Array.isArray(data?.users) ? data.users : [])
      } catch (searchError) {
        if (controller.signal.aborted) return
        setTeamAddResults([])
        setTeamAddError(searchError instanceof Error ? searchError.message : "Could not search project members.")
      } finally {
        if (!controller.signal.aborted) setTeamAddLoading(false)
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [apiUrl, params?.teamId, teamAddOpen, teamAddQuery])

  const resetInviteDialog = () => {
    setInviteQuery("")
    setInviteResults([])
    setInviteSearching(false)
    setInviteError("")
    setSelectedInviteUser(null)
    setSendingInvite(false)
    setInviteSuccess("")
  }

  const resetTeamAddDialog = () => {
    setTeamAddQuery("")
    setTeamAddResults([])
    setTeamAddLoading(false)
    setTeamAddError("")
    setTeamAddSuccess("")
    setAddingTeamMemberId(null)
  }

  const sendInvite = async () => {
    if (!selectedInviteUser) return

    setSendingInvite(true)
    setInviteError("")

    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      if (!token || !projectId) throw new Error("Project context is missing.")

      const response = await fetch(
        `${apiUrl}/projects/${projectId}/invite/send?email=${encodeURIComponent(selectedInviteUser.email)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      )

      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.detail || "Could not send invite.")

      setInviteResults((current) =>
        current.map((person) =>
          person.user_id === selectedInviteUser.user_id
            ? { ...person, invite_pending: true }
            : person
        )
      )
      setInviteSuccess(`Invite sent to ${selectedInviteUser.name}.`)
      setSelectedInviteUser(null)
    } catch (inviteRequestError) {
      setInviteError(inviteRequestError instanceof Error ? inviteRequestError.message : "Could not send invite.")
    } finally {
      setSendingInvite(false)
    }
  }

  const updateTeamSettings = async (name: string, description: string, tags: string[]) => {
    const token = localStorage.getItem("access_token")
    const projectId = localStorage.getItem("selected_project_id")
    if (!token || !projectId || !params?.teamId) {
      throw new Error("Project context is missing.")
    }

    const response = await fetch(
      `${apiUrl}/projects/${projectId}/teams/${params.teamId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, description, tags }),
      },
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = Array.isArray(data?.detail)
        ? data.detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join(" ")
        : data?.detail
      throw new Error(detail || "Could not update team settings.")
    }

    setTeamName(data?.team?.name || name)
    setTeamDescription(data?.team?.description || description)
    setTeamTags(Array.isArray(data?.team?.tags) ? data.team.tags : tags)
  }

  const deleteCurrentTeam = async () => {
    const token = localStorage.getItem("access_token")
    const projectId = localStorage.getItem("selected_project_id")
    if (!token || !projectId || !params?.teamId) {
      throw new Error("Project context is missing.")
    }

    const response = await fetch(
      `${apiUrl}/projects/${projectId}/teams/${params.teamId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = Array.isArray(data?.detail)
        ? data.detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join(" ")
        : data?.detail
      throw new Error(detail || "Could not delete this team.")
    }

    router.replace("/teams")
  }

  const canInvite = teamName.trim().toLowerCase() === "general" && currentUserRole === "admin"
  const isGeneralTeam = teamName.trim().toLowerCase() === "general"
  const headerMembers = members.slice(0, 2)
  const extraMemberCount = members.length > 2 ? members.length - 2 : 0
  const openMemberDetails = async (member: Pick<TeamMember, "user_id"> & Partial<TeamMember>) => {
    setMemberDetailsOpen(true)
    setMemberDetails(
      member.role && member.joined_at
        ? {
            user_id: member.user_id,
            name: member.name || "Member",
            email: member.email || "",
            avatar_url: member.avatar_url,
            role: member.role,
            joined_at: member.joined_at,
            teams: [],
            can_remove: false,
            can_change_role: false,
          }
        : null
    )
    setMemberDetailsLoading(true)
    setMemberDetailsError("")
    setConfirmRemove(false)
    setPendingMemberRole(null)

    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      if (!token || !projectId || !params?.teamId) throw new Error("Project context is missing.")

      const response = await fetch(`${apiUrl}/projects/${projectId}/teams/${params.teamId}/members/${member.user_id}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.detail || "Could not load member details.")

      setMemberDetails(data)
    } catch (detailsError) {
      setMemberDetailsError(detailsError instanceof Error ? detailsError.message : "Could not load member details.")
    } finally {
      setMemberDetailsLoading(false)
    }
  }

  const removeMemberFromTeam = async () => {
    if (!memberDetails) return

    setRemovingMember(true)
    setMemberDetailsError("")

    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      if (!token || !projectId || !params?.teamId) throw new Error("Project context is missing.")

      const removalScope = isGeneralTeam ? "/project" : ""
      const response = await fetch(`${apiUrl}/projects/${projectId}/teams/${params.teamId}/members/${memberDetails.user_id}${removalScope}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.detail || "Could not remove member.")

      setMembers((current) => current.filter((member) => member.user_id !== memberDetails.user_id))
      setMemberDetailsOpen(false)
      setMemberDetails(null)
      setConfirmRemove(false)
      await loadTeam()
    } catch (removeError) {
      setMemberDetailsError(removeError instanceof Error ? removeError.message : "Could not remove member.")
    } finally {
      setRemovingMember(false)
    }
  }

  const updateMemberRole = async () => {
    if (!memberDetails || !pendingMemberRole) return
    setUpdatingMemberRole(true)
    setMemberDetailsError("")

    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      if (!token || !projectId || !params?.teamId) throw new Error("Project context is missing.")

      const response = await fetch(
        `${apiUrl}/projects/${projectId}/teams/${params.teamId}/members/${memberDetails.user_id}/role`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: pendingMemberRole }),
        }
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.detail || "Could not update member role.")

      setMemberDetails((current) =>
        current
          ? {
              ...current,
              role: pendingMemberRole,
              can_change_role: isProjectOwner || pendingMemberRole === "member",
              can_remove: isProjectOwner || pendingMemberRole === "member",
            }
          : current
      )
      setPendingMemberRole(null)
      await loadTeam()
    } catch (roleError) {
      setMemberDetailsError(roleError instanceof Error ? roleError.message : "Could not update member role.")
    } finally {
      setUpdatingMemberRole(false)
    }
  }

  const addExistingProjectMemberToTeam = async (person: AvailableTeamUser) => {
    setAddingTeamMemberId(person.user_id)
    setTeamAddError("")
    setTeamAddSuccess("")

    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      if (!token || !projectId || !params?.teamId) throw new Error("Project context is missing.")

      const response = await fetch(`${apiUrl}/projects/${projectId}/teams/${params.teamId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: person.user_id }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.detail || "Could not add member to team.")

      setTeamAddResults((current) => current.filter((item) => item.user_id !== person.user_id))
      setTeamAddSuccess(`${person.name} added to ${teamName}.`)
      await loadTeam()
    } catch (addError) {
      setTeamAddError(addError instanceof Error ? addError.message : "Could not add member to team.")
    } finally {
      setAddingTeamMemberId(null)
    }
  }

  const removeMemberFromTeamOnly = async (member: TeamMember) => {
    setRemovingTeamMemberId(member.user_id)
    setError("")

    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      if (!token || !projectId || !params?.teamId) throw new Error("Project context is missing.")

      const response = await fetch(`${apiUrl}/projects/${projectId}/teams/${params.teamId}/members/${member.user_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.detail || "Could not remove member from team.")

      setMembers((current) => current.filter((item) => item.user_id !== member.user_id))
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove member from team.")
    } finally {
      setRemovingTeamMemberId(null)
    }
  }

  return (
    <section className={cn("flex h-dvh min-h-0 min-w-0 w-full max-w-full flex-col overflow-hidden", isDark ? "bg-[#0d0f10]" : "bg-[#f8fafb]")}>
      <div className={cn("relative z-20 w-full min-w-0 shrink-0 border-b px-5 pt-3 sm:px-6 sm:pt-4", isDark ? "border-zinc-800/80 bg-[#0d0f10]" : "border-slate-200 bg-white")}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className={cn("truncate text-xl font-bold tracking-tight sm:text-2xl", isDark ? "text-white" : "text-slate-900")}>
              {teamName}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center sm:flex">
              {headerMembers.map((member) => (
                <PageUserAvatar
                  key={member.user_id}
                  name={member.name}
                  avatarUrl={member.avatar_url}
                  size="sm"
                  onClick={() => openMemberDetails(member)}
                  className="-ml-1.5 first:ml-0"
                />
              ))}
              {extraMemberCount > 0 && (
                <span
                  className={cn(
                    "-ml-1.5 flex size-7 items-center justify-center rounded-full border text-[9px] font-bold",
                    isDark ? "border-zinc-700 bg-zinc-800 text-zinc-300" : "border-slate-300 bg-slate-100 text-slate-700"
                  )}
                >
                  +{extraMemberCount}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              title="Add member"
              className={cn(
                "rounded-full transition-colors",
                isDark ? "border-zinc-700 text-white hover:bg-zinc-800" : "border-slate-300 text-black hover:bg-slate-100"
              )}
              onClick={() => {
                if (isGeneralTeam) {
                  resetInviteDialog()
                  setInviteOpen(true)
                } else {
                  resetTeamAddDialog()
                  setTeamAddOpen(true)
                }
              }}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <TeamTabs activeTab={activeTab} onChange={setActiveTab} isDark={isDark} />
        </div>
      </div>

      {error && <p className="shrink-0 px-5 pt-4 text-sm text-red-400 sm:px-8">{error}</p>}

      <div className={cn("relative min-h-0 min-w-0 w-full flex-1 overflow-hidden", activeTab === "Discussions" || activeTab === "Timelines" || activeTab === "Files" || activeTab === "Overview" ? "p-0" : "overflow-y-auto p-5 sm:p-8")}>
        {activeTab === "Tasks" && <TasksTab isDark={isDark} members={members} teamId={Number(params.teamId)} canManage={currentUserRole === "admin"} initialTaskId={Number(searchParams.get("taskId")) || undefined} />}
        {activeTab === "Discussions" && (
          <DiscussionsTab
            isDark={isDark}
            teamId={params.teamId}
            userRole={currentUserRole}
            onOpenMemberDetails={(member) =>
              openMemberDetails(typeof member === "number" ? { user_id: member } : member)
            }
          />
        )}
        {activeTab === "Timelines" && (
          <TimelinesTab
            isDark={isDark}
            members={members}
            teamId={Number(params.teamId)}
            canManage={currentUserRole === "admin"}
            onOpenMemberDetails={openMemberDetails}
          />
        )}
        {activeTab === "Files" && (
          <FilesTab
            isDark={isDark}
            teamId={Number(params.teamId)}
            onOpenMemberDetails={openMemberDetails}
          />
        )}
        {activeTab === "Overview" && (
          <OverviewTab
            isDark={isDark}
            teamName={teamName}
            description={teamDescription}
            tags={teamTags}
            createdAt={teamCreatedAt}
            members={members}
            currentUserRole={currentUserRole}
            isProjectOwner={isProjectOwner}
            canManage={currentUserRole === "admin" || isProjectOwner}
            isGeneralTeam={isGeneralTeam}
            onOpenMemberDetails={openMemberDetails}
            onUpdateTeam={updateTeamSettings}
            onDeleteTeam={deleteCurrentTeam}
          />
        )}
      </div>

      <Dialog
        open={teamAddOpen}
        onOpenChange={(open) => {
          if (addingTeamMemberId) return
          setTeamAddOpen(open)
          if (!open) resetTeamAddDialog()
        }}
      >
        <DialogContent className={cn("h-[560px] max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-xl", isDark ? "border-zinc-800 bg-[#15171e] text-white" : "")}>
          <div className={cn("border-b px-6 py-5", isDark ? "border-zinc-800" : "border-slate-200")}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
                  <UserPlus className="size-4" />
                </span>
                Add member to {teamName}
              </DialogTitle>
              <DialogDescription className={isDark ? "text-zinc-400" : ""}>
                Search project members who are already in General, then add them to this team.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex min-h-0 flex-col px-6 py-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input
                autoFocus
                value={teamAddQuery}
                onChange={(event) => {
                  setTeamAddQuery(event.target.value)
                  setTeamAddSuccess("")
                }}
                placeholder="Search existing project members"
                className={cn("h-11 rounded-xl pl-10", isDark ? "border-zinc-700 bg-zinc-900/60" : "")}
              />
              {teamAddLoading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-violet-500" />}
            </div>

            {teamAddSuccess && (
              <div className={cn(
                "mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold",
                isDark ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"
              )}>
                <Check className="size-4 shrink-0" />
                <span>{teamAddSuccess}</span>
              </div>
            )}

            <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {teamAddResults.map((person) => (
                <button
                  key={person.user_id}
                  type="button"
                  disabled={addingTeamMemberId === person.user_id}
                  onClick={() => addExistingProjectMemberToTeam(person)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                    isDark
                      ? "border-zinc-800 bg-zinc-900/30 hover:border-violet-500/50 hover:bg-violet-500/5"
                      : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/50"
                  )}
                >
                  <PageUserAvatar name={person.name} avatarUrl={person.avatar_url} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{person.name}</span>
                    <span className="block truncate text-xs text-zinc-500">{person.email}</span>
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", person.role === "admin" ? "bg-violet-500/15 text-violet-500" : isDark ? "bg-zinc-800 text-zinc-400" : "bg-slate-200 text-slate-600")}>
                    {person.role}
                  </span>
                  <span className="text-xs font-semibold text-violet-500">
                    {addingTeamMemberId === person.user_id ? "Adding..." : "Add"}
                  </span>
                </button>
              ))}

              {!teamAddLoading && teamAddResults.length === 0 && !teamAddError && (
                <div className="flex h-full min-h-56 flex-col items-center justify-center text-center">
                  <Search className="mx-auto size-7 text-zinc-500" />
                  <p className="mt-3 text-sm text-zinc-500">No available project members found.</p>
                </div>
              )}
            </div>

            {teamAddError && <p className="mt-3 text-sm text-red-400">{teamAddError}</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          if (sendingInvite) return
          setInviteOpen(open)
          if (!open) resetInviteDialog()
        }}
      >
        <DialogContent
          className={cn(
            "h-[620px] max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border p-0 sm:max-w-xl",
            isDark ? "border-zinc-800 bg-[#15171e] text-white" : "border-slate-200 bg-white"
          )}
          showCloseButton={!sendingInvite}
        >
          <div className={cn("border-b px-6 py-5", isDark ? "border-zinc-800" : "border-slate-200")}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <span className="flex size-9 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
                  <UserPlus className="size-4" />
                </span>
                Invite to this project
              </DialogTitle>
              <DialogDescription className={cn("text-xs leading-5", isDark ? "text-zinc-400" : "text-slate-500")}>
                Search Cortex by name or email. Accepted invites automatically join the General team.
              </DialogDescription>
            </DialogHeader>
          </div>

          {selectedInviteUser ? (
            <div className="flex min-h-0 flex-1 flex-col justify-center px-6 py-6">
              <div className={cn("rounded-2xl border p-5 text-center", isDark ? "border-zinc-700 bg-zinc-900/50" : "border-slate-200 bg-slate-50")}>
                <PageUserAvatar name={selectedInviteUser.name} avatarUrl={selectedInviteUser.avatar_url} size="xl" className="mx-auto" />
                <h3 className="mt-3 text-base font-semibold">{selectedInviteUser.name}</h3>
                <p className="mt-1 text-xs text-zinc-500">{selectedInviteUser.email}</p>
              </div>
              <div className={cn("mt-4 rounded-xl border px-4 py-3 text-sm leading-6", isDark ? "border-amber-500/20 bg-amber-500/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-900")}>
                Send a project invitation to this person? They will join only after accepting it from their inbox.
              </div>
              {inviteError && <p className="mt-3 text-sm text-red-400">{inviteError}</p>}
              <DialogFooter className="mt-6">
                <Button variant="outline" disabled={sendingInvite} onClick={() => { setSelectedInviteUser(null); setInviteError("") }}>
                  Back
                </Button>
                <Button disabled={sendingInvite} onClick={sendInvite} className="bg-violet-600 text-white hover:bg-violet-500">
                  {sendingInvite ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Mail className="mr-2 size-4" />}
                  {sendingInvite ? "Sending invite..." : "Confirm invite"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  autoFocus
                  value={inviteQuery}
                  onChange={(event) => setInviteQuery(event.target.value)}
                  placeholder="Search by name or email"
                  className={cn("h-11 rounded-xl pl-10", isDark ? "border-zinc-700 bg-zinc-900/60" : "")}
                />
                {inviteSearching && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-violet-500" />}
              </div>

              {inviteSuccess && (
                <div className={cn(
                  "mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold",
                  isDark ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"
                )}>
                  <Check className="size-4 shrink-0" />
                  <span>{inviteSuccess} They will receive it in their Cortex inbox.</span>
                </div>
              )}

              <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {inviteResults.map((person) => (
                  <button
                    key={person.user_id}
                    type="button"
                    disabled={person.invite_pending}
                    onClick={() => {
                      setInviteError("")
                      setInviteSuccess("")
                      setSelectedInviteUser(person)
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                      person.invite_pending
                        ? "cursor-not-allowed opacity-55"
                        : isDark
                          ? "border-zinc-800 bg-zinc-900/30 hover:border-violet-500/50 hover:bg-violet-500/5"
                          : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/50"
                    )}
                  >
                    <PageUserAvatar name={person.name} avatarUrl={person.avatar_url} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{person.name}</span>
                      <span className="block truncate text-xs text-zinc-500">{person.email}</span>
                    </span>
                    <span className={cn("text-xs font-semibold", person.invite_pending ? "text-amber-500" : "text-violet-500")}>
                      {person.invite_pending ? "Pending" : "Invite"}
                    </span>
                  </button>
                ))}

                {!inviteSearching && inviteQuery.trim().length < 1 && (
                  <div className="flex h-full min-h-56 flex-col items-center justify-center text-center">
                    <Search className="mx-auto size-7 text-zinc-500" />
                    <p className="mt-3 text-sm text-zinc-500">Start typing a name or email to browse Cortex users.</p>
                  </div>
                )}

                {!inviteSearching && inviteQuery.trim().length >= 1 && inviteResults.length === 0 && !inviteError && (
                  <div className="flex h-full min-h-56 flex-col items-center justify-center text-center">
                    <p className="text-sm font-medium">No available users found</p>
                    <p className="mt-1 text-xs text-zinc-500">They may already belong to this project.</p>
                  </div>
                )}
              </div>

              {inviteError && <p className="mt-3 text-sm text-red-400">{inviteError}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={memberDetailsOpen}
        onOpenChange={(open) => {
          if (removingMember || updatingMemberRole) return
          setMemberDetailsOpen(open)
          if (!open) {
            setMemberDetails(null)
            setMemberDetailsError("")
            setConfirmRemove(false)
            setPendingMemberRole(null)
          }
        }}
      >
        <DialogContent className={cn("sm:max-w-lg", isDark ? "border-zinc-800 bg-[#15171e] text-white" : "")}>
          <DialogHeader>
            <DialogTitle>Member details</DialogTitle>
            <DialogDescription className={isDark ? "text-zinc-400" : ""}>
              Project role, team memberships, and joined date.
            </DialogDescription>
          </DialogHeader>

          {memberDetailsLoading && !memberDetails ? (
            <div className="flex min-h-56 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-violet-500" />
            </div>
          ) : memberDetails ? (
            <div className="space-y-4">
              <div className={cn("rounded-2xl border p-4", isDark ? "border-zinc-700 bg-zinc-900/40" : "border-slate-200 bg-slate-50")}>
                <div className="flex items-center gap-3">
                  <PageUserAvatar name={memberDetails.name} avatarUrl={memberDetails.avatar_url} size="lg" />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-base font-bold">{memberDetails.name}</p>
                      <span
                        className={cn(
                          "shrink-0 px-2 py-0.5 text-[10px] font-bold tracking-wide",
                          isDark ? "bg-zinc-700 text-zinc-200" : "bg-slate-200 text-slate-700"
                        )}
                      >
                        {memberDetails.user_id}
                      </span>
                    </div>
                    <p className="truncate text-xs text-zinc-500">{memberDetails.email}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Role</p>
                    <p className="mt-1 text-sm font-semibold">
                      {memberDetails.is_project_owner
                        ? "Project owner (Admin)"
                        : memberDetails.role}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Joined</p>
                    <p className="mt-1 text-sm font-semibold">{formatDate(memberDetails.joined_at)}</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Teams</p>
                <div className="flex flex-wrap gap-2">
                  {memberDetails.teams.map((team) => (
                    <span
                      key={team.team_id}
                      className={cn("px-3 py-1 text-xs font-semibold", isDark ? "bg-zinc-800 text-zinc-300" : "bg-slate-100 text-slate-700")}
                    >
                      {team.name}
                    </span>
                  ))}
                  {memberDetails.teams.length === 0 && <span className="text-sm text-zinc-500">No teams found.</span>}
                </div>
              </div>

              {memberDetailsError && <p className="text-sm text-red-400">{memberDetailsError}</p>}

              {memberDetails.can_change_role && !memberDetails.is_project_owner && (
                <div className={cn("rounded-2xl border p-4", isDark ? "border-zinc-700" : "border-slate-200")}>
                  {pendingMemberRole ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold">
                        {pendingMemberRole === "admin"
                          ? `Promote ${memberDetails.name} to project admin?`
                          : `Demote ${memberDetails.name} to project member?`}
                      </p>
                      <p className="text-xs text-zinc-500">
                        This changes their access across the entire project, not only this team.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={updatingMemberRole}
                          onClick={updateMemberRole}
                          className={pendingMemberRole === "member" ? "bg-amber-600 text-white hover:bg-amber-500" : ""}
                        >
                          {updatingMemberRole && <Loader2 className="mr-2 size-4 animate-spin" />}
                          Confirm {pendingMemberRole === "admin" ? "promotion" : "demotion"}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={updatingMemberRole}
                          onClick={() => setPendingMemberRole(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Project role</p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          Role changes apply across all project teams.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setPendingMemberRole(
                            memberDetails.role === "admin" ? "member" : "admin"
                          )
                        }
                      >
                        {memberDetails.role === "admin"
                          ? "Demote to member"
                          : "Promote to admin"}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {memberDetails.can_remove && memberDetails.user_id !== user?.user_id && !memberDetails.is_project_owner && (
                <div className={cn("rounded-2xl border p-4", confirmRemove ? "border-red-500/30 bg-red-500/10" : isDark ? "border-zinc-700" : "border-slate-200")}>
                  {confirmRemove ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-red-400">
                        Remove {memberDetails.name} {isGeneralTeam ? "from this project and all project teams" : `from ${teamName}`}?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={removingMember}
                          onClick={removeMemberFromTeam}
                          className="bg-red-600 text-white hover:bg-red-500"
                        >
                          {removingMember && <Loader2 className="mr-2 size-4 animate-spin" />}
                          Confirm remove
                        </Button>
                        <Button variant="outline" disabled={removingMember} onClick={() => setConfirmRemove(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setConfirmRemove(true)}
                      className="border-red-500/40 text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="mr-2 size-4" />
                      {isGeneralTeam ? "Remove from project" : "Remove from team"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-red-400">{memberDetailsError || "Could not load member details."}</p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
