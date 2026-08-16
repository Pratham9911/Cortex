"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import {
  Trash2,
  RotateCw,
  Search,
  MoreVertical,
  Info,
  ChevronLeft,
  ChevronRight,
  Filter,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  FolderIcon,
  X,
  ShieldAlert,
  ArrowUpDown,
  ChevronDown,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/protected-route"

// ─── Types ───────────────────────────────────────────────────────────────────

type TrashedItem = {
  version_id: number
  document_id: number
  version_number: number
  document: string
  title: string
  file_name: string
  type: string
  owner_id: number
  owner: string
  size: number
  location: string
  folder_id?: number | null
  delete_time?: string
  deleted_by?: number
  deleted_by_name?: string
  last_modified?: string
}

type ToastNotice = {
  id: number
  message: string
  type: "success" | "error"
}

// ─── File Icon Helper ────────────────────────────────────────────────────────

function FileIcon({ fileName, size = "sm" }: { fileName?: string; size?: "sm" | "lg" }) {
  const ext = fileName?.split(".").pop()?.toLowerCase()
  const dim = size === "lg" ? "w-12 h-12" : "w-4 h-4"
  if (ext === "pdf") return <img src="/icons/pdf.svg" className={cn(dim, "object-contain shrink-0")} alt="PDF" />
  if (ext === "txt") return <img src="/icons/txt.svg" className={cn(dim, "object-contain shrink-0")} alt="TXT" />
  if (ext === "md") return <img src="/icons/md.png" className={cn(dim, "object-contain shrink-0")} alt="MD" />
  if (ext === "docx") return <img src="/icons/docx.png" className={cn(dim, "object-contain shrink-0")} alt="DOCX" />
  if (ext === "pptx") return <img src="/icons/pptx.png" className={cn(dim, "object-contain shrink-0")} alt="PPTX" />
  return <FileText className={cn(dim, "text-violet-400 shrink-0")} />
}

export default function TrashPage() {
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const router = useRouter()
  const { user } = useAuth()

  // ─── State ─────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<TrashedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [locationFilter, setLocationFilter] = useState("all")
  const [selectedVersionIds, setSelectedVersionIds] = useState<Set<number>>(new Set())
  const [lastSelectedVersionId, setLastSelectedVersionId] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  // Action / Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean
    action: "restore" | "delete"
    targetItems: TrashedItem[]
  }>({ open: false, action: "restore", targetItems: [] })
  const [isActionLoading, setIsActionLoading] = useState(false)

  // Toasts
  const [toasts, setToasts] = useState<ToastNotice[]>([])

  const addToast = (message: string, type: "success" | "error" = "success") => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }

  // ─── Data Fetching ─────────────────────────────────────────────────────────
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const fetchTrashedItems = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      if (!token || !projectId) {
        setItems([])
        setLoading(false)
        return
      }

      const res = await fetch(`${apiUrl}/projects/${projectId}/documents/trash`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        const data: TrashedItem[] = await res.json()
        setItems(Array.isArray(data) ? data : [])
      } else {
        const err = await res.json().catch(() => ({}))
        addToast(err.detail || "Failed to load trashed items", "error")
      }
    } catch (err) {
      console.error("Error fetching trash:", err)
      addToast("Connection error while fetching trash", "error")
    } finally {
      setLoading(false)
    }
  }, [apiUrl])

  useEffect(() => {
    fetchTrashedItems()
  }, [fetchTrashedItems])

  // ─── Formatters ────────────────────────────────────────────────────────────
  const formatSize = (b: number | null | undefined) => {
    if (b === null || b === undefined) return "--"
    if (b === 0) return "0 B"
    const k = 1024, s = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(b) / Math.log(k))
    return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i]
  }

  const formatDate = (s?: string) => {
    if (!s) return "--"
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  // ─── Unique Filter Lists ──────────────────────────────────────────────────
  const availableTypes = useMemo(() => {
    const types = new Set<string>()
    items.forEach((item) => {
      if (item.type) types.add(item.type)
    })
    return Array.from(types)
  }, [items])

  const availableLocations = useMemo(() => {
    const locs = new Set<string>()
    items.forEach((item) => {
      if (item.location) locs.add(item.location)
    })
    return Array.from(locs)
  }, [items])

  // ─── Filtering & Pagination ───────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const q = query.toLowerCase().trim()
      const matchesQuery =
        !q ||
        item.title?.toLowerCase().includes(q) ||
        item.file_name?.toLowerCase().includes(q) ||
        item.owner?.toLowerCase().includes(q)

      const matchesType = typeFilter === "all" || item.type === typeFilter
      const matchesLocation = locationFilter === "all" || item.location === locationFilter

      return matchesQuery && matchesType && matchesLocation
    })
  }, [items, query, typeFilter, locationFilter])

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [query, typeFilter, locationFilter])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredItems.slice(start, start + pageSize)
  }, [filteredItems, currentPage, pageSize])

  // ─── Selection Handlers ───────────────────────────────────────────────────
  const allCurrentPageSelected =
    paginatedItems.length > 0 && paginatedItems.every((item) => selectedVersionIds.has(item.version_id))

  const isIndeterminate =
    paginatedItems.some((item) => selectedVersionIds.has(item.version_id)) && !allCurrentPageSelected

  const toggleSelectAllCurrentPage = () => {
    const next = new Set(selectedVersionIds)
    if (allCurrentPageSelected) {
      paginatedItems.forEach((item) => next.delete(item.version_id))
    } else {
      paginatedItems.forEach((item) => next.add(item.version_id))
    }
    setSelectedVersionIds(next)
  }

  const toggleSelectItem = (versionId: number, e?: React.MouseEvent) => {
    const next = new Set(selectedVersionIds)

    if (e?.shiftKey && lastSelectedVersionId !== null) {
      const currentIndex = paginatedItems.findIndex((item) => item.version_id === versionId)
      const lastIndex = paginatedItems.findIndex((item) => item.version_id === lastSelectedVersionId)

      if (currentIndex !== -1 && lastIndex !== -1) {
        const start = Math.min(currentIndex, lastIndex)
        const end = Math.max(currentIndex, lastIndex)
        const range = paginatedItems.slice(start, end + 1)

        // If the target item is currently selected, select range; else keep logic clean
        range.forEach((item) => next.add(item.version_id))
        setSelectedVersionIds(next)
        return
      }
    }

    if (next.has(versionId)) {
      next.delete(versionId)
    } else {
      next.add(versionId)
    }

    setSelectedVersionIds(next)
    setLastSelectedVersionId(versionId)
  }

  const selectedItemsList = useMemo(() => {
    return items.filter((item) => selectedVersionIds.has(item.version_id))
  }, [items, selectedVersionIds])

  const totalSelectedSize = useMemo(() => {
    return selectedItemsList.reduce((acc, curr) => acc + (curr.size || 0), 0)
  }, [selectedItemsList])

  // ─── Bulk & Single Action Execution ──────────────────────────────────────
  const handleExecuteRestore = async (targets: TrashedItem[]) => {
    if (targets.length === 0) return
    setIsActionLoading(true)
    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")

      const payload = {
        version_ids: targets.map((t) => t.version_id),
        items: targets.map((t) => ({ document_id: t.document_id, version_number: t.version_number })),
      }

      const res = await fetch(`${apiUrl}/projects/${projectId}/documents/versions/bulk-restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const data = await res.json()
        addToast(data.message || `Successfully restored ${targets.length} item(s)`, "success")
        setSelectedVersionIds(new Set())
        fetchTrashedItems()
      } else {
        const err = await res.json().catch(() => ({}))
        addToast(err.detail || "Failed to restore items", "error")
      }
    } catch (err) {
      console.error("Error restoring items:", err)
      addToast("Network error during restoration", "error")
    } finally {
      setIsActionLoading(false)
      setConfirmModal({ open: false, action: "restore", targetItems: [] })
    }
  }

  const handleExecuteDelete = async (targets: TrashedItem[]) => {
    if (targets.length === 0) return
    setIsActionLoading(true)
    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")

      const payload = {
        version_ids: targets.map((t) => t.version_id),
        items: targets.map((t) => ({ document_id: t.document_id, version_number: t.version_number })),
      }

      const res = await fetch(`${apiUrl}/projects/${projectId}/documents/versions/bulk-permanent-delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const data = await res.json()
        addToast(data.message || `Successfully erased ${targets.length} item(s) permanently`, "success")
        setSelectedVersionIds(new Set())
        fetchTrashedItems()
      } else {
        const err = await res.json().catch(() => ({}))
        addToast(err.detail || "Failed to erase items permanently", "error")
      }
    } catch (err) {
      console.error("Error erasing items:", err)
      addToast("Network error during permanent erasure", "error")
    } finally {
      setIsActionLoading(false)
      setConfirmModal({ open: false, action: "delete", targetItems: [] })
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-w-0 h-[calc(100vh-64px)] -mx-6 -mt-8 -mb-8 overflow-hidden relative">
      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl border text-xs font-medium backdrop-blur-lg animate-in slide-in-from-bottom-5 duration-200",
              t.type === "success"
                ? isDark
                  ? "bg-emerald-950/90 border-emerald-500/30 text-emerald-200 shadow-emerald-950/50"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800"
                : isDark
                  ? "bg-red-950/90 border-red-500/30 text-red-200 shadow-red-950/50"
                  : "bg-red-50 border-red-200 text-red-800"
            )}
          >
            {t.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Main Container */}
      <div
        className={cn(
          "flex flex-col flex-1 min-w-0 overflow-hidden border-r",
          isDark ? "bg-[#0d0f14] border-zinc-800" : "bg-white border-slate-200"
        )}
      >
        {/* Top Header & Alert Banner */}
        <div
          className={cn(
            "flex flex-col border-b shrink-0 px-6 py-4 space-y-3",
            isDark ? "border-zinc-800 bg-[#0d0f14]" : "border-slate-200 bg-white"
          )}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                <span>Docs</span>
                <span>/</span>
                <span className={isDark ? "text-violet-400" : "text-violet-600"}>Trash & Versions</span>
              </div>
              <h1 className={cn("text-xl font-bold mt-1", isDark ? "text-white" : "text-slate-900")}>
                Trash & Retention
              </h1>
            </div>
            <button
              onClick={fetchTrashedItems}
              className={cn(
                "p-2 rounded-lg border transition-colors flex items-center gap-1.5 text-xs font-medium",
                isDark ? "border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300" : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
              )}
              title="Refresh Trash"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          {/* Info Alert Banner */}
          <div
            className={cn(
              "flex items-start gap-3 p-3 rounded-xl border text-xs leading-relaxed transition-all",
              isDark
                ? "bg-violet-500/10 border-violet-500/20 text-violet-300"
                : "bg-violet-50 border-violet-200 text-violet-800"
            )}
          >
            <Info className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>
                Items moved to trash are retained for 30 days before permanent automatic cleanup. Restoring a version brings its content back into active workspace availability instantly.
              </span>
            </div>
          </div>
        </div>

        {/* Toolbar & Filters Bar */}
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b shrink-0",
            isDark ? "border-zinc-800 bg-[#12141c]" : "border-slate-200 bg-slate-50"
          )}
        >
          {/* Left filters: Search + Select Dropdowns */}
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search deleted files or owners…"
                className={cn(
                  "w-full h-8 pl-8 pr-3 text-xs rounded-lg border outline-none transition-colors",
                  isDark
                    ? "bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-500 focus:border-violet-500"
                    : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-violet-500"
                )}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Type Filter */}
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className={cn(
                  "h-8 pl-3 pr-7 text-xs rounded-lg border outline-none appearance-none cursor-pointer font-medium",
                  isDark ? "bg-zinc-900 border-zinc-700 text-zinc-200" : "bg-white border-slate-300 text-slate-800"
                )}
              >
                <option value="all">All Types</option>
                {availableTypes.map((t) => (
                  <option key={t} value={t}>
                    {t.toUpperCase()}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Location Filter */}
            <div className="relative">
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className={cn(
                  "h-8 pl-3 pr-7 text-xs rounded-lg border outline-none appearance-none cursor-pointer font-medium",
                  isDark ? "bg-zinc-900 border-zinc-700 text-zinc-200" : "bg-white border-slate-300 text-slate-800"
                )}
              >
                <option value="all">All Locations</option>
                {availableLocations.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Right Action Bar (When items selected) */}
          {selectedVersionIds.size > 0 ? (
            <div className="flex items-center gap-2 animate-in fade-in duration-150">
              <span className="text-xs font-semibold text-violet-400 mr-1">
                {selectedVersionIds.size} selected ({formatSize(totalSelectedSize)})
              </span>
              <button
                onClick={() =>
                  setConfirmModal({
                    open: true,
                    action: "restore",
                    targetItems: selectedItemsList,
                  })
                }
                className="h-8 px-3 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Restore</span>
              </button>
              <button
                onClick={() =>
                  setConfirmModal({
                    open: true,
                    action: "delete",
                    targetItems: selectedItemsList,
                  })
                }
                className="h-8 px-3 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Erase Permanently</span>
              </button>
            </div>
          ) : (
            <div className="text-xs text-zinc-400 font-medium">
              {filteredItems.length} {filteredItems.length === 1 ? "item" : "items"} in trash
            </div>
          )}
        </div>

        {/* Table Headers */}
        <div
          className={cn(
            "flex items-center h-9 text-[11px] font-semibold uppercase tracking-wider shrink-0 border-b select-none",
            isDark ? "text-zinc-500 border-zinc-800 bg-[#0d0f14]" : "text-slate-400 border-slate-200 bg-slate-50"
          )}
        >
          <div className="w-10 flex items-center justify-center shrink-0">
            <input
              type="checkbox"
              checked={allCurrentPageSelected}
              ref={(el) => {
                if (el) el.indeterminate = isIndeterminate
              }}
              onChange={toggleSelectAllCurrentPage}
              className="rounded accent-violet-600 cursor-pointer w-3.5 h-3.5"
            />
          </div>
          <div className="flex-1 min-w-0 pl-2">Name / Document</div>
          <div className="w-24 text-left">Type</div>
          <div className="w-32 text-left">Owner</div>
          <div className="w-32 text-left">Location</div>
          <div className="w-24 text-left">Size</div>
          <div className="w-36 text-left">Delete Time</div>
          <div className="w-12 text-center" />
        </div>

        {/* Table Rows Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/40">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Spinner className="w-7 h-7 text-violet-500" />
              <p className="text-xs text-zinc-400">Fetching trashed documents…</p>
            </div>
          ) : paginatedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center p-6">
              <div
                className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center mb-3 border shadow-sm",
                  isDark ? "bg-zinc-900 border-zinc-800 text-zinc-500" : "bg-slate-100 border-slate-200 text-slate-400"
                )}
              >
                <Trash2 className="w-6 h-6 stroke-[1.5]" />
              </div>
              <h3 className={cn("text-sm font-semibold", isDark ? "text-zinc-200" : "text-slate-800")}>
                {query || typeFilter !== "all" || locationFilter !== "all" ? "No matching trashed items" : "Trash is empty"}
              </h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                {query || typeFilter !== "all" || locationFilter !== "all"
                  ? "Try adjusting your search query or filters."
                  : "Items moved to trash will appear here for restoration or permanent deletion."}
              </p>
            </div>
          ) : (
            paginatedItems.map((item) => {
              const isSelected = selectedVersionIds.has(item.version_id)
              return (
                <div
                  key={item.version_id}
                  className={cn(
                    "flex items-center h-11 text-xs transition-colors group select-none cursor-pointer",
                    isSelected
                      ? isDark
                        ? "bg-violet-950/20 text-white"
                        : "bg-violet-50 text-slate-900"
                      : isDark
                        ? "hover:bg-zinc-900/60 text-zinc-300"
                        : "hover:bg-slate-50 text-slate-800"
                  )}
                  onClick={(e) => toggleSelectItem(item.version_id, e)}
                >
                  {/* Checkbox */}
                  <div className="w-10 flex items-center justify-center shrink-0" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(e) => toggleSelectItem(item.version_id, e)}
                      onChange={() => { }}
                      className="rounded accent-violet-600 cursor-pointer w-3.5 h-3.5"
                    />
                  </div>

                  {/* Name & Version (Truncated to 20 chars) */}
                  <div className="flex-1 flex items-center gap-2.5 min-w-0 pl-2 pr-4 overflow-hidden">
                    <FileIcon fileName={item.file_name} />
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        title={item.title}
                        className={cn("font-medium truncate text-xs max-w-[140px] sm:max-w-[180px]", isDark ? "text-zinc-100" : "text-slate-900")}
                      >
                        {item.title.length > 20 ? `${item.title.slice(0, 30)}...` : item.title}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20 shrink-0">
                        v{item.version_number}
                      </span>
                    </div>
                  </div>

                  {/* Type */}
                  <div className="w-24 uppercase font-semibold text-[10px] text-zinc-400 tracking-wider">
                    {item.type.replace(".", "")}
                  </div>

                  {/* Owner */}
                  <div className="w-32 truncate text-zinc-400" title={item.owner}>{item.owner}</div>

                  {/* Location (Truncated) */}
                  <div className="w-32 flex items-center gap-1.5 min-w-0 text-zinc-400 pr-2">
                    <FolderIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="currentColor" strokeWidth={0} />
                    <span title={item.location} className="truncate max-w-[100px] text-xs">
                      {item.location}
                    </span>
                  </div>

                  {/* Size */}
                  <div className="w-24 text-zinc-400 font-mono text-[11px]">{formatSize(item.size)}</div>

                  {/* Delete Time */}
                  <div className="w-36 text-zinc-400 font-mono text-[11px]">{formatDate(item.delete_time || item.last_modified)}</div>

                  {/* Actions Dropdown */}
                  <div className="w-12 flex justify-center" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={cn(
                            "w-7 h-7 flex items-center justify-center rounded-md hover:bg-zinc-800 transition-colors",
                            isDark ? "text-zinc-400 hover:text-white" : "text-slate-400 hover:text-slate-800"
                          )}
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className={cn(
                          "w-44 text-xs shadow-xl border",
                          isDark ? "bg-[#181b24] border-zinc-800 text-zinc-200" : "bg-white border-slate-200"
                        )}
                      >
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={() =>
                            setConfirmModal({
                              open: true,
                              action: "restore",
                              targetItems: [item],
                            })
                          }
                        >
                          <RotateCw className="w-3.5 h-3.5 mr-2 text-violet-400" /> Restore Version
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer text-red-500 focus:text-red-400 focus:bg-red-500/10"
                          onClick={() =>
                            setConfirmModal({
                              open: true,
                              action: "delete",
                              targetItems: [item],
                            })
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" /> Erase Permanently
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Pagination Footer */}
        <div
          className={cn(
            "flex items-center justify-between px-6 py-3 border-t shrink-0 select-none text-xs",
            isDark ? "border-zinc-800 bg-[#0d0f14] text-zinc-400" : "border-slate-200 bg-white text-slate-600"
          )}
        >
          <div>
            Showing <strong className={isDark ? "text-zinc-200" : "text-slate-900"}>{paginatedItems.length}</strong> of{" "}
            <strong className={isDark ? "text-zinc-200" : "text-slate-900"}>{filteredItems.length}</strong> trashed items
          </div>

          {/* Page controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1 || loading}
              className={cn(
                "p-1.5 rounded-lg border transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
                isDark ? "border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300" : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
              )}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 font-semibold text-xs">
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages || loading}
              className={cn(
                "p-1.5 rounded-lg border transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
                isDark ? "border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300" : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
              )}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Dialog
        open={confirmModal.open}
        onOpenChange={(v) => {
          if (!v && !isActionLoading) {
            setConfirmModal({ open: false, action: "restore", targetItems: [] })
          }
        }}
      >
        <DialogContent
          className={cn(
            "sm:max-w-md border shadow-2xl backdrop-blur-md",
            isDark ? "bg-[#12141c] border-zinc-800 text-white" : "bg-white border-slate-200 text-slate-900"
          )}
        >
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              {confirmModal.action === "delete" ? (
                <>
                  <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
                  Confirm Permanent Erasure
                </>
              ) : (
                <>
                  <RotateCw className="w-5 h-5 text-violet-500 shrink-0" />
                  Confirm Version Restore
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 mt-2">
              {confirmModal.action === "delete"
                ? `You are about to permanently delete ${confirmModal.targetItems.length} version(s). This action cannot be undone and file storage will be cleaned.`
                : `You are about to restore ${confirmModal.targetItems.length} version(s) back into active workspace availability.`}
            </DialogDescription>
          </DialogHeader>

          {/* List preview of items to be affected */}
          <div
            className={cn(
              "my-3 p-3 rounded-xl border max-h-40 overflow-y-auto space-y-1.5 text-xs",
              isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-slate-50 border-slate-200"
            )}
          >
            {confirmModal.targetItems.map((item) => (
              <div key={item.version_id} className="flex items-center justify-between py-1 border-b border-zinc-800/40 last:border-0">
                <div className="flex items-center gap-2 min-w-0 truncate">
                  <FileIcon fileName={item.file_name} />
                  <span className="truncate font-medium">{item.title}</span>
                  <span className="text-[10px] text-zinc-400 font-mono">v{item.version_number}</span>
                </div>
                <span className="text-[11px] text-zinc-400 font-mono shrink-0 ml-2">{formatSize(item.size)}</span>
              </div>
            ))}
          </div>

          <DialogFooter className="mt-4">
            <button
              onClick={() => setConfirmModal({ open: false, action: "restore", targetItems: [] })}
              disabled={isActionLoading}
              className={cn(
                "h-8 px-4 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50",
                isDark ? "border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700" : "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (confirmModal.action === "delete") {
                  handleExecuteDelete(confirmModal.targetItems)
                } else {
                  handleExecuteRestore(confirmModal.targetItems)
                }
              }}
              disabled={isActionLoading}
              className={cn(
                "h-8 px-4 rounded-lg text-xs font-semibold text-white transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-md",
                confirmModal.action === "delete" ? "bg-red-600 hover:bg-red-700" : "bg-violet-600 hover:bg-violet-700"
              )}
            >
              {isActionLoading ? <Spinner className="w-3.5 h-3.5 animate-spin" /> : null}
              {isActionLoading
                ? "Processing..."
                : confirmModal.action === "delete"
                  ? "Erase Permanently"
                  : "Restore Version"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
