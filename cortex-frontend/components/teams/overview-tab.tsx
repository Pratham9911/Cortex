"use client"

import { useState } from "react"
import {
  CalendarDays,
  Crown,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatarContents } from "@/components/teams/user-avatar-contents"

type OverviewMember = {
  user_id: number
  name: string
  email: string
  avatar_url?: string
  role?: "admin" | "member"
  is_project_owner?: boolean
  joined_at?: string
  added_at?: string
}

function formatDate(value?: string) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

export function OverviewTab({
  isDark,
  teamName,
  description,
  tags,
  createdAt,
  members,
  currentUserRole,
  isProjectOwner,
  canManage,
  isGeneralTeam,
  onOpenMemberDetails,
  onUpdateTeam,
  onDeleteTeam,
}: {
  isDark: boolean
  teamName: string
  description: string
  tags: string[]
  createdAt?: string
  members: OverviewMember[]
  currentUserRole: "admin" | "member"
  isProjectOwner: boolean
  canManage: boolean
  isGeneralTeam: boolean
  onOpenMemberDetails: (member: OverviewMember) => void
  onUpdateTeam: (name: string, description: string, tags: string[]) => Promise<void>
  onDeleteTeam: () => Promise<void>
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [draftTeamName, setDraftTeamName] = useState(teamName)
  const [draftDescription, setDraftDescription] = useState(description)
  const [draftTags, setDraftTags] = useState(tags.join(", "))
  const [savingSettings, setSavingSettings] = useState(false)
  const [deletingTeam, setDeletingTeam] = useState(false)
  const [settingsError, setSettingsError] = useState("")
  const parsedTagCount = draftTags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean).length
  const adminCount = members.filter(
    (member) => member.role === "admin" || member.is_project_owner,
  ).length

  const openSettings = () => {
    setDraftTeamName(teamName)
    setDraftDescription(description)
    setDraftTags(tags.join(", "))
    setSettingsError("")
    setSettingsOpen(true)
  }

  const saveSettings = async () => {
    setSavingSettings(true)
    setSettingsError("")
    try {
      const normalizedTags = draftTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
      if (normalizedTags.length > 3) {
        throw new Error("A team can have at most 3 tags.")
      }
      if (draftDescription.trim().length < 5) {
        throw new Error("Team description must be at least 5 characters.")
      }
      await onUpdateTeam(draftTeamName.trim(), draftDescription.trim(), normalizedTags)
      setSettingsOpen(false)
    } catch (saveError) {
      setSettingsError(
        saveError instanceof Error ? saveError.message : "Could not update team settings.",
      )
    } finally {
      setSavingSettings(false)
    }
  }

  const deleteTeam = async () => {
    setDeletingTeam(true)
    setSettingsError("")
    try {
      await onDeleteTeam()
      setDeleteConfirmOpen(false)
      setSettingsOpen(false)
    } catch (deleteError) {
      setSettingsError(
        deleteError instanceof Error ? deleteError.message : "Could not delete this team.",
      )
      setDeleteConfirmOpen(false)
    } finally {
      setDeletingTeam(false)
    }
  }

  return (
    <section
      className={cn(
        "team-overview-scroll h-full min-h-0 overflow-y-auto p-2 sm:p-3",
        isDark ? "text-zinc-100" : "text-slate-900",
      )}
    >
      <div className="w-full space-y-3">
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border p-5 sm:p-7",
            isDark
              ? "border-indigo-400/20 bg-gradient-to-r from-cyan-950/70 via-indigo-950/70 to-fuchsia-950/60"
              : "border-sky-100 bg-gradient-to-r from-cyan-50 via-sky-50 to-violet-50",
          )}
        >
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute -right-14 -top-24 size-64 rounded-full blur-3xl",
              isDark ? "bg-violet-500/10" : "bg-violet-300/25",
            )}
          />
          <div className="relative grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                  isDark
                    ? "border-white/10 bg-black/20 text-cyan-200"
                    : "border-sky-200 bg-white/60 text-sky-800",
                )}
              >
                <Users className="size-3.5" />
                Team workspace
              </span>
              <div className="mt-3 flex items-center gap-2">
                <h2 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
                  {teamName}
                </h2>
                {canManage && (
                  <button
                    type="button"
                    onClick={openSettings}
                    aria-label="Open team settings"
                    title="Team settings"
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                      isDark
                        ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
                        : "border-slate-300/70 bg-white/60 text-slate-600 hover:bg-white hover:text-slate-900",
                    )}
                  >
                    <Settings className="size-4" />
                  </button>
                )}
              </div>
              <p
                className={cn(
                  "mt-1 text-sm",
                  isDark ? "text-zinc-300" : "text-slate-600",
                )}
              >
                {description || "A shared space for your team to collaborate and get work done."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      isDark
                        ? "bg-white/10 text-zinc-200"
                        : "bg-white/70 text-slate-700",
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div
              className={cn(
                "grid grid-cols-3 gap-3 rounded-xl border p-3 sm:min-w-[330px] sm:gap-5 sm:p-4",
                isDark
                  ? "border-white/10 bg-black/20"
                  : "border-white/80 bg-white/65",
              )}
            >
              <div>
                <Users
                  className={cn(
                    "size-4",
                    isDark ? "text-cyan-300" : "text-sky-700",
                  )}
                />
                <p className="mt-2 text-lg font-bold">{members.length}</p>
                <p className="text-[10px] text-zinc-500">Members</p>
              </div>
              <div>
                <ShieldCheck
                  className={cn(
                    "size-4",
                    isDark ? "text-violet-300" : "text-violet-700",
                  )}
                />
                <p className="mt-2 text-lg font-bold">{adminCount}</p>
                <p className="text-[10px] text-zinc-500">Admins</p>
              </div>
              <div>
                {isProjectOwner ? (
                  <Crown
                    className={cn(
                      "size-4",
                      isDark ? "text-amber-300" : "text-amber-600",
                    )}
                  />
                ) : (
                  <CalendarDays
                    className={cn(
                      "size-4",
                      isDark ? "text-cyan-300" : "text-sky-700",
                    )}
                  />
                )}
                <p className="mt-2 truncate text-sm font-bold">
                  {isProjectOwner ? "Owner" : currentUserRole === "admin" ? "Admin" : "Member"}
                </p>
                <p className="text-[10px] text-zinc-500">Your role</p>
              </div>
            </div>
          </div>

          <div
            className={cn(
              "relative mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t pt-4 text-xs",
              isDark ? "border-white/10 text-zinc-400" : "border-slate-200/80 text-slate-500",
            )}
          >
            <span>Created {formatDate(createdAt)}</span>
            <span>{members.length} {members.length === 1 ? "person" : "people"} in this team</span>
            {isProjectOwner && <span className="font-medium text-amber-600 dark:text-amber-300">You own this project</span>}
          </div>
        </div>

        <div
          className={cn(
            "overflow-hidden rounded-xl border",
            isDark ? "border-zinc-800 bg-[#15171b]" : "border-slate-200 bg-white",
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-inherit px-4 py-4 sm:px-5">
            <div>
              <h3 className="text-sm font-semibold">People</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                Select a person to view their details and available management actions.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-600 dark:text-violet-300">
              {members.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div
                className={cn(
                  "grid grid-cols-[minmax(220px,1.4fr)_100px_minmax(180px,1.2fr)_120px_130px] items-center gap-3 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500",
                  isDark ? "bg-zinc-900/70" : "bg-slate-50",
                )}
              >
                <span>Person</span>
                <span>ID</span>
                <span>Email</span>
                <span>Role</span>
                <span>Joined</span>
              </div>

              {members.length ? (
                members.map((member) => (
                  <button
                    key={member.user_id}
                    type="button"
                    onClick={() => onOpenMemberDetails(member)}
                    className={cn(
                      "grid w-full grid-cols-[minmax(220px,1.4fr)_100px_minmax(180px,1.2fr)_120px_130px] items-center gap-3 border-t px-5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500",
                      isDark
                        ? "border-zinc-800 hover:bg-zinc-800/60"
                        : "border-slate-100 hover:bg-slate-50",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-black bg-white text-[10px] font-semibold text-black",
                        )}
                      >
                        <UserAvatarContents name={member.name} avatarUrl={member.avatar_url} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {member.name}
                        </span>
                        {member.is_project_owner && (
                          <span className="block text-[10px] font-medium text-amber-600 dark:text-amber-300">
                            Project owner
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="text-xs text-zinc-500">{member.user_id}</span>
                    <span className="truncate text-xs text-zinc-500">{member.email}</span>
                    <span
                      className={cn(
                        "w-fit rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize",
                        member.is_project_owner
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          : member.role === "admin"
                            ? "bg-violet-500/10 text-violet-700 dark:text-violet-300"
                            : "bg-slate-500/10 text-slate-600 dark:text-zinc-300",
                      )}
                    >
                      {member.is_project_owner ? "Owner · Admin" : member.role || "Member"}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {formatDate(member.joined_at || member.added_at)}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-5 py-12 text-center text-sm text-zinc-500">
                  No team members found.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent
          className={cn(
            "sm:max-w-lg",
            isDark && "border-zinc-800 bg-[#15171e] text-white",
          )}
        >
          <DialogHeader>
            <DialogTitle>Team settings</DialogTitle>
            <DialogDescription className={isDark ? "text-zinc-400" : ""}>
              Update this team’s name, description, and tags, or delete the team.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <label className="block space-y-2 text-sm font-medium">
              Team name
              <Input
                value={draftTeamName}
                onChange={(event) => setDraftTeamName(event.target.value)}
                maxLength={50}
                disabled={savingSettings || deletingTeam}
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Description <span className="font-normal text-zinc-500">(5–300 characters)</span>
              <Textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                minLength={5}
                maxLength={300}
                disabled={savingSettings || deletingTeam}
                rows={3}
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Team tags <span className="font-normal text-zinc-500">(comma-separated, up to 3)</span>
              <Input
                value={draftTags}
                onChange={(event) => setDraftTags(event.target.value)}
                disabled={savingSettings || deletingTeam}
                placeholder="No tags"
              />
              <span className={cn("block text-xs", parsedTagCount > 3 ? "text-red-500" : "text-zinc-500")}>
                {parsedTagCount}/3 tags
              </span>
            </label>
            {settingsError && (
              <p role="alert" className="text-sm text-red-500">
                {settingsError}
              </p>
            )}
            <DialogFooter className="sm:justify-between">
              {!isGeneralTeam ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    setSettingsError("")
                    setDeleteConfirmOpen(true)
                  }}
                  disabled={savingSettings || deletingTeam}
                >
                  <Trash2 className="size-4" />
                  Delete team
                </Button>
              ) : (
                <p className="self-center text-xs text-zinc-500">
                  The General team cannot be deleted.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSettingsOpen(false)}
                  disabled={savingSettings || deletingTeam}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void saveSettings()}
                  disabled={
                    savingSettings ||
                    deletingTeam ||
                    !draftTeamName.trim() ||
                    draftDescription.trim().length < 5 ||
                    draftDescription.trim().length > 300 ||
                    parsedTagCount > 3
                  }
                >
                  {savingSettings ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent
          className={cn(
            isDark && "border-zinc-800 bg-[#15171e] text-white",
          )}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{teamName}”?</AlertDialogTitle>
            <AlertDialogDescription className={isDark ? "text-zinc-400" : ""}>
              This permanently deletes the team, its tasks, decisions, discussions, and memberships.
              Documents themselves remain in project storage, but this team’s access is removed.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingTeam}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void deleteTeam()}
              disabled={deletingTeam}
            >
              {deletingTeam ? "Deleting…" : "Delete team"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
