"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { UserAvatarContents } from "@/components/teams/user-avatar-contents"
import { cn } from "@/lib/utils"

type MemberDetails = {
  user_id: number
  name: string
  email?: string
  avatar_url?: string
  role?: string
  joined_at?: string
  teams: Array<{ team_id: number; name: string }>
}

export function ProjectMemberProfileDialog({
  isDark,
  projectId,
  userId,
  isProjectOwner,
  open,
  onOpenChange,
}: {
  isDark: boolean
  projectId: number
  userId: number | null
  isProjectOwner: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [member, setMember] = useState<MemberDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!open || !userId) return
    const controller = new AbortController()
    const loadMember = async () => {
      const token = localStorage.getItem("access_token") || localStorage.getItem("token")
      if (!token) {
        setError("Please sign in again to view member details.")
        return
      }
      setLoading(true)
      setError("")
      setMember(null)
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/projects/${projectId}/members/${userId}/details`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: controller.signal,
          },
        )
        const result = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(typeof result?.detail === "string" ? result.detail : "Could not load member details.")
        }
        setMember(result as MemberDetails)
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === "AbortError") return
        setError(loadError instanceof Error ? loadError.message : "Could not load member details.")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadMember()
    return () => controller.abort()
  }, [open, projectId, userId])

  const surface = isDark ? "border-zinc-700 bg-zinc-900/40" : "border-slate-200 bg-slate-50"
  const secondary = isDark ? "text-zinc-400" : "text-slate-500"
  const joinedDate = member?.joined_at
    ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(member.joined_at))
    : "Not available"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-lg", isDark ? "border-zinc-800 bg-[#151515] text-white" : "border-slate-200 bg-white")}>
        <DialogHeader>
          <DialogTitle>Member profile</DialogTitle>
          <DialogDescription className={secondary}>Project role, team memberships, and joined date.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="space-y-4 py-2" aria-label="Loading member profile">
            <div className={cn("h-24 animate-pulse rounded-xl", isDark ? "bg-white/[0.06]" : "bg-slate-100")} />
            <div className={cn("h-16 animate-pulse rounded-xl", isDark ? "bg-white/[0.06]" : "bg-slate-100")} />
          </div>
        ) : member ? (
          <div className="space-y-4">
            <div className={cn("rounded-xl border p-4", surface)}>
              <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-black bg-white text-xs font-bold text-black">
                  <UserAvatarContents name={member.name} avatarUrl={member.avatar_url} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold">{member.name}</p>
                  <p className={cn("truncate text-xs", secondary)}>{member.email || "No email available"}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className={cn("text-[10px] font-bold uppercase tracking-wide", secondary)}>Role</p>
                  <p className="mt-1 text-sm font-semibold capitalize">{isProjectOwner ? "Project owner" : member.role || "Member"}</p>
                </div>
                <div>
                  <p className={cn("text-[10px] font-bold uppercase tracking-wide", secondary)}>Joined</p>
                  <p className="mt-1 text-sm font-semibold">{joinedDate}</p>
                </div>
              </div>
            </div>
            <div>
              <p className={cn("mb-2 text-xs font-bold uppercase tracking-wide", secondary)}>Teams</p>
              <div className="flex flex-wrap gap-2">
                {member.teams.map((team) => (
                  <span key={team.team_id} className={cn("rounded-md px-3 py-1 text-xs font-semibold", isDark ? "bg-zinc-800 text-zinc-300" : "bg-slate-100 text-slate-700")}>
                    {team.name}
                  </span>
                ))}
                {member.teams.length === 0 && <span className={cn("text-sm", secondary)}>No teams found.</span>}
              </div>
            </div>
          </div>
        ) : error ? (
          <p className="text-sm text-rose-500">{error}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
