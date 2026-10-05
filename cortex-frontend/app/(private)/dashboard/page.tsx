"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertCircle,
  FileText,
  FolderKanban,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useTheme } from "next-themes"
import { useAuth } from "@/components/auth/protected-route"
import { UserAvatarContents } from "@/components/teams/user-avatar-contents"
import { ProjectMemberProfileDialog } from "@/components/teams/project-member-profile-dialog"
import { cn } from "@/lib/utils"

type DashboardMember = {
  user_id: number
  name: string
  email: string
  avatar_url?: string
  role: string
  joined_at?: string | null
  is_project_owner: boolean
}

type TaskActivity = {
  date: string
  open_tasks: number
  completed_tasks: number
  day_label?: string
}

type TaskRangePreset = "14" | "30" | "90" | "custom"

type DashboardData = {
  project: {
    project_id: number
    name: string
    created_at?: string | null
  }
  summary: {
    team_count: number
    document_count: number
    open_tasks: number
    completed_tasks: number
    member_count: number
    admin_count: number
    storage_used_mb: number
    storage_limit_mb: number | null
  }
  admins: DashboardMember[]
  task_activity: TaskActivity[]
  task_history_start_date: string | null
  task_snapshot_count: number
}

const API_URL = process.env.NEXT_PUBLIC_API_URL!

function formatCount(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

function formatDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function utcDateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function dateDaysAgo(days: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return utcDateString(date)
}

function formatStorage(value: number) {
  const formatter = new Intl.NumberFormat("en", {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  })
  if (value >= 1024) return `${formatter.format(value / 1024)} GB`
  return `${formatter.format(value)} MB`
}

function DashboardSkeleton({ isDark }: { isDark: boolean }) {
  const pulse = isDark ? "animate-pulse bg-white/[0.07]" : "animate-pulse bg-slate-200"
  const panel = isDark ? "border-white/[0.08] bg-[#111315]" : "border-slate-200 bg-white"
  return (
    <section className="mx-auto w-full max-w-[1500px] space-y-6 pb-8" aria-label="Loading project dashboard">
      <div className={cn("space-y-4 rounded-2xl border p-6 sm:p-8", panel)}>
        <div className={cn("h-3 w-28 rounded", pulse)} />
        <div className={cn("h-9 w-72 max-w-full rounded-lg", pulse)} />
        <div className={cn("h-4 w-96 max-w-full rounded", pulse)} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={cn("space-y-4 rounded-2xl border p-5", panel)}>
            <div className={cn("h-3 w-24 rounded", pulse)} />
            <div className={cn("h-8 w-20 rounded", pulse)} />
            <div className={cn("h-3 w-32 rounded", pulse)} />
          </div>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,0.8fr)]">
        <div className={cn("h-[430px] rounded-2xl border p-6", panel, pulse)} />
        <div className={cn("h-[430px] rounded-2xl border p-6", panel, pulse)} />
      </div>
    </section>
  )
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  isDark,
  compactValue = false,
}: {
  title: string
  value: string
  detail: string
  icon: typeof FolderKanban
  isDark: boolean
  compactValue?: boolean
}) {
  return (
    <article className={cn(
      "rounded-2xl border p-5 transition-colors",
      isDark ? "border-white/[0.08] bg-[#111315]" : "border-slate-200 bg-white",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn("text-xs font-medium", isDark ? "text-zinc-400" : "text-slate-500")}>{title}</p>
          <p className={cn(
            "mt-3 font-semibold tracking-tight tabular-nums",
            compactValue ? "whitespace-nowrap text-base sm:text-lg xl:text-base 2xl:text-lg" : "text-2xl sm:text-3xl",
            isDark ? "text-white" : "text-slate-950",
          )}>{value}</p>
        </div>
        <span className={cn(
          "grid size-10 place-items-center rounded-xl border",
          isDark ? "border-white/10 bg-white/[0.04] text-zinc-300" : "border-slate-200 bg-slate-50 text-slate-700",
        )}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <p className={cn("mt-3 text-xs", isDark ? "text-zinc-500" : "text-slate-500")}>{detail}</p>
    </article>
  )
}

function TaskGrowthChart({
  data,
  isDark,
  secondaryText,
}: {
  data: TaskActivity[]
  isDark: boolean
  secondaryText: string
}) {
  const openColor = isDark ? "#f4f4f5" : "#111827"
  const completedColor = isDark ? "#a1a1aa" : "#71717a"

  return (
    <div className="h-full w-full">
      {data.length === 0 ? (
        <div className={`flex h-full items-center justify-center text-sm ${secondaryText}`}>
          No task activity snapshot is available yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 16, left: 8, bottom: 24 }}>
            <CartesianGrid vertical={false} stroke={isDark ? "#34383b" : "#e5e7eb"} />
            <XAxis
              dataKey="day_label"
              axisLine={{ stroke: isDark ? "#484d50" : "#cbd5e1" }}
              tickLine={false}
              tick={{ fill: isDark ? "#8d969a" : "#64748b", fontSize: 11 }}
              minTickGap={18}
              interval="preserveEnd"
              label={{ value: "Date", position: "insideBottom", offset: -18, fill: isDark ? "#8d969a" : "#64748b", fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: isDark ? "#8d969a" : "#64748b", fontSize: 11 }}
              allowDecimals={false}
              domain={[0, "auto"]}
              width={42}
              label={{ value: "Number of tasks", angle: -90, position: "insideLeft", fill: isDark ? "#8d969a" : "#64748b", fontSize: 11 }}
            />
            <Tooltip
              cursor={{ stroke: isDark ? "#64748b" : "#94a3b8", strokeDasharray: "4 4" }}
              content={({ active, payload, label }) => {
                const row = payload?.[0]?.payload as TaskActivity | undefined
                if (!active || !row) return null
                return (
                  <div className={cn("rounded-xl border p-3 shadow-xl", isDark ? "border-white/10 bg-[#1b1e20] text-zinc-100" : "border-slate-200 bg-white text-slate-900")}>
                    <p className={cn("mb-2 text-xs font-semibold", secondaryText)}>{label}</p>
                    <p className="flex justify-between gap-6 text-xs"><span style={{ color: openColor }}>Open Tasks</span><span className="font-semibold tabular-nums">{row.open_tasks}</span></p>
                    <p className="mt-1 flex justify-between gap-6 text-xs"><span style={{ color: completedColor }}>Completed Tasks</span><span className="font-semibold tabular-nums">{row.completed_tasks}</span></p>
                  </div>
                )
              }}
            />
            <Line type="monotone" dataKey="open_tasks" name="Open Tasks" stroke={openColor} strokeWidth={2.5} dot={{ r: 4, fill: openColor }} activeDot={{ r: 6, strokeWidth: 0 }} />
            <Line type="monotone" dataKey="completed_tasks" name="Completed Tasks" stroke={completedColor} strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 4, fill: completedColor }} activeDot={{ r: 6, strokeWidth: 0 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const [projectId, setProjectId] = useState("")
  const [projectLoading, setProjectLoading] = useState(true)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [selectedMember, setSelectedMember] = useState<DashboardMember | null>(null)
  const [taskRangePreset, setTaskRangePreset] = useState<TaskRangePreset>("14")
  const [taskRangeStart, setTaskRangeStart] = useState(() => dateDaysAgo(13))
  const [taskRangeEnd, setTaskRangeEnd] = useState(() => utcDateString(new Date()))

  useEffect(() => {
    if (taskRangePreset === "custom") return
    const days = Number(taskRangePreset)
    setTaskRangeEnd(utcDateString(new Date()))
    setTaskRangeStart(dateDaysAgo(days - 1))
  }, [taskRangePreset])

  useEffect(() => {
    const selectedProjectId = localStorage.getItem("selected_project_id") ?? ""
    setProjectId(selectedProjectId)
    setLoading(Boolean(selectedProjectId))
    setProjectLoading(false)
  }, [])

  useEffect(() => {
    if (projectLoading) return
    if (!projectId) {
      setDashboard(null)
      setLoading(false)
      return
    }
    if (!taskRangeStart || !taskRangeEnd || taskRangeStart > taskRangeEnd) {
      setError("Choose a valid task chart date range.")
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const loadDashboard = async () => {
      const token = localStorage.getItem("access_token") || localStorage.getItem("token")
      if (!token) {
        setDashboard(null)
        setError("Please sign in again to view this project dashboard.")
        return
      }
      setLoading(true)
      setError("")
      try {
        const params = new URLSearchParams({
          start_date: taskRangeStart,
          end_date: taskRangeEnd,
        })
        const response = await fetch(`${API_URL}/projects/${projectId}/dashboard?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        })
        const result = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(typeof result?.detail === "string" ? result.detail : "Unable to load the project dashboard.")
        }
        setDashboard(result as DashboardData)
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === "AbortError") return
        setDashboard(null)
        setError(loadError instanceof Error ? loadError.message : "Unable to load the project dashboard.")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadDashboard()
    return () => controller.abort()
  }, [projectId, projectLoading, refreshIndex, taskRangeStart, taskRangeEnd])

  const chartData = useMemo(
    () => (dashboard?.task_activity ?? []).map((point) => ({ ...point, day_label: formatDay(point.date) })),
    [dashboard],
  )
  if (projectLoading) return <DashboardSkeleton isDark={isDark} />

  const panelClass = isDark ? "border-white/[0.08] bg-[#111315]" : "border-slate-200 bg-white"
  const secondaryText = isDark ? "text-zinc-400" : "text-slate-500"
  const userName = user?.name?.trim() || "there"

  return (
    <section className="mx-auto w-full max-w-[1500px] space-y-5 pb-8">
      <header className={cn("relative overflow-hidden rounded-2xl border p-6 sm:p-8", panelClass)}>
        <div className={cn("pointer-events-none absolute -right-12 -top-24 size-72 rounded-full blur-3xl", isDark ? "bg-white/[0.035]" : "bg-slate-200/50")} />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.2em]", secondaryText)}>Project overview</p>
            <h1 className={cn("mt-2 text-3xl font-semibold tracking-tight sm:text-4xl", isDark ? "text-white" : "text-slate-950")}>
              Welcome back, {userName}
            </h1>
            <p className={cn("mt-2 text-sm", secondaryText)}>
              {dashboard?.project.name ?? (projectId ? "Your project at a glance" : "Select a project to see its overview.")} · A clear view of the work, people, and progress in this workspace.
            </p>
          </div>
          {dashboard && (
            <div className={cn("flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs", isDark ? "border-white/10 bg-white/[0.03] text-zinc-300" : "border-slate-200 bg-slate-50 text-slate-600")}>
              <span className={cn("size-2 rounded-full", loading ? "animate-pulse bg-zinc-400" : "bg-black dark:bg-white")} />
              {loading ? "Updating" : "Project overview"}
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className={cn("flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm", isDark ? "border-red-400/20 bg-red-400/[0.06] text-red-200" : "border-red-200 bg-red-50 text-red-800")}>
          <span className="flex items-center gap-2"><AlertCircle className="size-4 shrink-0" />{error}</span>
          <button
            type="button"
            onClick={() => setRefreshIndex((current) => current + 1)}
            className="inline-flex shrink-0 items-center gap-2 font-semibold"
          >
            <RefreshCw className="size-3.5" /> Retry
          </button>
        </div>
      )}

      {!projectId ? (
        <div className={cn("rounded-2xl border px-6 py-16 text-center", panelClass)}>
          <FolderKanban className={cn("mx-auto size-8", secondaryText)} />
          <h2 className={cn("mt-4 text-lg font-semibold", isDark ? "text-white" : "text-slate-900")}>No project selected</h2>
          <p className={cn("mt-1 text-sm", secondaryText)}>Choose a project in your workspace to view its dashboard.</p>
        </div>
      ) : loading && !dashboard ? (
        <DashboardSkeleton isDark={isDark} />
      ) : dashboard ? (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Project summary">
            <MetricCard title="Teams" value={formatCount(dashboard.summary.team_count)} detail="In this project" icon={FolderKanban} isDark={isDark} />
            <MetricCard title="Documents" value={formatCount(dashboard.summary.document_count)} detail="In this project" icon={FileText} isDark={isDark} />
            <MetricCard title="Members" value={formatCount(dashboard.summary.member_count)} detail={`${formatCount(dashboard.summary.admin_count)} ${dashboard.summary.admin_count === 1 ? "admin" : "admins"}`} icon={Users} isDark={isDark} />
            <MetricCard
              title="Storage"
              value={`${formatStorage(dashboard.summary.storage_used_mb)}${typeof dashboard.summary.storage_limit_mb === "number" ? ` / ${formatStorage(dashboard.summary.storage_limit_mb)}` : ""}`}
              detail={typeof dashboard.summary.storage_limit_mb === "number" ? "Used / project plan limit" : "Successfully processed documents"}
              icon={HardDrive}
              isDark={isDark}
              compactValue
            />
          </section>

          <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,0.8fr)]">
            <article className={cn("min-w-0 rounded-2xl border p-5 sm:p-6", panelClass)}>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn("grid size-8 place-items-center rounded-lg border", isDark ? "border-white/10 bg-white/[0.04] text-zinc-300" : "border-slate-200 bg-slate-50 text-slate-700")}>
                      <Activity className="size-4" />
                    </span>
                    <h2 className={cn("text-base font-semibold", isDark ? "text-zinc-100" : "text-slate-900")}>
                      Task growth
                    </h2>
                  </div>
                  <p className={cn("mt-2 text-xs", secondaryText)}>
                    Open and completed tasks by day in the selected range
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Task chart date range"
                      value={taskRangePreset}
                      onChange={(event) => setTaskRangePreset(event.target.value as TaskRangePreset)}
                      className={cn("h-9 rounded-lg border px-2.5 text-xs outline-none focus:ring-2 focus:ring-inset", isDark ? "border-white/10 bg-[#17191b] text-zinc-200 focus:ring-white/30" : "border-slate-200 bg-white text-slate-700 focus:ring-slate-400")}
                    >
                      <option value="14">Last 14 days</option>
                      <option value="30">Last 30 days</option>
                      <option value="90">Last 90 days</option>
                      <option value="custom">Custom range</option>
                    </select>
                    {taskRangePreset === "custom" && (
                      <>
                        <label className={cn("flex items-center gap-2 text-xs", secondaryText)}>
                          From
                          <input
                            aria-label="Task chart start date"
                            type="date"
                            value={taskRangeStart}
                            max={taskRangeEnd || utcDateString(new Date())}
                            onChange={(event) => setTaskRangeStart(event.target.value)}
                            className={cn("h-9 rounded-lg border px-2 text-xs outline-none focus:ring-2 focus:ring-inset", isDark ? "border-white/10 bg-[#17191b] text-zinc-200 focus:ring-white/30" : "border-slate-200 bg-white text-slate-700 focus:ring-slate-400")}
                          />
                        </label>
                        <label className={cn("flex items-center gap-2 text-xs", secondaryText)}>
                          To
                          <input
                            aria-label="Task chart end date"
                            type="date"
                            value={taskRangeEnd}
                            min={taskRangeStart}
                            max={utcDateString(new Date())}
                            onChange={(event) => setTaskRangeEnd(event.target.value)}
                            className={cn("h-9 rounded-lg border px-2 text-xs outline-none focus:ring-2 focus:ring-inset", isDark ? "border-white/10 bg-[#17191b] text-zinc-200 focus:ring-white/30" : "border-slate-200 bg-white text-slate-700 focus:ring-slate-400")}
                          />
                        </label>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:items-end">
                  <span className={cn("text-xs tabular-nums", isDark ? "text-zinc-300" : "text-slate-700")}>
                    Overall: {formatCount(dashboard.summary.open_tasks)} open now · {formatCount(dashboard.summary.completed_tasks)} completed to date
                  </span>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <span className={cn("inline-flex items-center gap-2", isDark ? "text-zinc-300" : "text-slate-700")}><i className="h-0.5 w-4 bg-black dark:bg-white" />Open Tasks</span>
                    <span className={cn("inline-flex items-center gap-2", secondaryText)}><i className="h-0.5 w-4 border-t-2 border-dashed border-zinc-400" />Completed Tasks</span>
                  </div>
                </div>
              </div>
              <div className="mt-5 h-[300px] w-full sm:h-[360px]">
                <TaskGrowthChart data={chartData} isDark={isDark} secondaryText={secondaryText} />
              </div>
            </article>

            <article className={cn("rounded-2xl border p-5 sm:p-6", panelClass)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className={cn("text-base font-semibold", isDark ? "text-zinc-100" : "text-slate-900")}>Project leadership</h2>
                  <p className={cn("mt-1 text-xs", secondaryText)}>Owner and project admins</p>
                </div>
                <span className={cn("grid size-9 place-items-center rounded-lg border", isDark ? "border-white/10 bg-white/[0.04] text-zinc-300" : "border-slate-200 bg-slate-50 text-slate-700")}>
                  <ShieldCheck className="size-4" />
                </span>
              </div>
              <div className="mt-4 max-h-[390px] space-y-1 overflow-y-auto">
                {dashboard.admins.map((member) => (
                  <button
                    key={member.user_id}
                    type="button"
                    onClick={() => setSelectedMember(member)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset",
                      isDark ? "hover:bg-white/[0.05] focus-visible:ring-white" : "hover:bg-slate-50 focus-visible:ring-black",
                    )}
                    aria-label={`View ${member.name}'s profile`}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-black bg-white text-[10px] font-bold text-black">
                      <UserAvatarContents name={member.name} avatarUrl={member.avatar_url} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-semibold", isDark ? "text-zinc-100" : "text-slate-900")}>{member.name}</span>
                      <span className={cn("mt-0.5 block text-xs capitalize", secondaryText)}>{member.is_project_owner ? "Project owner" : "Admin"}</span>
                    </span>
                    {member.is_project_owner && <span className={cn("rounded-full border px-2 py-1 text-[10px] font-medium", isDark ? "border-white/10 text-zinc-300" : "border-slate-200 text-slate-600")}>Owner</span>}
                  </button>
                ))}
                {dashboard.admins.length === 0 && (
                  <p className={cn("py-8 text-center text-sm", secondaryText)}>No project administrators found.</p>
                )}
              </div>
            </article>
          </section>
        </>
      ) : !error ? (
        <div className={cn("rounded-2xl border px-6 py-16 text-center", panelClass)}>
          <AlertCircle className={cn("mx-auto size-8", secondaryText)} />
          <p className={cn("mt-3 text-sm", secondaryText)}>Project dashboard data is unavailable.</p>
        </div>
      ) : null}

      {projectId && selectedMember && (
        <ProjectMemberProfileDialog
          isDark={isDark}
          projectId={Number(projectId)}
          userId={selectedMember.user_id}
          isProjectOwner={selectedMember.is_project_owner}
          open
          onOpenChange={(open) => {
            if (!open) setSelectedMember(null)
          }}
        />
      )}
    </section>
  )
}
