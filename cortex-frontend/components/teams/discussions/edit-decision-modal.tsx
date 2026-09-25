"use client"

import { useState, useEffect } from "react"
import { Check, Loader2, UserPlus, X, Search, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface TeamMemberItem {
  user_id: number
  name: string
  email: string
  avatar_url?: string
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

export function EditDecisionModal({
  isDark,
  decisionId,
  initialTitle,
  initialDescription,
  initialParticipants,
  projectId,
  teamId,
  onClose,
  onSuccess,
  onOpenMemberDetails,
}: {
  isDark: boolean
  decisionId: number
  initialTitle: string
  initialDescription: string
  initialParticipants: Array<{ user_id: number; name?: string; role?: string; avatar_url?: string }>
  projectId: string | number
  teamId: string | number
  onClose: () => void
  onSuccess: (updatedTitle: string, updatedDesc: string, status: "approved", approvedByName: string) => void
  onOpenMemberDetails?: (member: { user_id: number; name?: string; avatar_url?: string } | number) => void
}) {
  const [title, setTitle] = useState(initialTitle)
  const [description, setDescription] = useState(initialDescription)
  const [participants, setParticipants] = useState(initialParticipants)
  const [loading, setLoading] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([])
  
  // Teammates Search Pop-up State
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Confirmation Step State
  const [confirmSave, setConfirmSave] = useState(false)

  useEffect(() => {
    // Fetch team members for participant selection
    const fetchTeamMembers = async () => {
      try {
        const token = localStorage.getItem("access_token") || localStorage.getItem("token")
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/projects/${projectId}/teams/${teamId}/members`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )
        if (res.ok) {
          const data = await res.json()
          setTeamMembers(Array.isArray(data) ? data : data.members || [])
        }
      } catch (err) {
        console.error("Failed to fetch team members:", err)
      }
    }
    fetchTeamMembers()
  }, [projectId, teamId])

  const handleAddParticipant = (user: TeamMemberItem) => {
    if (!participants.some((p) => p.user_id === user.user_id)) {
      setParticipants([
        ...participants,
        { user_id: user.user_id, name: user.name, role: "Participant", avatar_url: user.avatar_url },
      ])
    }
  }

  const handleRemoveParticipant = (userId: number) => {
    setParticipants(participants.filter((p) => p.user_id !== userId))
  }

  const handleRoleChange = (userId: number, newRole: string) => {
    setParticipants(
      participants.map((p) => (p.user_id === userId ? { ...p, role: newRole } : p))
    )
  }

  const handleExecuteSave = async () => {
    if (!title.trim() || !description.trim()) return

    setLoading(true)
    try {
      const token = localStorage.getItem("access_token") || localStorage.getItem("token")
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/projects/${projectId}/teams/${teamId}/decisions/${decisionId}/edit-approve`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            description,
            participants,
          }),
        }
      )

      if (res.ok) {
        const data = await res.json()
        onSuccess(title, description, "approved", data.approved_by_name || "Admin")
        onClose()
      }
    } catch (err) {
      console.error("Edit and approve failed:", err)
    } finally {
      setLoading(false)
    }
  }

  const filteredMembers = teamMembers.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const maxVisibleAvatars = 3
  const visibleParticipants = participants.slice(0, maxVisibleAvatars)
  const extraParticipantCount = participants.length > maxVisibleAvatars ? participants.length - maxVisibleAvatars : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className={cn(
          "w-full max-w-xl rounded-2xl border p-6 shadow-2xl transition-all max-h-[90vh] overflow-y-auto",
          isDark ? "border-zinc-800 bg-zinc-900 text-zinc-100" : "border-slate-200 bg-white text-slate-900"
        )}
      >
        <div className="flex items-center justify-between border-b pb-3 mb-4 border-black/10 dark:border-zinc-800">
          <h3 className="font-bold text-base sm:text-lg">Edit & Approve Decision Proposal</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">
              Decision Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={cn(
                "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-all",
                isDark
                  ? "border-zinc-800 bg-zinc-950 text-white focus:border-zinc-500"
                  : "border-slate-300 bg-slate-50 text-slate-900 focus:border-zinc-800"
              )}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">
              Decision Context & Rationale
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className={cn(
                "w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-all",
                isDark
                  ? "border-zinc-800 bg-zinc-950 text-white focus:border-zinc-500"
                  : "border-slate-300 bg-slate-50 text-slate-900 focus:border-zinc-800"
              )}
              required
            />
          </div>

          {/* Participants & Roles Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider opacity-70 flex items-center gap-1.5">
                <Users className="size-3.5" /> Participants & Roles
              </label>

              {/* Trigger button for Teammate Search Pop-up */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("")
                  setIsSearchOpen(true)
                }}
                className={cn(
                  "text-xs gap-1.5 rounded-xl h-8 px-3 font-semibold transition-all border",
                  isDark ? "border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white" : "border-slate-300 bg-slate-100 hover:bg-slate-200 text-black"
                )}
              >
                <UserPlus className="size-3.5" />
                Add Teammates
              </Button>
            </div>

            {/* Avatar Stack Preview (Max 3 + Count) */}
            {participants.length > 0 && (
              <div className="flex items-center gap-3 p-2.5 rounded-xl border border-black/10 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40">
                <div className="flex -space-x-2 overflow-hidden items-center">
                  {visibleParticipants.map((p, idx) => {
                    const memberInfo = teamMembers.find((m) => m.user_id === p.user_id)
                    return (
                      <div
                        key={idx}
                        onClick={() =>
                          onOpenMemberDetails?.({
                            user_id: p.user_id,
                            name: p.name || memberInfo?.name,
                            avatar_url: p.avatar_url || memberInfo?.avatar_url,
                          })
                        }
                        className="relative z-10 cursor-pointer hover:scale-110 transition-all"
                        title={`View ${p.name || memberInfo?.name || `User #${p.user_id}`} details`}
                      >
                        <UserAvatar name={p.name || memberInfo?.name || `User #${p.user_id}`} avatarUrl={p.avatar_url || memberInfo?.avatar_url} size="sm" />
                      </div>
                    )
                  })}
                  {extraParticipantCount > 0 && (
                    <div
                      className={cn(
                        "relative z-0 flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-xs",
                        isDark
                          ? "border-zinc-900 bg-zinc-800 text-zinc-300"
                          : "border-white bg-slate-200 text-slate-800"
                      )}
                    >
                      +{extraParticipantCount}
                    </div>
                  )}
                </div>
                <span className="text-xs text-zinc-500 font-medium">
                  {participants.length} teammate{participants.length > 1 ? "s" : ""} included
                </span>
              </div>
            )}

            {/* Selected Participants List with Role Inputs */}
            {participants.length > 0 ? (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1 mt-2">
                {participants.map((p) => {
                  const memberInfo = teamMembers.find((m) => m.user_id === p.user_id)
                  const displayName = p.name || memberInfo?.name || `User #${p.user_id}`
                  const avatarUrl = p.avatar_url || memberInfo?.avatar_url

                  return (
                    <div
                      key={p.user_id}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border p-2.5 text-xs transition-all",
                        isDark ? "border-zinc-800 bg-zinc-950/80" : "border-slate-200 bg-slate-50"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          onClick={() =>
                            onOpenMemberDetails?.({
                              user_id: p.user_id,
                              name: displayName,
                              avatar_url: avatarUrl,
                            })
                          }
                          className="cursor-pointer hover:opacity-80 transition shrink-0"
                          title="View member details"
                        >
                          <UserAvatar name={displayName} avatarUrl={avatarUrl} size="sm" />
                        </div>
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          <span
                            onClick={() =>
                              onOpenMemberDetails?.({
                                user_id: p.user_id,
                                name: displayName,
                                avatar_url: avatarUrl,
                              })
                            }
                            className="font-semibold truncate cursor-pointer hover:underline"
                          >
                            {displayName}
                          </span>
                          <span className="inline-flex items-center px-1 py-0.2 rounded text-[10px] font-mono font-extrabold bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white shrink-0">
                            [{p.user_id}]
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={p.role || ""}
                          onChange={(e) => handleRoleChange(p.user_id, e.target.value)}
                          placeholder="Role (e.g. Lead)"
                          className={cn(
                            "w-32 sm:w-40 rounded-lg border px-2.5 py-1 text-xs outline-none transition-all",
                            isDark
                              ? "border-zinc-800 bg-zinc-900 text-white focus:border-zinc-500"
                              : "border-slate-300 bg-white text-slate-900 focus:border-zinc-800"
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveParticipant(p.user_id)}
                          className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-lg transition"
                          title="Remove participant"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 italic py-2">No participants added yet. Click &quot;Add Teammates&quot; above.</p>
            )}
          </div>

          {/* Confirmation Prompt / Action Footer */}
          <div className="pt-4 border-t border-black/10 dark:border-zinc-800 flex justify-end gap-2">
            {confirmSave ? (
              <div className="flex items-center justify-between w-full gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs">
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                  Confirm saving edits and approving this decision?
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    disabled={loading}
                    onClick={handleExecuteSave}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3.5 py-1.5 h-8 font-semibold rounded-lg"
                  >
                    {loading ? <Loader2 className="size-3.5 animate-spin" /> : "Confirm & Approve"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loading}
                    onClick={() => setConfirmSave(false)}
                    className="text-xs px-3 py-1.5 h-8 rounded-lg"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="text-xs rounded-xl h-9"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={loading || !title.trim() || !description.trim()}
                  onClick={() => setConfirmSave(true)}
                  className={cn(
                    "text-xs font-semibold px-4 h-9 rounded-xl transition-all shadow-sm",
                    isDark ? "bg-white text-zinc-900 hover:bg-emerald-600 hover:text-white" : "bg-zinc-900 text-white hover:bg-emerald-600 hover:text-white"
                  )}
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4 mr-1.5" />}
                  Save & Approve Decision
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Pop-up to Search and Add Teammates */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div
            className={cn(
              "w-full max-w-md rounded-2xl border p-5 shadow-2xl transition-all",
              isDark ? "border-zinc-800 bg-zinc-900 text-zinc-100" : "border-slate-200 bg-white text-slate-900"
            )}
          >
            <div className="flex items-center justify-between border-b pb-3 mb-3 border-black/10 dark:border-zinc-800">
              <h4 className="font-bold text-sm sm:text-base flex items-center gap-2">
                <UserPlus className="size-4" /> Add Team Mates
              </h4>
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="rounded-lg p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Live Search Input */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 size-4 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search teammates by name or email..."
                className={cn(
                  "w-full rounded-xl border pl-9 pr-3 py-2 text-xs outline-none transition-all",
                  isDark
                    ? "border-zinc-800 bg-zinc-950 text-white focus:border-zinc-500"
                    : "border-slate-300 bg-slate-50 text-slate-900 focus:border-zinc-800"
                )}
                autoFocus
              />
            </div>

            {/* Teammates List */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {filteredMembers.length > 0 ? (
                filteredMembers.map((m) => {
                  const isSelected = participants.some((p) => p.user_id === m.user_id)
                  return (
                    <div
                      key={m.user_id}
                      className={cn(
                        "flex items-center justify-between gap-3 p-2 rounded-xl border text-xs transition-all",
                        isSelected
                          ? isDark
                            ? "border-zinc-700 bg-zinc-800/80"
                            : "border-slate-300 bg-slate-100"
                          : isDark
                          ? "border-zinc-800/50 hover:bg-zinc-800/40"
                          : "border-slate-100 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          onClick={() =>
                            onOpenMemberDetails?.({
                              user_id: m.user_id,
                              name: m.name,
                              avatar_url: m.avatar_url,
                            })
                          }
                          className="cursor-pointer hover:opacity-80 transition shrink-0"
                          title="View member details"
                        >
                          <UserAvatar name={m.name} avatarUrl={m.avatar_url} size="sm" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p
                              onClick={() =>
                                onOpenMemberDetails?.({
                                  user_id: m.user_id,
                                  name: m.name,
                                  avatar_url: m.avatar_url,
                                })
                              }
                              className="font-semibold truncate cursor-pointer hover:underline"
                            >
                              {m.name}
                            </p>
                            <span className="inline-flex items-center px-1 py-0.2 rounded text-[10px] font-mono font-extrabold bg-black text-white dark:bg-white dark:text-black border border-black dark:border-white shrink-0">
                              [{m.user_id}]
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400 truncate">{m.email}</p>
                        </div>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant={isSelected ? "outline" : "default"}
                        onClick={() => {
                          if (isSelected) {
                            handleRemoveParticipant(m.user_id)
                          } else {
                            handleAddParticipant(m)
                          }
                        }}
                        className={cn(
                          "text-[11px] h-7 px-3 rounded-lg font-semibold transition-all shrink-0",
                          isSelected
                            ? "border-rose-500/50 text-rose-500 hover:bg-rose-500/10"
                            : isDark
                            ? "bg-white text-zinc-900 hover:bg-zinc-200"
                            : "bg-zinc-900 text-white hover:bg-zinc-800"
                        )}
                      >
                        {isSelected ? "Remove" : "+ Add"}
                      </Button>
                    </div>
                  )
                })
              ) : (
                <p className="text-xs text-zinc-500 italic text-center py-4">No team members match your search.</p>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-black/10 dark:border-zinc-800 flex justify-end">
              <Button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="text-xs px-4 h-8 rounded-xl font-semibold bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              >
                Done ({participants.length} Selected)
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
