"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Database,
  FileText,
  RefreshCw,
  Sparkles,
} from "lucide-react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

type RangePreset = "7" | "14" | "30" | "90" | "custom"
type Metric = "total_tokens" | "input_tokens" | "output_tokens" | "cost" | "requests"

type DailyReport = {
  date: string
  storage_used_mb: number
  requests: number
  successful_requests: number
  failed_requests: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
  input_cost: number
  output_cost: number
  total_cost: number
}

type ProjectReport = {
  project_id: number
  project_name: string
  start_date: string
  end_date: string
  daily: DailyReport[]
  storage_start_mb: number
  storage_end_mb: number
  totals: Omit<DailyReport, "date" | "storage_used_mb">
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const METRICS: { id: Metric; label: string }[] = [
  { id: "total_tokens", label: "Total tokens" },
  { id: "input_tokens", label: "Input tokens" },
  { id: "output_tokens", label: "Output tokens" },
  { id: "cost", label: "Cost" },
  { id: "requests", label: "Requests" },
]
const INPUT_COLOR = "#28b7b1"
const OUTPUT_COLOR = "#0d9278"

function utcDateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

function dateDaysAgo(days: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return utcDateString(date)
}

function formatDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

function formatFullCount(value: number) {
  return new Intl.NumberFormat("en").format(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(value)
}

function formatStorage(value: number) {
  if (value >= 1024) return `${(value / 1024).toFixed(value >= 10240 ? 0 : 1)} GB`
  return `${value.toFixed(value >= 100 ? 0 : 2)} MB`
}

function ReportSkeleton({ isDark }: { isDark: boolean }) {
  const pulse = isDark ? "animate-pulse bg-white/[0.07]" : "animate-pulse bg-slate-200"
  const panel = isDark ? "border-white/[0.08] bg-[#111315]" : "border-slate-200 bg-white"
  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-6 pb-8" aria-label="Loading project report">
      <header className="space-y-3">
        <div className={cn("h-3 w-28 rounded", pulse)} />
        <div className={cn("h-9 w-56 rounded-lg", pulse)} />
        <div className={cn("h-4 w-80 max-w-full rounded", pulse)} />
      </header>
      <div className={cn("h-16 rounded-2xl border", panel, pulse)} />
      {[0, 1].map((item) => (
        <section key={item} className={cn("space-y-5 rounded-2xl border p-5", panel)}>
          <div className={cn("h-5 w-40 rounded", pulse)} />
          <div className={cn("h-[300px] rounded-xl", pulse)} />
        </section>
      ))}
    </section>
  )
}

function Stat({
  label,
  value,
  detail,
  icon: Icon,
  isDark,
}: {
  label: string
  value: string
  detail?: string
  icon: typeof Database
  isDark: boolean
}) {
  return (
    <div className={cn("rounded-xl border p-4", isDark ? "border-white/[0.07] bg-white/[0.025]" : "border-slate-100 bg-slate-50/80")}>
      <div className="flex items-center justify-between gap-3">
        <p className={cn("text-xs font-medium", isDark ? "text-zinc-400" : "text-slate-500")}>{label}</p>
        <Icon className={cn("size-4", isDark ? "text-zinc-500" : "text-slate-400")} />
      </div>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums", isDark ? "text-white" : "text-slate-950")}>{value}</p>
      {detail && <p className={cn("mt-1 text-xs", isDark ? "text-zinc-500" : "text-slate-500")}>{detail}</p>}
    </div>
  )
}

export default function ReportsPage() {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const [projectId, setProjectId] = useState("")
  const [report, setReport] = useState<ProjectReport | null>(null)
  const [metric, setMetric] = useState<Metric>("total_tokens")
  const [rangePreset, setRangePreset] = useState<RangePreset>("30")
  const [startDate, setStartDate] = useState(() => dateDaysAgo(29))
  const [endDate, setEndDate] = useState(() => utcDateString(new Date()))
  const [projectLoading, setProjectLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [refreshIndex, setRefreshIndex] = useState(0)

  useEffect(() => {
    setProjectId(localStorage.getItem("selected_project_id") ?? "")
    setProjectLoading(false)
  }, [])

  const fetchReport = useCallback(async (signal: AbortSignal) => {
    if (!projectId) {
      setReport(null)
      setLoading(false)
      return
    }
    const token = localStorage.getItem("access_token") || localStorage.getItem("token")
    if (!token) {
      setError("Please sign in again to view project reports.")
      setReport(null)
      setLoading(false)
      return
    }
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate })
    setReport(null)
    setLoading(true)
    setError("")
    try {
      const response = await fetch(
        `${API_URL}/projects/${projectId}/reports/usage?${params}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal,
        },
      )
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(typeof result?.detail === "string" ? result.detail : "Unable to load this project report.")
      }
      setReport(result as ProjectReport)
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === "AbortError") return
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load this project report.")
      setReport(null)
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [endDate, projectId, startDate])

  useEffect(() => {
    if (projectLoading) return
    const controller = new AbortController()
    void fetchReport(controller.signal)
    return () => controller.abort()
  }, [fetchReport, projectLoading, refreshIndex])

  const chartData = useMemo(
    () => (report?.daily ?? []).map((item) => ({
      ...item,
      day_label: formatDay(item.date),
      chart_value: metric === "cost" ? item.total_cost : item[metric],
    })),
    [metric, report?.daily],
  )

  const panelClass = isDark ? "border-white/[0.08] bg-[#111315]" : "border-slate-200 bg-white"
  const textSecondary = isDark ? "text-zinc-400" : "text-slate-500"
  const selectClass = cn(
    "h-10 rounded-xl border px-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-emerald-500/30",
    isDark ? "border-white/10 bg-[#171a1c] text-zinc-100" : "border-slate-200 bg-white text-slate-800",
  )
  const rangeChange = (value: RangePreset) => {
    setRangePreset(value)
    if (value !== "custom") {
      const days = Number(value)
      setStartDate(dateDaysAgo(days - 1))
      setEndDate(utcDateString(new Date()))
    }
  }
  const totals = report?.totals
  const storageChange = (report?.storage_end_mb ?? 0) - (report?.storage_start_mb ?? 0)
  const hasStorage = (report?.daily ?? []).some((item) => item.storage_used_mb > 0)
  const hasUsage = chartData.some((item) => item.chart_value > 0)

  if (projectLoading) return <ReportSkeleton isDark={isDark} />

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-6 pb-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className={cn("text-xs font-semibold uppercase tracking-[0.24em]", textSecondary)}>Project insights</p>
          <h1 className={cn("mt-2 text-3xl font-bold tracking-tight", isDark ? "text-white" : "text-slate-950")}>Reporting</h1>
          <p className={cn("mt-1.5 max-w-2xl text-sm", textSecondary)}>
            Track document storage and combined AI usage across everyone in a project.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FileText className={cn("size-4", textSecondary)} />
          <span className={cn("text-xs", textSecondary)}>{report?.project_name ?? "Current project report"}</span>
        </div>
      </header>

      <div className={cn("flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between", panelClass)}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Select date range</span>
            <select
              value={rangePreset}
              onChange={(event) => rangeChange(event.target.value as RangePreset)}
              className={cn(selectClass, "min-w-[150px] appearance-none pl-9 pr-9")}
            >
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Custom range</option>
            </select>
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-50" />
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-50" />
          </label>
          <button
            type="button"
            onClick={() => setRefreshIndex((value) => value + 1)}
            aria-label="Refresh project report"
            title="Refresh project report"
            className={cn("grid size-10 place-items-center rounded-xl border transition-colors", isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </button>
        </div>

        {rangePreset === "custom" && (
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-inherit pt-3 sm:w-auto sm:border-t-0 sm:pt-0">
            <label className="flex items-center gap-2">
              <span className={cn("text-xs", textSecondary)}>From</span>
              <input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className={selectClass} />
            </label>
            <label className="flex items-center gap-2">
              <span className={cn("text-xs", textSecondary)}>To</span>
              <input type="date" value={endDate} min={startDate} max={utcDateString(new Date())} onChange={(event) => setEndDate(event.target.value)} className={selectClass} />
            </label>
          </div>
        )}
      </div>

      {error && (
        <div className={cn("flex items-start gap-2 rounded-xl border px-4 py-3 text-sm", isDark ? "border-red-400/20 bg-red-400/[0.06] text-red-200" : "border-red-200 bg-red-50 text-red-800")}>
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {!projectId ? (
        <div className={cn("rounded-2xl border p-10 text-center", panelClass)}>
          <FileText className={cn("mx-auto mb-3 size-8", textSecondary)} />
          <p className={cn("font-semibold", isDark ? "text-white" : "text-slate-900")}>No project selected</p>
          <p className={cn("mt-1 text-sm", textSecondary)}>Select a project in the workspace to view its storage and AI usage report.</p>
        </div>
      ) : (
        <>
          <section className={cn("rounded-2xl border p-4 sm:p-6", panelClass)}>
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn("grid size-8 place-items-center rounded-lg", isDark ? "bg-sky-400/10 text-sky-300" : "bg-sky-50 text-sky-700")}>
                    <Database className="size-4" />
                  </span>
                  <h2 className={cn("text-base font-semibold", isDark ? "text-zinc-100" : "text-slate-900")}>Storage usage</h2>
                </div>
                <p className={cn("mt-2 text-xs", textSecondary)}>{report?.project_name ?? "Selected project"} · Daily document storage · {formatDay(startDate)} – {formatDay(endDate)} UTC</p>
              </div>
              <div className="sm:text-right">
                <p className={cn("text-[10px] font-semibold uppercase tracking-[0.16em]", textSecondary)}>At period end</p>
                <p className={cn("mt-1 text-3xl font-bold tabular-nums", isDark ? "text-white" : "text-slate-950")}>
                  {loading ? "—" : formatStorage(report?.storage_end_mb ?? 0)}
                </p>
                {!loading && (
                  <p className={cn("mt-0.5 text-xs", storageChange > 0 ? "text-emerald-500" : storageChange < 0 ? "text-amber-500" : textSecondary)}>
                    {storageChange > 0 ? "+" : ""}{formatStorage(storageChange)} in selected period
                  </p>
                )}
              </div>
            </div>
            <div className="h-[280px] w-full sm:h-[340px]">
              {!hasStorage ? (
                <div className={cn("flex h-full flex-col items-center justify-center text-center", textSecondary)}>
                  <Database className="mb-3 size-8 opacity-40" />
                  <p className={cn("text-sm font-medium", isDark ? "text-zinc-300" : "text-slate-700")}>No storage snapshots in this period</p>
                  <p className="mt-1 max-w-sm text-xs">Storage history appears after documents finish processing.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 8, bottom: 2 }}>
                    <defs>
                      <linearGradient id="storageFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.015} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={isDark ? "#34383b" : "#e5e7eb"} />
                    <XAxis dataKey="day_label" axisLine={{ stroke: isDark ? "#484d50" : "#cbd5e1" }} tickLine={false} tick={{ fill: isDark ? "#8d969a" : "#64748b", fontSize: 11 }} minTickGap={18} interval="preserveEnd" />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: isDark ? "#8d969a" : "#64748b", fontSize: 11 }} tickFormatter={(value: number) => formatStorage(value)} width={68} />
                    <Tooltip
                      cursor={{ stroke: isDark ? "#64748b" : "#94a3b8", strokeDasharray: "4 4" }}
                      content={({ active, payload, label }) => {
                        const row = payload?.[0]?.payload as DailyReport | undefined
                        if (!active || !row) return null
                        return (
                          <div className={cn("rounded-xl border p-3 shadow-xl", isDark ? "border-white/10 bg-[#1b1e20] text-zinc-100" : "border-slate-200 bg-white text-slate-900")}>
                            <p className={cn("mb-1 text-xs font-semibold", textSecondary)}>{label}</p>
                            <p className="text-sm font-semibold tabular-nums">{formatStorage(row.storage_used_mb)}</p>
                          </div>
                        )
                      }}
                    />
                    <Area type="monotone" dataKey="storage_used_mb" stroke="#38bdf8" strokeWidth={2.5} fill="url(#storageFill)" activeDot={{ r: 5, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className={cn("rounded-2xl border p-4 sm:p-6", panelClass)}>
            <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn("grid size-8 place-items-center rounded-lg", isDark ? "bg-emerald-400/10 text-emerald-300" : "bg-emerald-50 text-emerald-700")}>
                    <Sparkles className="size-4" />
                  </span>
                  <h2 className={cn("text-base font-semibold", isDark ? "text-zinc-100" : "text-slate-900")}>AI usage</h2>
                </div>
                <p className={cn("mt-2 text-xs", textSecondary)}>Combined across project members · {formatDay(startDate)} – {formatDay(endDate)} UTC</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {METRICS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMetric(item.id)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                      metric === item.id
                        ? isDark ? "bg-zinc-800 text-white shadow-sm" : "bg-slate-100 text-slate-950"
                        : isDark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-500 hover:text-slate-800",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Requests" value={loading ? "—" : formatCount(totals?.requests ?? 0)} detail={`${formatCount(totals?.successful_requests ?? 0)} successful · ${formatCount(totals?.failed_requests ?? 0)} failed`} icon={BarChart3} isDark={isDark} />
              <Stat label="Input tokens" value={loading ? "—" : formatCount(totals?.input_tokens ?? 0)} icon={Sparkles} isDark={isDark} />
              <Stat label="Output tokens" value={loading ? "—" : formatCount(totals?.output_tokens ?? 0)} icon={Sparkles} isDark={isDark} />
              <Stat label="Total cost" value={loading ? "—" : formatCurrency(totals?.total_cost ?? 0)} detail={`${formatCurrency(totals?.input_cost ?? 0)} input · ${formatCurrency(totals?.output_cost ?? 0)} output`} icon={Database} isDark={isDark} />
            </div>

            <div className="h-[300px] w-full sm:h-[360px]">
              {!hasUsage ? (
                <div className={cn("flex h-full flex-col items-center justify-center text-center", textSecondary)}>
                  <BarChart3 className="mb-3 size-8 opacity-40" />
                  <p className={cn("text-sm font-medium", isDark ? "text-zinc-300" : "text-slate-700")}>No AI usage in this period</p>
                  <p className="mt-1 max-w-sm text-xs">AI requests, tokens and costs will appear here as project members use Cortex.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 8, bottom: 2 }}>
                    <defs>
                      <linearGradient id="aiUsageFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.015} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={isDark ? "#34383b" : "#e5e7eb"} />
                    <XAxis dataKey="day_label" axisLine={{ stroke: isDark ? "#484d50" : "#cbd5e1" }} tickLine={false} tick={{ fill: isDark ? "#8d969a" : "#64748b", fontSize: 11 }} minTickGap={18} interval="preserveEnd" />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: isDark ? "#8d969a" : "#64748b", fontSize: 11 }} tickFormatter={metric === "cost" ? (value: number) => formatCurrency(value) : formatCount} width={metric === "cost" ? 96 : 48} />
                    <Tooltip
                      cursor={{ stroke: isDark ? "#64748b" : "#94a3b8", strokeDasharray: "4 4" }}
                      content={({ active, payload, label }) => {
                        const row = payload?.[0]?.payload as DailyReport | undefined
                        if (!active || !row) return null
                        return (
                          <div className={cn("min-w-[190px] rounded-xl border p-3 shadow-xl", isDark ? "border-white/10 bg-[#1b1e20] text-zinc-100" : "border-slate-200 bg-white text-slate-900")}>
                            <p className={cn("mb-2 text-xs font-semibold", textSecondary)}>{label}</p>
                            {metric === "cost" ? (
                              <>
                                <p className="flex justify-between gap-6 text-xs"><span style={{ color: INPUT_COLOR }}>Input cost</span><span className="font-semibold tabular-nums">{formatCurrency(row.input_cost)}</span></p>
                                <p className="mt-1 flex justify-between gap-6 text-xs"><span style={{ color: OUTPUT_COLOR }}>Output cost</span><span className="font-semibold tabular-nums">{formatCurrency(row.output_cost)}</span></p>
                                <p className="mt-2 flex justify-between gap-6 border-t border-inherit pt-2 text-xs"><span>Total cost</span><span className="font-semibold tabular-nums">{formatCurrency(row.total_cost)}</span></p>
                              </>
                            ) : metric === "requests" ? (
                              <>
                                <p className="flex justify-between gap-6 text-xs"><span>Requests</span><span className="font-semibold tabular-nums">{formatFullCount(row.requests)}</span></p>
                                <p className="mt-1 flex justify-between gap-6 text-xs"><span>Successful</span><span className="font-semibold tabular-nums">{formatFullCount(row.successful_requests)}</span></p>
                                <p className="mt-1 flex justify-between gap-6 text-xs"><span>Failed</span><span className="font-semibold tabular-nums">{formatFullCount(row.failed_requests)}</span></p>
                              </>
                            ) : (
                              <>
                                <p className="flex justify-between gap-6 text-xs"><span>Input tokens</span><span className="font-semibold tabular-nums">{formatFullCount(row.input_tokens)}</span></p>
                                <p className="mt-1 flex justify-between gap-6 text-xs"><span>Output tokens</span><span className="font-semibold tabular-nums">{formatFullCount(row.output_tokens)}</span></p>
                                <p className="mt-2 flex justify-between gap-6 border-t border-inherit pt-2 text-xs"><span>Total tokens</span><span className="font-semibold tabular-nums">{formatFullCount(row.total_tokens)}</span></p>
                              </>
                            )}
                          </div>
                        )
                      }}
                    />
                    <Area type="monotone" dataKey="chart_value" stroke="#10b981" strokeWidth={2.5} fill="url(#aiUsageFill)" activeDot={{ r: 5, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
            {(metric === "total_tokens" || metric === "cost") && (
              <div className={cn("mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t pt-4 text-xs", isDark ? "border-white/[0.07] text-zinc-400" : "border-slate-100 text-slate-500")}>
                <span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-full bg-emerald-500" />Daily total {metric === "cost" ? "cost" : "tokens"}</span>
                <span>Hover for input/output breakdown</span>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  )
}
