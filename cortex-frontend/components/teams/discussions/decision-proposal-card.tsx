"use client"

import { useState, useEffect } from "react"
import { Check, X, Edit3, ShieldAlert, Loader2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { EditDecisionModal } from "./edit-decision-modal"

export interface DecisionProposalPayload {
  id: number
  decision_id?: number
  team_id: number
  title: string
  description: string
  created_by: number
  status: "pending_approval" | "approved" | "rejected"
  approved_by_name?: string
  rejected_by_name?: string
  participants?: Array<{ user_id: number; name?: string; role?: string; avatar_url?: string }>
}

function UserAvatar({
  name,
  avatarUrl,
  size = "sm",
}: {
  name?: string
  avatarUrl?: string
  size?: "xs" | "sm" | "md"
}) {
  const [imgError, setImgError] = useState(false)

  const getInitials = (n?: string) => {
    if (!n || n.startsWith("User #")) return "U"
    const parts = n.trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return "U"
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }

  const initials = getInitials(name)

  const sizeClasses =
    size === "xs" ? "w-5 h-5 text-[10px]" : size === "sm" ? "w-7 h-7 text-xs" : "w-8 h-8 text-xs"

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name || "User"}
        onError={() => setImgError(true)}
        className={cn(sizeClasses, "rounded-full object-cover border border-black flex-shrink-0 shadow-xs")}
      />
    )
  }

  return (
    <div
      className={cn(
        sizeClasses,
        "rounded-full bg-white text-black font-extrabold border border-black flex items-center justify-center flex-shrink-0 shadow-xs"
      )}
    >
      {initials}
    </div>
  )
}

export function DecisionProposalCard({
  isDark,
  proposal: initialProposal,
  isAdmin,
  projectId,
  teamId,
  onOpenMemberDetails,
}: {
  isDark: boolean
  proposal: DecisionProposalPayload
  isAdmin: boolean
  projectId: string | number
  teamId: string | number
  onOpenMemberDetails?: (member: { user_id: number; name?: string; avatar_url?: string } | number) => void
}) {
  const [proposal, setProposal] = useState<DecisionProposalPayload>(initialProposal)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)

  const decisionId = proposal.id || proposal.decision_id

  // Fetch real user names & avatars for participants
  useEffect(() => {
    if (!teamId || !projectId) return
    const fetchTeamMembers = async () => {
      try {
        const token = localStorage.getItem("access_token") || localStorage.getItem("token")
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/projects/${projectId}/teams/${teamId}/members`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (res.ok) {
          const data = await res.json()
          const membersList: Array<{ user_id: number; name: string; avatar_url?: string }> = Array.isArray(data)
            ? data
            : data.members || []

          if (membersList.length > 0) {
            setProposal((prev) => {
              if (!prev.participants || prev.participants.length === 0) return prev
              const updatedParts = prev.participants.map((p) => {
                const match = membersList.find((m) => m.user_id === p.user_id)
                return match
                  ? {
                      ...p,
                      name: match.name && !match.name.startsWith("User #") ? match.name : p.name,
                      avatar_url: match.avatar_url || p.avatar_url,
                    }
                  : p
              })
              return { ...prev, participants: updatedParts }
            })
          }
        }
      } catch {
        // Silently ignore
      }
    }
    fetchTeamMembers()
  }, [projectId, teamId])

  // Fetch the real decision status from DB on mount so the card survives page reloads
  useEffect(() => {
    if (!decisionId) return
    const fetchStatus = async () => {
      try {
        const token = localStorage.getItem("access_token") || localStorage.getItem("token")
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/projects/${projectId}/teams/${teamId}/decisions/${decisionId}/status`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (res.ok) {
          const data = await res.json()
          if (data.status && data.status !== proposal.status) {
            setProposal((prev) => ({
              ...prev,
              status: data.status,
              approved_by_name: data.approved_by_name || prev.approved_by_name,
              rejected_by_name: data.rejected_by_name || prev.rejected_by_name,
            }))
          }
        }
      } catch {
        // Silently fail — card will show the stored status
      }
    }
    fetchStatus()
  }, [decisionId])

  const handleApprove = async () => {
    if (!decisionId) return
    setLoadingAction("approve")
    try {
      const token = localStorage.getItem("access_token") || localStorage.getItem("token")
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/projects/${projectId}/teams/${teamId}/decisions/${decisionId}/approve`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      )
      if (res.ok) {
        const data = await res.json()
        setProposal((prev) => ({
          ...prev,
          status: "approved",
          approved_by_name: data.approved_by_name || "Admin",
        }))
        setConfirmAction(null)
      }
    } catch (err) {
      console.error("Approve failed:", err)
    } finally {
      setLoadingAction(null)
    }
  }

  const handleReject = async () => {
    if (!decisionId) return
    setLoadingAction("reject")
    try {
      const token = localStorage.getItem("access_token") || localStorage.getItem("token")
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/projects/${projectId}/teams/${teamId}/decisions/${decisionId}/reject`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      )
      if (res.ok) {
        const data = await res.json()
        setProposal((prev) => ({
          ...prev,
          status: "rejected",
          rejected_by_name: data.rejected_by_name || "Admin",
        }))
        setConfirmAction(null)
      }
    } catch (err) {
      console.error("Reject failed:", err)
    } finally {
      setLoadingAction(null)
    }
  }

  const handleEditSave = (updatedTitle: string, updatedDesc: string, updatedStatus: "approved", approvedByName: string) => {
    setProposal((prev) => ({
      ...prev,
      title: updatedTitle,
      description: updatedDesc,
      status: "approved",
      approved_by_name: approvedByName,
    }))
  }

  const participants = proposal.participants || []
  const maxVisibleAvatars = 3
  const visibleParticipants = participants.slice(0, maxVisibleAvatars)
  const extraParticipantCount = participants.length > maxVisibleAvatars ? participants.length - maxVisibleAvatars : 0

  return (
    <div
      className={cn(
        "my-4 overflow-hidden rounded-2xl border p-5 shadow-lg transition-all",
        isDark
          ? "border-zinc-800 bg-zinc-900/90 text-zinc-100 shadow-black/40"
          : "border-slate-200 bg-white text-slate-900 shadow-slate-200/50"
      )}
    >
      {/* Professional Header & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 mb-3 border-black/10 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Decision Proposal
          </span>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-0.5 text-xs font-semibold border transition-all",
            proposal.status === "pending_approval"
              ? isDark
                ? "border-zinc-700 bg-zinc-800 text-zinc-300"
                : "border-slate-300 bg-slate-100 text-slate-800"
              : proposal.status === "approved"
              ? isDark
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-emerald-300 bg-emerald-50 text-emerald-800"
              : isDark
              ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
              : "border-rose-300 bg-rose-50 text-rose-800"
          )}
        >
          {proposal.status === "pending_approval"
            ? "Pending Approval"
            : proposal.status === "approved"
            ? `Approved by ${proposal.approved_by_name || "Admin"}`
            : `Rejected by ${proposal.rejected_by_name || "Admin"}`}
        </span>
      </div>

      {/* Decision Content */}
      <div className="space-y-3">
        <h4 className="font-bold text-base sm:text-lg leading-snug tracking-tight">{proposal.title}</h4>
        <p className="whitespace-pre-wrap leading-relaxed opacity-90 text-xs sm:text-sm">
          {proposal.description}
        </p>

        {/* Participants Avatar Stack & User ID Chips */}
        {participants.length > 0 && (
          <div className="pt-2 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2 overflow-hidden items-center">
                {visibleParticipants.map((p, idx) => (
                  <div
                    key={idx}
                    onClick={() =>
                      onOpenMemberDetails?.({
                        user_id: p.user_id,
                        name: p.name,
                        avatar_url: p.avatar_url,
                      })
                    }
                    className="relative z-10 transition-all hover:scale-110 cursor-pointer"
                    title={`View ${p.name || `User #${p.user_id}`} details`}
                  >
                    <UserAvatar name={p.name || `User #${p.user_id}`} avatarUrl={p.avatar_url} size="sm" />
                  </div>
                ))}
                {extraParticipantCount > 0 && (
                  <div
                    className={cn(
                      "relative z-0 flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-xs",
                      isDark
                        ? "border-zinc-900 bg-zinc-800 text-zinc-300"
                        : "border-white bg-slate-100 text-slate-700"
                    )}
                    title={`${extraParticipantCount} more participants`}
                  >
                    +{extraParticipantCount}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-medium">
                  {participants.length} participant{participants.length > 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Participant Chips with Name and [user_id] Badge */}
            <div className="flex flex-wrap items-center gap-1.5">
              {participants.map((p, idx) => (
                <div
                  key={idx}
                  onClick={() =>
                    onOpenMemberDetails?.({
                      user_id: p.user_id,
                      name: p.name,
                      avatar_url: p.avatar_url,
                    })
                  }
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs cursor-pointer hover:border-black dark:hover:border-white transition-all shadow-2xs",
                    isDark ? "border-zinc-800 bg-zinc-950 text-zinc-200" : "border-slate-200 bg-slate-50 text-slate-800"
                  )}
                  title="Click to view member details"
                >
                  <span className="font-semibold">{p.name || `User #${p.user_id}`}</span>
                  <span className="inline-flex items-center px-1 py-0.2 rounded text-[10px] font-mono font-extrabold bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white shrink-0">
                    [{p.user_id}]
                  </span>
                  {p.role && (
                    <span className="text-[10px] opacity-75 font-medium">({p.role})</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons for Pending Proposal */}
      {proposal.status === "pending_approval" && (
        <div className="mt-4 pt-3 border-t border-black/10 dark:border-zinc-800">
          {isAdmin ? (
            confirmAction !== null ? (
              /* Confirmation Prompt Step */
              <div
                className={cn(
                  "p-3 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs transition-all animate-in fade-in duration-150",
                  confirmAction === "approve"
                    ? isDark
                      ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-200"
                      : "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                    : isDark
                    ? "bg-rose-950/20 border-rose-500/30 text-rose-200"
                    : "bg-rose-50/80 border-rose-200 text-rose-900"
                )}
              >
                <span className="font-semibold">
                  {confirmAction === "approve"
                    ? "Are you sure you want to approve this decision proposal?"
                    : "Are you sure you want to reject this decision proposal?"}
                </span>

                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                  <Button
                    size="sm"
                    disabled={loadingAction !== null}
                    onClick={confirmAction === "approve" ? handleApprove : handleReject}
                    className={cn(
                      "text-xs px-3.5 py-1.5 rounded-lg font-semibold text-white transition-all h-8",
                      confirmAction === "approve"
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-rose-600 hover:bg-rose-700"
                    )}
                  >
                    {loadingAction ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : confirmAction === "approve" ? (
                      "Yes, Approve"
                    ) : (
                      "Yes, Reject"
                    )}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loadingAction !== null}
                    onClick={() => setConfirmAction(null)}
                    className="text-xs px-3 py-1.5 rounded-lg h-8"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              /* Main Action Buttons with Hover Colors (Green for Accept, Red for Reject) */
              <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Accept / Approve Button — Turns GREEN on Hover */}
                  <Button
                    size="sm"
                    disabled={loadingAction !== null}
                    onClick={() => setConfirmAction("approve")}
                    className={cn(
                      "text-xs font-semibold px-4 py-2 h-9 rounded-xl transition-all shadow-sm border",
                      isDark
                        ? "bg-white text-zinc-900 border-white hover:bg-emerald-600 hover:border-emerald-600 hover:text-white"
                        : "bg-zinc-900 text-white border-zinc-900 hover:bg-emerald-600 hover:border-emerald-600 hover:text-white"
                    )}
                  >
                    <Check className="size-4 mr-1.5" />
                    Approve
                  </Button>

                  {/* Edit & Approve Button */}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loadingAction !== null}
                    onClick={() => setIsEditOpen(true)}
                    className={cn(
                      "text-xs font-semibold px-4 py-2 h-9 rounded-xl transition-all border",
                      isDark
                        ? "border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                        : "border-slate-300 text-slate-800 hover:bg-slate-100"
                    )}
                  >
                    <Edit3 className="size-4 mr-1.5" />
                    Edit & Approve
                  </Button>

                  {/* Reject Button — Turns RED on Hover */}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loadingAction !== null}
                    onClick={() => setConfirmAction("reject")}
                    className={cn(
                      "text-xs font-semibold px-4 py-2 h-9 rounded-xl transition-all border",
                      isDark
                        ? "border-zinc-700 text-zinc-300 hover:bg-rose-600 hover:border-rose-600 hover:text-white"
                        : "border-slate-300 text-slate-700 hover:bg-rose-600 hover:border-rose-600 hover:text-white"
                    )}
                  >
                    <X className="size-4 mr-1.5" />
                    Reject
                  </Button>
                </div>
              </div>
            )
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 italic">
              <ShieldAlert className="size-4" />
              Only team admins can approve or reject decision proposals.
            </div>
          )}
        </div>
      )}

      {/* Edit & Approve Modal */}
      {isEditOpen && (
        <EditDecisionModal
          isDark={isDark}
          decisionId={decisionId!}
          initialTitle={proposal.title}
          initialDescription={proposal.description}
          initialParticipants={proposal.participants || []}
          projectId={projectId}
          teamId={teamId}
          onClose={() => setIsEditOpen(false)}
          onSuccess={handleEditSave}
          onOpenMemberDetails={onOpenMemberDetails}
        />
      )}
    </div>
  )
}
