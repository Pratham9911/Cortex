"use client"

import React, { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import {
  Download, Search, ShieldCheck, CheckCircle2,
  XCircle, RotateCw, ChevronDown, FileText,
  Folder, Layers, X, ChevronLeft, ChevronRight, Activity, Briefcase
} from "lucide-react"
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip
} from "recharts"
import { cn } from "@/lib/utils"

// ─── FileIcon Helper (matches public /icons/ asset paths) ──────────────────────
function FileIcon({ fileName, size = "sm" }: { fileName?: string; size?: "sm" | "lg" }) {
  const ext = fileName?.split(".").pop()?.toLowerCase()
  const dim = size === "lg" ? "w-16 h-16" : "w-4 h-4"
  if (ext === "pdf") return <img src="/icons/pdf.svg" className={cn(dim, "object-contain shrink-0")} alt="PDF" />
  if (ext === "txt") return <img src="/icons/txt.svg" className={cn(dim, "object-contain shrink-0")} alt="TXT" />
  if (ext === "md") return <img src="/icons/md.png" className={cn(dim, "object-contain shrink-0")} alt="MD" />
  if (ext === "docx") return <img src="/icons/docx.png" className={cn(dim, "object-contain shrink-0")} alt="DOCX" />
  if (ext === "pptx") return <img src="/icons/pptx.png" className={cn(dim, "object-contain shrink-0")} alt="PPTX" />
  return (
    <div className={cn("flex items-center justify-center rounded shrink-0", size === "lg" ? "w-16 h-16 bg-zinc-200 dark:bg-zinc-700" : "")}>
      <svg className={cn(dim, "text-zinc-400")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    </div>
  )
}

function ParsedDescription({ text, isDark, maxChars }: { text: string; isDark: boolean; maxChars?: number }) {
  if (!text) return null
  const displayText = maxChars && text.length > maxChars ? text.slice(0, maxChars) + "..." : text
  const parts = displayText.split(/('[^']+'|"[^"]+")/g)
  return (
    <span className="font-medium text-xs leading-relaxed">
      {parts.map((part, idx) => {
        if ((part.startsWith("'") && part.endsWith("'")) || (part.startsWith('"') && part.endsWith('"'))) {
          const inner = part.slice(1, -1)
          return (
            <span
              key={idx}
              className={cn(
                "inline-flex items-center px-1.5 py-0.5 rounded font-mono font-bold text-[11px] mx-0.5 border",
                isDark
                  ? "bg-violet-500/10 text-violet-300 border-violet-500/30"
                  : "bg-violet-50 text-violet-700 border-violet-200"
              )}
            >
              {inner}
            </span>
          )
        }
        return <span key={idx}>{part}</span>
      })}
    </span>
  )
}

// ─── Types ──────────────────────────────────────────────────────────────────
interface AuditLogActor {
  user_id: number | null
  name: string
  type: string
}

interface AuditLogResource {
  type: string
  id: string
  name?: string
}

interface AuditLogItem {
  log_id: number
  project_id: number
  event_type: string
  action: "create" | "update" | "delete" | "system" | string
  status: "success" | "failed" | string
  actor: AuditLogActor
  resource: AuditLogResource
  before: Record<string, any> | null
  after: Record<string, any> | null
  metadata: Record<string, any> | null
  description: string
  created_at: string
}

interface AuditStats {
  total_events: number
  success_events: number
  failed_events: number
  creates_count: number
  updates_count: number
  deletes_count: number
  system_count: number
  daily_activity: Array<{
    date: string
    total: number
    creates: number
    updates: number
    deletes: number
    system: number
    failed: number
  }>
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function AuditLogsPage() {
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const isDark = mounted && theme === "dark"
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  // Core Filters State
  const [query, setQuery] = useState("")
  const [days, setDays] = useState<number>(30)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [eventType, setEventType] = useState("all")
  const [actionFilter, setActionFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [resourceFilter, setResourceFilter] = useState("all")
  const [selectedActorId, setSelectedActorId] = useState<string>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20

  // Action card dropdown metric state
  const [actionCardMetric, setActionCardMetric] = useState<"update" | "create" | "delete" | "system">("update")

  // Async Data State
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [totalLogs, setTotalLogs] = useState(0)
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // User Avatars Map
  const [avatars, setAvatars] = useState<Record<string, string | null>>({})

  // Detail Drawer State
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null)

  // Fetch Stats & Logs
  const fetchAuditData = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      if (!projectId) return

      const params = new URLSearchParams()
      if (days && !selectedDate) params.set("days", days.toString())
      if (selectedDate) {
        params.set("start_date", `${selectedDate}T00:00:00Z`)
        params.set("end_date", `${selectedDate}T23:59:59Z`)
      }
      if (eventType !== "all") params.set("event_type", eventType)
      if (actionFilter !== "all") params.set("action", actionFilter)
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (resourceFilter !== "all") params.set("resource_type", resourceFilter)
      if (selectedActorId !== "all") params.set("actor_user_id", selectedActorId)
      if (query.trim()) params.set("q", query.trim())

      // Fetch stats
      setStatsLoading(true)
      fetch(`${apiUrl}/projects/${projectId}/audit-logs/stats?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setStats(data)
        })
        .catch(() => { })
        .finally(() => setStatsLoading(false))

      // Fetch logs page
      params.set("page", currentPage.toString())
      params.set("page_size", pageSize.toString())

      const res = await fetch(`${apiUrl}/projects/${projectId}/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (res.ok) {
        const data = await res.json()
        setLogs(data.items || [])
        setTotalLogs(data.total || 0)

        // Resolve avatars for actors
        const userIds = Array.from(new Set(
          (data.items || [])
            .map((item: AuditLogItem) => item.actor?.user_id)
            .filter((id: number | null): id is number => id !== null && id !== undefined)
        ))

        if (userIds.length > 0) {
          fetch(`${apiUrl}/users/avatars?${userIds.map((id) => `user_ids=${id}`).join("&")}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((avData) => {
              if (avData?.avatars) setAvatars(avData.avatars)
            })
            .catch(() => { })
        }
      }
    } catch (err) {
      console.error("Error loading audit logs:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAuditData()
  }, [currentPage, days, selectedDate, eventType, actionFilter, statusFilter, resourceFilter, selectedActorId, query])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [days, selectedDate, eventType, actionFilter, statusFilter, resourceFilter, selectedActorId, query])

  // Filtered Export to CSV (strictly currently visible/filtered dataset)
  const handleExportCSV = async () => {
    setExporting(true)
    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      if (!projectId) return

      const params = new URLSearchParams()
      if (days && !selectedDate) params.set("days", days.toString())
      if (selectedDate) {
        params.set("start_date", `${selectedDate}T00:00:00Z`)
        params.set("end_date", `${selectedDate}T23:59:59Z`)
      }
      if (eventType !== "all") params.set("event_type", eventType)
      if (actionFilter !== "all") params.set("action", actionFilter)
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (resourceFilter !== "all") params.set("resource_type", resourceFilter)
      if (selectedActorId !== "all") params.set("actor_user_id", selectedActorId)
      if (query.trim()) params.set("q", query.trim())
      params.set("page", "1")
      params.set("page_size", "500")

      const res = await fetch(`${apiUrl}/projects/${projectId}/audit-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (res.ok) {
        const data = await res.json()
        const exportItems: AuditLogItem[] = data.items || []

        const headers = ["Log ID", "Timestamp", "Actor Name", "Resource Name", "Description", "Action", "Status"]
        const rows = exportItems.map((item) => [
          item.log_id,
          item.created_at,
          `"${(item.actor?.name || "").replace(/"/g, '""')}"`,
          `"${(item.resource?.name || item.resource?.id || "").replace(/"/g, '""')}"`,
          `"${(item.description || "").replace(/"/g, '""')}"`,
          item.action,
          item.status
        ])

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n")
        const encodedUri = encodeURI(csvContent)
        const link = document.createElement("a")
        link.setAttribute("href", encodedUri)
        link.setAttribute("download", `audit_logs_filtered_${new Date().toISOString().slice(0, 10)}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    } catch (err) {
      console.error("Export error:", err)
    } finally {
      setExporting(false)
    }
  }

  // Calculate Action Color System (Restrained Semantic Colors)
  const getActionBadge = (action: string) => {
    switch (action.toLowerCase()) {
      case "create":
        return {
          label: "Create",
          dot: "bg-emerald-500",
          badge: isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-200"
        }
      case "update":
        return {
          label: "Update",
          dot: "bg-blue-500",
          badge: isDark ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-blue-50 text-blue-700 border-blue-200"
        }
      case "delete":
        return {
          label: "Delete",
          dot: "bg-rose-500",
          badge: isDark ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-rose-50 text-rose-700 border-rose-200"
        }
      default:
        return {
          label: "System",
          dot: "bg-zinc-400",
          badge: isDark ? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" : "bg-zinc-100 text-zinc-700 border-zinc-200"
        }
    }
  }

  const formatTimestamp = (isoStr: string) => {
    if (!isoStr) return ""
    try {
      const d = new Date(isoStr)
      return d.toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
      })
    } catch {
      return isoStr
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalLogs / pageSize))

  return (
    <div className="flex flex-col flex-1 min-w-0 space-y-6 pb-12">
      {/* ── 1. HEADER ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-violet-500 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">
              System Audit
            </span>
          </div>
          <h1 className={cn("mt-1.5 text-2xl font-extrabold tracking-tight", isDark ? "text-white" : "text-slate-900")}>
            Audit Logs
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Track system operations, document changes, user activities, and security events.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          disabled={exporting}
          className={cn(
            "h-9 px-4 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-sm shrink-0",
            isDark
              ? "bg-violet-600 hover:bg-violet-500 text-white"
              : "bg-violet-600 hover:bg-violet-700 text-white"
          )}
        >
          {exporting ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          <span>Export Filtered CSV</span>
        </button>
      </div>

      {/* ── 2. KPI METRICS CARDS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Events */}
        <div className={cn("p-4 rounded-2xl border transition-all", isDark ? "bg-[#151518] border-zinc-800" : "bg-white border-slate-200 shadow-sm")}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Total Events</span>
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <p className={cn("text-2xl font-extrabold mt-3", isDark ? "text-white" : "text-slate-900")}>
            {statsLoading ? "..." : (stats?.total_events || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-zinc-400 mt-1">Total recorded in scope</p>
        </div>

        {/* Successful Events */}
        <div className={cn("p-4 rounded-2xl border transition-all", isDark ? "bg-[#151518] border-zinc-800" : "bg-white border-slate-200 shadow-sm")}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Successful</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className={cn("text-2xl font-extrabold mt-3", isDark ? "text-white" : "text-slate-900")}>
            {statsLoading ? "..." : (stats?.success_events || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-emerald-500/80 font-medium mt-1">
            {stats?.total_events ? `${Math.round((stats.success_events / stats.total_events) * 100)}% execution rate` : "100% execution rate"}
          </p>
        </div>

        {/* Action Toggle Card (Create, Update, Delete, System) */}
        <div className={cn("p-4 rounded-2xl border transition-all relative", isDark ? "bg-[#151518] border-zinc-800" : "bg-white border-slate-200 shadow-sm")}>
          <div className="flex items-center justify-between">
            <select
              value={actionCardMetric}
              onChange={(e) => setActionCardMetric(e.target.value as any)}
              className={cn("text-[11px] font-semibold uppercase tracking-wider bg-transparent cursor-pointer focus:outline-none pr-4", isDark ? "text-blue-400" : "text-blue-600")}
            >
              <option value="update">Updates</option>
              <option value="create">Creates</option>
              <option value="delete">Deletes</option>
              <option value="system">System</option>
            </select>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <p className={cn("text-2xl font-extrabold mt-3", isDark ? "text-white" : "text-slate-900")}>
            {statsLoading ? "..." : (
              actionCardMetric === "create" ? (stats?.creates_count || 0) :
                actionCardMetric === "update" ? (stats?.updates_count || 0) :
                  actionCardMetric === "delete" ? (stats?.deletes_count || 0) :
                    (stats?.system_count || 0)
            ).toLocaleString()}
          </p>
          <p className="text-[11px] text-zinc-400 mt-1 capitalize">{actionCardMetric} actions in current filter</p>
        </div>

        {/* Failed Events */}
        <div className={cn("p-4 rounded-2xl border transition-all", isDark ? "bg-[#151518] border-zinc-800" : "bg-white border-slate-200 shadow-sm")}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">Failed Events</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <p className={cn("text-2xl font-extrabold mt-3", isDark ? "text-white" : "text-slate-900")}>
            {statsLoading ? "..." : (stats?.failed_events || 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-rose-400/80 font-medium mt-1">Requires administrator attention</p>
        </div>
      </div>

      {/* ── 3. ACTIVITY AREA GRAPH (RECHARTS) ────────────────────────────────── */}
      <div className={cn("p-5 rounded-2xl border transition-all space-y-4", isDark ? "bg-[#151518] border-zinc-800" : "bg-white border-slate-200 shadow-sm")}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className={cn("text-sm font-bold", isDark ? "text-white" : "text-slate-900")}>Event Activity Trend</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Daily audit operations breakdown. Click any day to isolate logs.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-zinc-800/40 p-1 rounded-xl border border-zinc-700/40 text-xs font-semibold shrink-0">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => { setDays(d); setSelectedDate(null); }}
                className={cn(
                  "px-3 py-1 rounded-lg transition-all",
                  days === d && !selectedDate
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                {d} days
              </button>
            ))}
            {selectedDate && (
              <button
                onClick={() => setSelectedDate(null)}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1"
              >
                <span>{selectedDate}</span>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="h-48 w-full pt-2">
          {statsLoading ? (
            <div className="flex items-center justify-center h-full text-xs text-zinc-500">Loading activity timeline...</div>
          ) : !stats?.daily_activity || stats.daily_activity.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-zinc-500">No activity recorded for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={stats.daily_activity}
                onClick={(e: any) => {
                  if (e?.activePayload?.[0]?.payload?.date) {
                    setSelectedDate(e.activePayload[0].payload.date)
                  }
                }}
              >
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload
                      return (
                        <div className={cn("p-3 rounded-xl border text-xs shadow-2xl space-y-1.5 min-w-[160px]", isDark ? "bg-zinc-900/95 border-zinc-700 text-white" : "bg-white border-slate-200 text-slate-900")}>
                          <p className="font-bold text-[11px] border-b border-zinc-700/40 pb-1">{data.date}</p>
                          <div className="flex items-center justify-between text-zinc-300">
                            <span>Total Events:</span>
                            <span className="font-bold text-violet-400">{data.total}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Creates:</span>
                            <span className="font-mono font-semibold">{data.creates}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Updates:</span>
                            <span className="font-mono font-semibold">{data.updates}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Deletes:</span>
                            <span className="font-mono font-semibold">{data.deletes}</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-400" /> System:</span>
                            <span className="font-mono font-semibold">{data.system}</span>
                          </div>
                          {data.failed > 0 && (
                            <div className="flex items-center justify-between text-[11px] text-rose-400 font-bold">
                              <span>Failed:</span>
                              <span>{data.failed}</span>
                            </div>
                          )}
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Area type="monotone" dataKey="total" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorTotal)" cursor="pointer" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── 4. SEARCH & MULTI-FILTER CONTROL BAR ────────────────────────────── */}
      <div className={cn("p-4 rounded-2xl border space-y-3", isDark ? "bg-[#151518] border-zinc-800" : "bg-white border-slate-200 shadow-sm")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <div className="lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by description, actor, resource ID, filename..."
              className={cn(
                "w-full h-9 pl-9 pr-3 rounded-xl text-xs font-medium border outline-none transition-colors",
                isDark ? "bg-zinc-900 border-zinc-700/80 text-white focus:border-violet-500" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-violet-500"
              )}
            />
          </div>

          {/* Action Filter */}
          <div className="relative">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className={cn(
                "w-full h-9 pl-3 pr-8 rounded-xl text-xs font-semibold border outline-none appearance-none cursor-pointer",
                isDark ? "bg-zinc-900 border-zinc-700/80 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
              )}
            >
              <option value="all">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="system">System</option>
            </select>
            <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={cn(
                "w-full h-9 pl-3 pr-8 rounded-xl text-xs font-semibold border outline-none appearance-none cursor-pointer",
                isDark ? "bg-zinc-900 border-zinc-700/80 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
              )}
            >
              <option value="all">All Statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
            <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Resource Filter */}
          <div className="relative">
            <select
              value={resourceFilter}
              onChange={(e) => setResourceFilter(e.target.value)}
              className={cn(
                "w-full h-9 pl-3 pr-8 rounded-xl text-xs font-semibold border outline-none appearance-none cursor-pointer",
                isDark ? "bg-zinc-900 border-zinc-700/80 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
              )}
            >
              <option value="all">All Resources</option>
              <option value="document">Document</option>
              <option value="folder">Folder</option>
              <option value="project">Project</option>
            </select>
            <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Filter Pills */}
        {(query || actionFilter !== "all" || statusFilter !== "all" || resourceFilter !== "all" || selectedDate) && (
          <div className="flex items-center gap-2 pt-1 flex-wrap text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Active Filters:</span>
            {query && (
              <span className="px-2.5 py-0.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 flex items-center gap-1">
                Query: "{query}" <X className="w-3 h-3 cursor-pointer" onClick={() => setQuery("")} />
              </span>
            )}
            {actionFilter !== "all" && (
              <span className="px-2.5 py-0.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 flex items-center gap-1">
                Action: {actionFilter} <X className="w-3 h-3 cursor-pointer" onClick={() => setActionFilter("all")} />
              </span>
            )}
            {statusFilter !== "all" && (
              <span className="px-2.5 py-0.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 flex items-center gap-1">
                Status: {statusFilter} <X className="w-3 h-3 cursor-pointer" onClick={() => setStatusFilter("all")} />
              </span>
            )}
            {resourceFilter !== "all" && (
              <span className="px-2.5 py-0.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 flex items-center gap-1">
                Resource: {resourceFilter} <X className="w-3 h-3 cursor-pointer" onClick={() => setResourceFilter("all")} />
              </span>
            )}
            <button
              onClick={() => { setQuery(""); setActionFilter("all"); setStatusFilter("all"); setResourceFilter("all"); setSelectedDate(null); }}
              className="text-xs text-zinc-400 hover:text-white underline ml-1"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* ── 5. MAIN AUDIT LOG TABLE (NEW COLUMN ORDER: Timestamp 1st, Action 2nd Last) ────── */}
      <div className={cn("rounded-2xl border overflow-hidden flex flex-col transition-all", isDark ? "bg-[#151518] border-zinc-800" : "bg-white border-slate-200 shadow-sm")}>
        <div className={cn("flex items-center h-10 text-[11px] font-semibold uppercase tracking-wider shrink-0 border-b px-4 select-none", isDark ? "text-zinc-400 border-zinc-800 bg-[#0f0f12]" : "text-slate-500 border-slate-200 bg-slate-50")}>
          <div className="w-32 text-left">Timestamp</div>
          <div className="w-44 text-left">Actor</div>
          <div className="w-52 text-left">Resource</div>
          <div className="flex-1 text-left pl-2">Description</div>
          <div className="w-24 text-left">Action</div>
          <div className="w-20 text-center">Status</div>
        </div>

        <div className="divide-y divide-zinc-800/40">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-xs text-zinc-400">Loading audit records...</div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center p-6 space-y-2">
              <ShieldCheck className="w-8 h-8 text-zinc-500" />
              <p className="text-sm font-semibold text-zinc-300">No matching audit logs found</p>
              <p className="text-xs text-zinc-500">Try adjusting your search query or filter parameters.</p>
            </div>
          ) : (
            logs.map((item) => {
              const actBadge = getActionBadge(item.action)
              const fileName = item.metadata?.filename || item.metadata?.file_name
              const actorAvatar = item.actor?.user_id ? avatars[item.actor.user_id.toString()] : null
              const resourceName = item.resource.name || fileName || `${item.resource.type}:${item.resource.id}`

              return (
                <div
                  key={item.log_id}
                  onClick={() => setSelectedLog(item)}
                  className={cn(
                    "flex items-center h-12 text-xs px-4 transition-colors cursor-pointer group select-none",
                    isDark ? "hover:bg-zinc-900/70 text-zinc-300" : "hover:bg-slate-50 text-slate-800"
                  )}
                >
                  {/* Column 1: Timestamp (First) */}
                  <div className="w-32 text-xs text-zinc-400 font-mono shrink-0">
                    {formatTimestamp(item.created_at)}
                  </div>

                  {/* Column 2: Actor Avatar + Name */}
                  <div className="w-44 flex items-center gap-2 shrink-0 truncate pr-2">
                    {actorAvatar ? (
                      <img src={actorAvatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-violet-600/20 text-violet-400 text-[9px] font-bold flex items-center justify-center shrink-0 border border-violet-500/30 uppercase">
                        {item.actor?.name ? item.actor.name.slice(0, 2) : "SY"}
                      </div>
                    )}
                    <span className={cn("truncate font-medium text-xs", isDark ? "text-zinc-200" : "text-slate-900")}>
                      {item.actor?.name || "System"}
                    </span>
                  </div>

                  {/* Column 3: Resource (Icon + Name + Type Badge) */}
                  <div className="w-52 flex items-center gap-2 shrink-0 truncate pr-2">
                    {item.resource.type === "document" || item.resource.type === "version" ? (
                      <FileIcon fileName={resourceName} />
                    ) : item.resource.type === "project" ? (
                      <Briefcase className="w-4 h-4 text-violet-400 shrink-0" />
                    ) : (
                      <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1 truncate flex items-center gap-1.5">
                      <span className={cn("truncate font-semibold text-xs", isDark ? "text-zinc-200" : "text-slate-900")} title={resourceName}>
                        {resourceName}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-800/60 px-1.5 py-0.5 rounded shrink-0">
                        {item.resource.type}
                      </span>
                    </div>
                  </div>

                  {/* Column 4: Human-Readable Narrative Description */}
                  <div className="flex-1 min-w-0 pl-2 pr-4 truncate" title={item.description}>
                    <ParsedDescription text={item.description} isDark={isDark} maxChars={60} />
                  </div>

                  {/* Column 5: Action Badge (Second Last Column) */}
                  <div className="w-24 flex items-center shrink-0">
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-md font-bold border flex items-center gap-1.5", actBadge.badge)}>
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", actBadge.dot)} />
                      {actBadge.label}
                    </span>
                  </div>

                  {/* Column 6: Execution Status (Last Column) */}
                  <div className="w-20 flex justify-center shrink-0">
                    {item.status === "success" ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Success
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> Failed
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ── 6. PAGINATION FOOTER ────────────────────────────────────────── */}
        <div className={cn("flex items-center justify-between h-11 px-4 text-xs border-t", isDark ? "border-zinc-800 text-zinc-400 bg-[#0f0f12]" : "border-slate-200 text-slate-600 bg-slate-50")}>
          <span>
            Showing <strong className={isDark ? "text-white" : "text-slate-900"}>{logs.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> - <strong className={isDark ? "text-white" : "text-slate-900"}>{Math.min(currentPage * pageSize, totalLogs)}</strong> of <strong className={isDark ? "text-white" : "text-slate-900"}>{totalLogs}</strong> events
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded-lg border text-xs font-semibold disabled:opacity-40 hover:bg-zinc-800 transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <span className="font-mono text-xs">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 rounded-lg border text-xs font-semibold disabled:opacity-40 hover:bg-zinc-800 transition-colors flex items-center gap-1"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── 7. EVENT DETAIL DRAWER (SLIDE-OVER PANEL) ────────────────────────── */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className={cn(
              "w-full max-w-xl h-full border-l p-6 overflow-y-auto space-y-6 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200",
              isDark ? "bg-[#141417] border-zinc-800 text-white" : "bg-white border-slate-200 text-slate-900"
            )}
          >
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-violet-400 bg-violet-500/10 px-2.5 py-1 rounded-lg border border-violet-500/20">
                    LOG #{selectedLog.log_id}
                  </span>
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    {selectedLog.event_type}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="p-1.5 rounded-lg border hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Actor & Resource Cards */}
              <div className="grid grid-cols-2 gap-3">
                {/* Actor Card */}
                <div className={cn("p-3.5 rounded-xl border space-y-1.5", isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-slate-50 border-slate-200")}>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Actor</span>
                  <div className="flex items-center gap-2.5">
                    {selectedLog.actor?.user_id && avatars[selectedLog.actor.user_id.toString()] ? (
                      <img src={avatars[selectedLog.actor.user_id.toString()]!} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 border border-violet-500/30" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-violet-600/20 text-violet-400 text-[10px] font-bold flex items-center justify-center shrink-0 border border-violet-500/30 uppercase">
                        {selectedLog.actor?.name ? selectedLog.actor.name.slice(0, 2) : "SY"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{selectedLog.actor?.name || "System"}</p>
                      <p className="text-[10px] text-zinc-500 font-mono">ID: {selectedLog.actor?.user_id || "System"}</p>
                    </div>
                  </div>
                </div>

                {/* Resource Card */}
                <div className={cn("p-3.5 rounded-xl border space-y-1.5", isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-slate-50 border-slate-200")}>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Resource</span>
                  <div className="flex items-center gap-2.5">
                    {selectedLog.resource.type === "document" || selectedLog.resource.type === "version" ? (
                      <FileIcon fileName={selectedLog.resource.name || selectedLog.metadata?.filename || selectedLog.metadata?.file_name} size="sm" />
                    ) : selectedLog.resource.type === "project" ? (
                      <Briefcase className="w-4 h-4 text-violet-400 shrink-0" />
                    ) : (
                      <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{selectedLog.resource.name || selectedLog.resource.id}</p>
                      <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">{selectedLog.resource.type}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description Narrative Card */}
              <div className={cn("p-4 rounded-xl border space-y-2", isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-slate-50 border-slate-200")}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Description Narrative</span>
                <p className="text-xs leading-relaxed font-medium text-zinc-200">
                  <ParsedDescription text={selectedLog.description} isDark={isDark} />
                </p>
              </div>

              {/* Before vs After Side-by-Side Comparison Table */}
              {(selectedLog.before || selectedLog.after) && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">State Delta Comparison</span>
                  <div className={cn("rounded-xl border overflow-hidden text-xs", isDark ? "border-zinc-800" : "border-slate-200")}>
                    <div className={cn("grid grid-cols-3 h-8 items-center px-3 font-semibold uppercase text-[10px] tracking-wider border-b", isDark ? "bg-zinc-900 text-zinc-400 border-zinc-800" : "bg-slate-100 text-slate-600 border-slate-200")}>
                      <div>Field</div>
                      <div>Before</div>
                      <div>After</div>
                    </div>
                    <div className="divide-y divide-zinc-800/40">
                      {Array.from(new Set([...Object.keys(selectedLog.before || {}), ...Object.keys(selectedLog.after || {})])).map((key) => (
                        <div key={key} className="grid grid-cols-3 p-3 items-center text-xs">
                          <span className="font-mono font-bold text-violet-400">{key}</span>
                          <span className="font-mono text-rose-400/90 truncate pr-2">
                            {JSON.stringify(selectedLog.before?.[key] ?? "—")}
                          </span>
                          <span className="font-mono text-emerald-400/90 truncate">
                            {JSON.stringify(selectedLog.after?.[key] ?? "—")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Metadata Viewer */}
              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Technical Context / Metadata</span>
                  <pre className={cn("p-3 rounded-xl border font-mono text-[11px] overflow-x-auto leading-relaxed", isDark ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-slate-900 text-slate-100")}>
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500 font-mono">
              <span>Timestamp: {selectedLog.created_at}</span>
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition-colors"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
