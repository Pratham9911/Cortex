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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return "?"
  return parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : parts[0].slice(0, 2).toUpperCase()
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
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const adminCount = members.filter(
    (member) => member.role === "admin" || member.is_project_owner,
  ).length

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
                    onClick={() => setSettingsOpen(true)}
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
                          "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-black text-[10px] font-semibold",
                          isDark
                            ? "bg-zinc-800 text-zinc-100"
                            : "bg-slate-200 text-slate-700",
                        )}
                      >
                        {member.avatar_url ? (
                          <img
                            src={member.avatar_url}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          initials(member.name)
                        )}
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
              Preview of team management settings. Editing and deletion will be available later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <label className="block space-y-2 text-sm font-medium">
              Team name
              <Input value={teamName} readOnly aria-readonly="true" />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Team tags
              <Input
                value={tags.join(", ")}
                readOnly
                aria-readonly="true"
                placeholder="No tags"
              />
            </label>
            <div className="flex items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Trash2 className="size-4 text-red-500" />
                  Delete team
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {isGeneralTeam
                    ? "The General team is protected and cannot be deleted."
                    : "Deleting a team is not available yet."}
                </p>
              </div>
              <Button variant="destructive" disabled>
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
