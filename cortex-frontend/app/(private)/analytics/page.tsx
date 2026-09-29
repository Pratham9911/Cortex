"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertCircle,
  BarChart3,
  CalendarDays,
  ChevronDown,
  RefreshCw,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarProps,
} from "recharts"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

type Metric =
  | "total_tokens"
  | "input_tokens"
  | "output_tokens"
  | "cost"
  | "requests"
type RangePreset = "7" | "14" | "30" | "90" | "custom"

type DailyUsage = {
  date: string
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

type ProjectUsage = {
  project_id: number
  project_name: string
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

type AnalyticsData = {
  start_date: string
  end_date: string
  selected_project_id: number | null
  model_name: string
  input_model_cost_per_million: number
  output_model_cost_per_million: number
  projects: { project_id: number; project_name: string }[]
  daily: DailyUsage[]
  projects_usage: ProjectUsage[]
  totals: {
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
}

const METRICS: { id: Metric; label: string }[] = [
  { id: "total_tokens", label: "Total tokens" },
  { id: "input_tokens", label: "Input tokens" },
  { id: "output_tokens", label: "Output tokens" },
  { id: "cost", label: "Cost" },
  { id: "requests", label: "Requests" },
]

const COLORS = {
  input: "#28b7b1",
  output: "#0d9278",
  single: "#0d9278",
}

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function dateDaysAgo(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return utcDateString(date)
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

function formatFullCount(value: number): string {
  return new Intl.NumberFormat("en").format(value)
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(value)
}

function formatMetricValue(value: number, selectedMetric: Metric): string {
  return selectedMetric.endsWith("_cost") ? formatCurrency(value) : formatFullCount(value)
}

function formatPercent(value: number): string {
  return `${value.toFixed(value < 10 ? 1 : 0)}%`
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function projectPercentage(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0
}

function AnalyticsSkeleton({ isDark }: { isDark: boolean }) {
  const pulse = isDark ? "animate-pulse bg-white/[0.07]" : "animate-pulse bg-slate-200"
  const panel = isDark ? "border-white/[0.08] bg-[#111315]" : "border-slate-200 bg-white"

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-6 pb-8" aria-label="Loading analytics">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-3">
          <div className={cn("h-3 w-32 rounded", pulse)} />
          <div className={cn("h-9 w-48 rounded-lg", pulse)} />
          <div className={cn("h-4 w-80 max-w-full rounded", pulse)} />
        </div>
        <div className={cn("h-8 w-36 rounded-full", pulse)} />
      </header>

      <div className={cn("flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between", panel)}>
        <div className="flex gap-2">
          {[88, 90, 92, 76].map((width, index) => (
            <div key={index} className={cn("h-9 rounded-lg", pulse)} style={{ width }} />
          ))}
        </div>
        <div className="flex gap-2">
          <div className={cn("h-10 w-40 rounded-xl", pulse)} />
          <div className={cn("h-10 w-36 rounded-xl", pulse)} />
          <div className={cn("size-10 rounded-xl", pulse)} />
        </div>
      </div>

      <section className={cn("rounded-2xl border p-4 sm:p-6", panel)}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className={cn("h-5 w-44 rounded", pulse)} />
            <div className={cn("h-3 w-56 rounded", pulse)} />
          </div>
          <div className="space-y-2">
            <div className={cn("ml-auto h-3 w-24 rounded", pulse)} />
            <div className={cn("h-8 w-28 rounded", pulse)} />
          </div>
        </div>
        <div className={cn("relative h-[300px] overflow-hidden rounded-xl sm:h-[360px]", isDark ? "bg-white/[0.02]" : "bg-slate-50")}>
          <div className="absolute inset-x-4 top-[20%] border-t border-dashed border-slate-500/15" />
          <div className="absolute inset-x-4 top-[40%] border-t border-dashed border-slate-500/15" />
          <div className="absolute inset-x-4 top-[60%] border-t border-dashed border-slate-500/15" />
          <div className="absolute inset-x-4 top-[80%] border-t border-dashed border-slate-500/15" />
          <div className="absolute inset-x-8 bottom-0 flex h-[82%] items-end justify-between gap-2">
            {[25, 48, 34, 66, 42, 76, 28, 55, 37, 62, 45, 30, 58, 40].map((height, index) => (
              <div
                key={index}
                className={cn("w-full max-w-10 rounded-t-md", pulse)}
                style={{ height: `${height}%`, animationDelay: `${index * 35}ms` }}
              />
            ))}
          </div>
        </div>
        <div className={cn("mt-4 flex justify-center gap-6 border-t pt-4", isDark ? "border-white/[0.07]" : "border-slate-100")}>
          <div className={cn("h-3 w-24 rounded", pulse)} />
          <div className={cn("h-3 w-24 rounded", pulse)} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((item) => (
          <section key={item} className={cn("space-y-5 rounded-2xl border p-5", panel)}>
            <div className="space-y-2">
              <div className={cn("h-4 w-32 rounded", pulse)} />
              <div className={cn("h-3 w-52 rounded", pulse)} />
            </div>
            {item === 0 ? (
              <>
                <div className={cn("h-2 rounded-full", pulse)} />
                <div className="grid grid-cols-2 gap-3">
                  {[0, 1].map((value) => (
                    <div key={value} className={cn("space-y-3 rounded-xl p-3", isDark ? "bg-white/[0.035]" : "bg-slate-50")}>
                      <div className={cn("h-3 w-16 rounded", pulse)} />
                      <div className={cn("h-6 w-14 rounded", pulse)} />
                      <div className={cn("h-3 w-24 rounded", pulse)} />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                {[0, 1, 2, 3].map((value) => (
                  <div key={value} className="space-y-2">
                    <div className="flex justify-between gap-3">
                      <div className={cn("h-3 w-28 rounded", pulse)} />
                      <div className={cn("h-3 w-20 rounded", pulse)} />
                    </div>
                    <div className={cn("h-1.5 rounded-full", pulse)} />
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </section>
  )
}

export default function AnalyticsPage() {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const [metric, setMetric] = useState<Metric>("total_tokens")
  const [rangePreset, setRangePreset] = useState<RangePreset>("14")
  const [startDate, setStartDate] = useState(() => dateDaysAgo(13))
  const [endDate, setEndDate] = useState(() => utcDateString(new Date()))
  const [selectedProject, setSelectedProject] = useState("all")
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refreshIndex, setRefreshIndex] = useState(0)

  const fetchAnalytics = useCallback(async (signal: AbortSignal) => {
    const token = localStorage.getItem("access_token") || localStorage.getItem("token")
    if (!token) {
      setError("Please sign in again to view usage analytics.")
      setAnalytics(null)
      setLoading(false)
      return
    }

    const params = new URLSearchParams({ start_date: startDate, end_date: endDate })
    if (selectedProject !== "all") params.set("project_id", selectedProject)
    setLoading(true)
    setError("")

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/me/ai-analytics?${params}`,
        {
          headers: { Authorization: ["Bearer", token].join(" ") },
          cache: "no-store",
          signal,
        }
      )
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(
          typeof result?.detail === "string"
            ? result.detail
            : "Unable to load usage analytics."
        )
      }
      setAnalytics(result as AnalyticsData)
    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === "AbortError") return
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load usage analytics.")
      setAnalytics(null)
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [endDate, selectedProject, startDate])

  useEffect(() => {
    const controller = new AbortController()
    void fetchAnalytics(controller.signal)
    return () => controller.abort()
  }, [fetchAnalytics, refreshIndex])

  const totals = analytics?.totals ?? {
    requests: 0,
    successful_requests: 0,
    failed_requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    input_cost: 0,
    output_cost: 0,
    total_cost: 0,
  }
  const metricLabel = METRICS.find((item) => item.id === metric)?.label ?? "Total tokens"
  const chartData = useMemo(
    () =>
      (analytics?.daily ?? []).map((item) => ({
        ...item,
        cost: item.total_cost,
        day_label: formatDay(item.date),
      })),
    [analytics?.daily]
  )
  const metricValue = (values: DailyUsage | ProjectUsage | typeof totals, selectedMetric: Metric) =>
    selectedMetric === "cost" ? values.total_cost : values[selectedMetric]
  const contributionTotal = metricValue(totals, metric)
  const isCostMetric = metric === "cost"
  const isSplitMetric = metric === "total_tokens" || isCostMetric

  const panelClass = isDark
    ? "border-white/[0.08] bg-[#111315]"
    : "border-slate-200 bg-white"
  const secondaryTextClass = isDark ? "text-zinc-400" : "text-slate-500"
  const selectClass = cn(
    "h-10 rounded-xl border px-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-emerald-500/30",
    isDark
      ? "border-white/10 bg-[#171a1c] text-zinc-100"
      : "border-slate-200 bg-white text-slate-800"
  )
  const rangeChange = (value: RangePreset) => {
    setRangePreset(value)
    if (value !== "custom") {
      const days = Number(value)
      setStartDate(dateDaysAgo(days - 1))
      setEndDate(utcDateString(new Date()))
    }
  }

  if (loading && !analytics) {
    return <AnalyticsSkeleton isDark={isDark} />
  }

  return (
    <section className="mx-auto w-full max-w-[1440px] space-y-6 pb-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className={cn("text-xs font-semibold uppercase tracking-[0.24em]", secondaryTextClass)}>
            Workspace insights
          </p>
          <h1 className={cn("mt-2 text-3xl font-bold tracking-tight", isDark ? "text-white" : "text-slate-950")}>
            Analytics
          </h1>
          <p className={cn("mt-1.5 max-w-2xl text-sm", secondaryTextClass)}>
            Explore your AI usage over time and see how each project contributes.
          </p>
        </div>
      </header>

      <div className={cn("flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between", panelClass)}>
        <div className={cn("inline-flex w-fit flex-wrap items-center gap-1 rounded-xl p-1", isDark ? "bg-white/[0.035]" : "bg-slate-100")}>
          {METRICS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMetric(item.id)}
              className={cn(
                "rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:text-sm",
                metric === item.id
                  ? isDark
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "bg-white text-slate-950 shadow-sm"
                  : isDark
                    ? "text-zinc-400 hover:text-zinc-200"
                    : "text-slate-500 hover:text-slate-800"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Filter by project</span>
            <select
              value={selectedProject}
              onChange={(event) => setSelectedProject(event.target.value)}
              className={cn(selectClass, "min-w-[170px] appearance-none pr-9")}
            >
              <option value="all">All projects</option>
              {(analytics?.projects ?? []).map((project) => (
                <option key={project.project_id} value={project.project_id}>
                  {project.project_name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 opacity-50" />
          </label>

          <label className="relative">
            <span className="sr-only">Select date range</span>
            <select
              value={rangePreset}
              onChange={(event) => rangeChange(event.target.value as RangePreset)}
              className={cn(selectClass, "min-w-[145px] appearance-none pl-9 pr-9")}
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
            aria-label="Refresh analytics"
            title="Refresh analytics"
            className={cn("grid size-10 place-items-center rounded-xl border transition-colors", isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </button>
        </div>

        {rangePreset === "custom" && (
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-inherit pt-3 sm:w-auto sm:border-t-0 sm:pt-0">
            <label className="flex items-center gap-2">
              <span className={cn("text-xs", secondaryTextClass)}>From</span>
              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(event) => setStartDate(event.target.value)}
                className={selectClass}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className={cn("text-xs", secondaryTextClass)}>To</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={utcDateString(new Date())}
                onChange={(event) => setEndDate(event.target.value)}
                className={selectClass}
              />
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

      <section className={cn("rounded-2xl border p-4 sm:p-6", panelClass)}>
        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2">
              <span className={cn("grid size-8 place-items-center rounded-lg", isDark ? "bg-emerald-400/10 text-emerald-300" : "bg-emerald-50 text-emerald-700")}>
                {metric === "requests" ? <Activity className="size-4" /> : <BarChart3 className="size-4" />}
              </span>
              <h2 className={cn("text-base font-semibold", isDark ? "text-zinc-100" : "text-slate-900")}>
                {metric === "requests"
                  ? "AI requests over time"
                  : `${isCostMetric ? "AI cost" : "Token usage"} over time`}
              </h2>
            </div>
            <p className={cn("mt-2 text-xs", secondaryTextClass)}>
              {selectedProject === "all" ? "Across all your projects" : "For the selected project"} · {formatDay(startDate)} – {formatDay(endDate)} UTC
            </p>
          </div>
          <div className="sm:text-right">
            <p className={cn("text-[10px] font-semibold uppercase tracking-[0.16em]", secondaryTextClass)}>
              {metric === "requests" ? "Requests" : metricLabel}
            </p>
            <p className={cn("mt-1 text-3xl font-bold tabular-nums", isDark ? "text-white" : "text-slate-950")}>
              {loading
                ? "—"
                : isCostMetric
                  ? formatCurrency(contributionTotal)
                  : formatCount(contributionTotal)}
            </p>
            {!loading && (
              <p className={cn("mt-0.5 text-xs", secondaryTextClass)}>
                {formatMetricValue(contributionTotal, metric)}
                {metric === "requests" ? " requests" : isCostMetric ? " USD" : " tokens"}
              </p>
            )}
          </div>
        </div>

        <div className="h-[300px] w-full sm:h-[360px]">
          {!chartData.some((item) => metricValue(item, metric) > 0) ? (
            <div className={cn("flex h-full flex-col items-center justify-center text-center", secondaryTextClass)}>
              <BarChart3 className="mb-3 size-8 opacity-40" />
              <p className={cn("text-sm font-medium", isDark ? "text-zinc-300" : "text-slate-700")}>No usage in this period</p>
              <p className="mt-1 max-w-sm text-xs">AI requests and token usage will appear here as you use Cortex.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 8, left: 4, bottom: 2 }}>
                <CartesianGrid vertical={false} stroke={isDark ? "#34383b" : "#e5e7eb"} />
                <XAxis
                  dataKey="day_label"
                  axisLine={{ stroke: isDark ? "#484d50" : "#cbd5e1" }}
                  tickLine={false}
                  tick={{ fill: isDark ? "#8d969a" : "#64748b", fontSize: 11 }}
                  minTickGap={18}
                  interval="preserveEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: isDark ? "#8d969a" : "#64748b", fontSize: 11 }}
                  tickFormatter={isCostMetric ? formatCurrency : formatCount}
                  width={isCostMetric ? 96 : 48}
                />
                <Tooltip
                  cursor={{ fill: isDark ? "rgba(255,255,255,0.035)" : "rgba(15,23,42,0.035)" }}
                  content={({ active, payload, label }) => {
                    const row = payload?.[0]?.payload as DailyUsage | undefined
                    if (!active || !row) return null
                    return (
                      <div className={cn("min-w-[190px] rounded-xl border p-3 shadow-xl", isDark ? "border-white/10 bg-[#1b1e20] text-zinc-100" : "border-slate-200 bg-white text-slate-900")}>
                        <p className={cn("mb-2 text-xs font-semibold", secondaryTextClass)}>{label}</p>
                        <div className="space-y-1.5 text-xs">
                          {isCostMetric ? (
                            <>
                              <p className="flex justify-between gap-6">
                                <span style={{ color: COLORS.input }}>Input cost</span>
                                <span className="font-semibold tabular-nums">{formatCurrency(row.input_cost)}</span>
                              </p>
                              <p className="flex justify-between gap-6">
                                <span style={{ color: COLORS.output }}>Output cost</span>
                                <span className="font-semibold tabular-nums">{formatCurrency(row.output_cost)}</span>
                              </p>
                              <div className={cn("my-1 border-t", isDark ? "border-white/10" : "border-slate-100")} />
                              <p className="flex justify-between gap-6">
                                <span>Total cost</span>
                                <span className="font-semibold tabular-nums">{formatCurrency(row.total_cost)}</span>
                              </p>
                            </>
                          ) : metric === "requests" ? (
                            <>
                              <p className="flex justify-between gap-6">
                                <span>Total requests</span>
                                <span className="font-semibold tabular-nums">{formatFullCount(row.requests)}</span>
                              </p>
                              <p className="flex items-center justify-between gap-6">
                                <span className="inline-flex items-center gap-2">
                                  <i className="size-2 rounded-full bg-emerald-500" />
                                  Successful
                                </span>
                                <span className="font-semibold tabular-nums">{formatFullCount(row.successful_requests)}</span>
                              </p>
                              <p className="flex items-center justify-between gap-6">
                                <span className="inline-flex items-center gap-2">
                                  <i className="size-2 rounded-full bg-red-500" />
                                  Failed
                                </span>
                                <span className="font-semibold tabular-nums">{formatFullCount(row.failed_requests)}</span>
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="flex justify-between gap-6"><span>Input tokens</span><span className="font-semibold tabular-nums">{formatFullCount(row.input_tokens)}</span></p>
                              <p className="flex justify-between gap-6"><span>Output tokens</span><span className="font-semibold tabular-nums">{formatFullCount(row.output_tokens)}</span></p>
                              <div className={cn("my-1 border-t", isDark ? "border-white/10" : "border-slate-100")} />
                              <p className="flex justify-between gap-6"><span>Total tokens</span><span className="font-semibold tabular-nums">{formatFullCount(row.total_tokens)}</span></p>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  }}
                />
                {isSplitMetric ? (
                  <Bar
                    dataKey={metric}
                    shape={(props: BarProps) => {
                      const row = chartData[Number(props.index)]
                      const x = Number(props.x ?? 0)
                      const y = Number(props.y ?? 0)
                      const width = Number(props.width ?? 0)
                      const height = Number(props.height ?? 0)
                      const inputValue = isCostMetric
                        ? row?.input_cost ?? 0
                        : row?.input_tokens ?? 0
                      const outputValue = isCostMetric
                        ? row?.output_cost ?? 0
                        : row?.output_tokens ?? 0
                      const total = inputValue + outputValue
                      const inputHeight = total > 0
                        ? height * (inputValue / total)
                        : 0
                      const outputHeight = height - inputHeight

                      return (
                        <g>
                          <rect
                            x={x}
                            y={y}
                            width={width}
                            height={outputHeight}
                            fill={COLORS.output}
                            rx={2}
                          />
                          <rect
                            x={x}
                            y={y + outputHeight}
                            width={width}
                            height={inputHeight}
                            fill={COLORS.input}
                          />
                        </g>
                      )
                    }}
                    maxBarSize={38}
                  />
                ) : (
                  <Bar
                    dataKey={metric}
                    fill={metric === "output_tokens" ? COLORS.output : COLORS.single}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={38}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        {isSplitMetric && (
          <div className={cn("mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t pt-4 text-xs", isDark ? "border-white/[0.07] text-zinc-400" : "border-slate-100 text-slate-500")}>
            <span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-sm" style={{ backgroundColor: COLORS.input }} />{isCostMetric ? "Input cost" : "Input tokens"}</span>
            <span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-sm" style={{ backgroundColor: COLORS.output }} />{isCostMetric ? "Output cost" : "Output tokens"}</span>
            <span>Bar height is total {isCostMetric ? "cost" : "tokens"}</span>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className={cn("rounded-2xl border p-5", panelClass)}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className={cn("text-sm font-semibold", isDark ? "text-zinc-100" : "text-slate-900")}>
                {isCostMetric ? "Cost breakdown" : metric === "requests" ? "Request outcomes" : "Token mix"}
              </h2>
              <p className={cn("mt-1 text-xs", secondaryTextClass)}>
                {isCostMetric ? "Input and output cost for this period" : metric === "requests" ? "Successful and failed AI requests" : "Input and output token totals"}
              </p>
              {isCostMetric && analytics && (
                <p className={cn("mt-1 text-xs", secondaryTextClass)}>
                  {analytics.model_name} pack rates: input {formatCurrency(analytics.input_model_cost_per_million)} / 1M tokens · output {formatCurrency(analytics.output_model_cost_per_million)} / 1M tokens
                </p>
              )}
            </div>
            <span className={cn("text-xs font-medium tabular-nums", secondaryTextClass)}>
              {isCostMetric
                ? formatCurrency(totals.total_cost)
                : metric === "requests"
                  ? `${formatFullCount(totals.requests)} total`
                  : `${formatFullCount(totals.total_tokens)} total`}
            </span>
          </div>
          {isCostMetric ? (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className={cn("rounded-xl p-3", isDark ? "bg-white/[0.035]" : "bg-slate-50")}>
                <p className={cn("text-xs", secondaryTextClass)}>Input</p>
                <p className={cn("mt-1 text-lg font-semibold tabular-nums", isDark ? "text-white" : "text-slate-900")}>
                  {formatCurrency(totals.input_cost)}
                </p>
              </div>
              <div className={cn("rounded-xl p-3", isDark ? "bg-white/[0.035]" : "bg-slate-50")}>
                <p className={cn("text-xs", secondaryTextClass)}>Output</p>
                <p className={cn("mt-1 text-lg font-semibold tabular-nums", isDark ? "text-white" : "text-slate-900")}>
                  {formatCurrency(totals.output_cost)}
                </p>
              </div>
            </div>
          ) : metric === "requests" ? (
            <div className="mt-5 space-y-3">
              <p className={cn("flex items-center justify-between text-sm", isDark ? "text-zinc-200" : "text-slate-700")}>
                <span className="inline-flex items-center gap-2">
                  <i className="size-2.5 rounded-full bg-emerald-500" />
                  Successful
                </span>
                <span className="font-semibold tabular-nums">{formatFullCount(totals.successful_requests)}</span>
              </p>
              <p className={cn("flex items-center justify-between text-sm", isDark ? "text-zinc-200" : "text-slate-700")}>
                <span className="inline-flex items-center gap-2">
                  <i className="size-2.5 rounded-full bg-red-500" />
                  Failed
                </span>
                <span className="font-semibold tabular-nums">{formatFullCount(totals.failed_requests)}</span>
              </p>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className={cn("rounded-xl p-3", isDark ? "bg-white/[0.035]" : "bg-slate-50")}>
                <p className={cn("text-xs", secondaryTextClass)}>Input</p>
                <p className={cn("mt-1 text-lg font-semibold tabular-nums", isDark ? "text-white" : "text-slate-900")}>{formatFullCount(totals.input_tokens)}</p>
                <p className={cn("text-[11px]", secondaryTextClass)}>tokens</p>
              </div>
              <div className={cn("rounded-xl p-3", isDark ? "bg-white/[0.035]" : "bg-slate-50")}>
                <p className={cn("text-xs", secondaryTextClass)}>Output</p>
                <p className={cn("mt-1 text-lg font-semibold tabular-nums", isDark ? "text-white" : "text-slate-900")}>{formatFullCount(totals.output_tokens)}</p>
                <p className={cn("text-[11px]", secondaryTextClass)}>tokens</p>
              </div>
            </div>
          )}
        </div>

        <div className={cn("rounded-2xl border p-5", panelClass)}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className={cn("text-sm font-semibold", isDark ? "text-zinc-100" : "text-slate-900")}>Project contribution</h2>
              <p className={cn("mt-1 text-xs", secondaryTextClass)}>{metricLabel} share across projects in this period</p>
            </div>
            <span className={cn("text-xs font-medium tabular-nums", secondaryTextClass)}>
              {formatMetricValue(contributionTotal, metric)}
              {metric === "requests" ? " requests" : isCostMetric ? " USD" : " tokens"}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {(analytics?.projects_usage ?? []).length === 0 ? (
              <p className={cn("py-5 text-center text-sm", secondaryTextClass)}>No projects available.</p>
            ) : (
              (analytics?.projects_usage ?? []).map((project) => {
                const value = metricValue(project, metric)
                const percentage = projectPercentage(value, contributionTotal)
                return (
                  <div key={project.project_id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className={cn("min-w-0 truncate font-medium", isDark ? "text-zinc-200" : "text-slate-700")} title={project.project_name}>
                        {project.project_name}
                      </span>
                      <span className={cn("shrink-0 tabular-nums", secondaryTextClass)}>
                        {formatMetricValue(value, metric)} <span className="ml-1 font-semibold">{formatPercent(percentage)}</span>
                      </span>
                    </div>
                    <div className={cn("h-1.5 overflow-hidden rounded-full", isDark ? "bg-white/5" : "bg-slate-100")}>
                      <div
                        className="h-full rounded-full bg-[#0d9278] transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </section>
    </section>
  )
}
