"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ChevronDown,
  Download,
  Filter,
  Loader2,
  Search,
  X,
} from "lucide-react"
import { getFileFormatIcon } from "@/components/agent-chat/project-document-select-modal"
import { UserAvatarContents } from "@/components/teams/user-avatar-contents"
import { cn } from "@/lib/utils"

type TeamDocument = {
  document_id: number
  title: string
  folder_id: number | null
  folder_name: string | null
  path: string
  last_modified: string | null
  file_name: string
  file_size: number
  uploaded_by: number
  uploader_name: string | null
  uploader_avatar_url: string | null
  can_download: boolean
}

type FileCategory = "All files" | "Documents" | "PDFs" | "Others"

const categories: FileCategory[] = ["All files", "Documents", "PDFs", "Others"]

function extensionOf(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || ""
}

function categoryFor(fileName: string): Exclude<FileCategory, "All files"> {
  const extension = extensionOf(fileName)
  if (extension === "pdf") return "PDFs"
  if (["doc", "docx", "txt", "md", "rtf", "odt"].includes(extension)) return "Documents"
  return "Others"
}

function formatSize(size: number) {
  if (!Number.isFinite(size) || size < 0) return "—"
  if (size < 1024) return `${size} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = size / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

export function FilesTab({
  isDark,
  teamId,
  onOpenMemberDetails,
}: {
  isDark: boolean
  teamId: number
  onOpenMemberDetails: (member: {
    user_id: number
    name?: string
    avatar_url?: string
  }) => void
}) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const [files, setFiles] = useState<TeamDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<FileCategory>("All files")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [uploaderFilter, setUploaderFilter] = useState("")
  const [folderFilter, setFolderFilter] = useState("")
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadFiles = async () => {
      setLoading(true)
      setError("")
      try {
        const token = localStorage.getItem("access_token")
        const projectId = localStorage.getItem("selected_project_id")
        if (!token || !projectId) throw new Error("Project context is missing")

        const response = await fetch(
          `${apiUrl}/projects/${projectId}/teams/${teamId}/documents`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.detail || "Could not load team documents")
        }
        if (!Array.isArray(data)) {
          throw new Error("The team documents response was invalid")
        }
        if (!cancelled) setFiles(data)
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load team documents")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadFiles()
    return () => {
      cancelled = true
    }
  }, [apiUrl, teamId])

  const uploaders = useMemo(
    () =>
      Array.from(
        new Set(files.map((file) => file.uploader_name || "Unknown uploader")),
      ).sort((a, b) => a.localeCompare(b)),
    [files],
  )
  const folders = useMemo(
    () =>
      Array.from(new Set(files.map((file) => file.folder_name || "Root"))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [files],
  )
  const visibleFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return files.filter((file) => {
      const matchesCategory =
        category === "All files" || categoryFor(file.file_name) === category
      const matchesQuery =
        !normalizedQuery ||
        [file.title, file.file_name, file.path, file.uploader_name || ""]
          .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
      const matchesUploader =
        !uploaderFilter ||
        (file.uploader_name || "Unknown uploader") === uploaderFilter
      const matchesFolder =
        !folderFilter || (file.folder_name || "Root") === folderFilter
      return matchesCategory && matchesQuery && matchesUploader && matchesFolder
    })
  }, [category, files, folderFilter, query, uploaderFilter])

  const downloadFile = async (file: TeamDocument) => {
    setDownloadingId(file.document_id)
    setError("")
    try {
      const token = localStorage.getItem("access_token")
      if (!token) throw new Error("Your session has expired. Please sign in again.")
      const response = await fetch(
        `${apiUrl}/documents/${file.document_id}/download`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.detail || "Could not download this document")
      }
      if (!data.download_url) throw new Error("No download link was returned")

      const link = document.createElement("a")
      link.href = data.download_url
      link.download = data.file_name || file.file_name
      link.rel = "noopener noreferrer"
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not download this document")
    } finally {
      setDownloadingId(null)
    }
  }

  const hasActiveFilters = Boolean(uploaderFilter || folderFilter)

  return (
    <section
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border",
        isDark
          ? "border-zinc-800 bg-[#15171b] text-zinc-100"
          : "border-slate-200 bg-white text-slate-900",
      )}
    >
      <header className="shrink-0 border-b border-inherit px-4 py-4 sm:px-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">All files</h2>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setUploaderFilter("")
                setFolderFilter("")
              }}
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              <X className="size-3.5" />
              Clear filters
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Filter files by type"
            className={cn(
              "flex max-w-full items-center gap-1 overflow-x-auto rounded-md p-0.5",
              isDark ? "bg-zinc-900" : "bg-slate-100",
            )}
          >
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={category === item}
                onClick={() => setCategory(item)}
                className={cn(
                  "shrink-0 rounded px-2.5 py-1.5 text-xs font-medium transition sm:px-3",
                  category === item
                    ? isDark
                      ? "bg-zinc-700 text-white shadow-sm"
                      : "bg-white text-slate-900 shadow-sm"
                    : isDark
                      ? "text-zinc-400 hover:text-white"
                      : "text-slate-500 hover:text-slate-900",
                )}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none">
            <label
              className={cn(
                "flex h-9 min-w-0 max-w-xs flex-1 items-center gap-2 rounded-md border px-2.5 sm:w-52 sm:flex-none",
                isDark
                  ? "border-zinc-700 bg-[#111315]"
                  : "border-slate-200 bg-white",
              )}
            >
              <Search className="size-4 shrink-0 text-zinc-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search files"
                aria-label="Search team files"
                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-zinc-400"
              />
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setFiltersOpen((open) => !open)}
                aria-expanded={filtersOpen}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium transition",
                  hasActiveFilters && "border-blue-500 text-blue-600 dark:text-blue-400",
                  isDark
                    ? "border-zinc-700 hover:bg-zinc-800"
                    : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <Filter className="size-3.5" />
                Filters
                <ChevronDown className="size-3.5" />
              </button>

              {filtersOpen && (
                <div
                  className={cn(
                    "absolute right-0 top-11 z-30 w-64 space-y-3 rounded-lg border p-3 shadow-xl",
                    isDark
                      ? "border-zinc-700 bg-[#1b1d22]"
                      : "border-slate-200 bg-white",
                  )}
                >
                  <label className="block space-y-1.5 text-xs font-medium">
                    <span className="text-zinc-500">Uploaded by</span>
                    <select
                      value={uploaderFilter}
                      onChange={(event) => setUploaderFilter(event.target.value)}
                      className={cn(
                        "h-9 w-full rounded-md border px-2 outline-none",
                        isDark
                          ? "border-zinc-700 bg-[#111315]"
                          : "border-slate-200 bg-white",
                      )}
                    >
                      <option value="">Anyone</option>
                      {uploaders.map((uploader) => (
                        <option key={uploader} value={uploader}>
                          {uploader}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1.5 text-xs font-medium">
                    <span className="text-zinc-500">Folder</span>
                    <select
                      value={folderFilter}
                      onChange={(event) => setFolderFilter(event.target.value)}
                      className={cn(
                        "h-9 w-full rounded-md border px-2 outline-none",
                        isDark
                          ? "border-zinc-700 bg-[#111315]"
                          : "border-slate-200 bg-white",
                      )}
                    >
                      <option value="">All folders</option>
                      {folders.map((folder) => (
                        <option key={folder} value={folder}>
                          {folder}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="mx-4 mt-3 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400 sm:mx-6"
        >
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[680px]">
          <div
            className={cn(
              "sticky top-0 z-10 grid grid-cols-[minmax(280px,1fr)_minmax(170px,220px)_140px_48px] items-center border-b px-4 py-2.5 text-[11px] font-medium text-zinc-500 sm:px-6",
              isDark
                ? "border-zinc-800 bg-[#15171b]"
                : "border-slate-200 bg-white",
            )}
          >
            <span>File name</span>
            <span>Uploaded by</span>
            <span>Last updated</span>
            <span className="sr-only">Actions</span>
          </div>

          {loading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-zinc-500">
              <Loader2 className="size-4 animate-spin" />
              Loading team files…
            </div>
          ) : visibleFiles.length ? (
            visibleFiles.map((file) => {
              const uploader = file.uploader_name || "Unknown uploader"
              return (
                <div
                  key={file.document_id}
                  className={cn(
                    "grid grid-cols-[minmax(280px,1fr)_minmax(170px,220px)_140px_48px] items-center border-b px-4 py-3 last:border-b-0 sm:px-6",
                    isDark
                      ? "border-zinc-800 hover:bg-zinc-800/40"
                      : "border-slate-200 hover:bg-slate-50/70",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3 pr-3">
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-md",
                        isDark ? "bg-zinc-800" : "bg-slate-100",
                      )}
                    >
                      {getFileFormatIcon(file.file_name, "size-5")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold sm:text-sm">
                        {file.title}
                      </p>
                      <p
                        title={file.path}
                        className="truncate text-[10px] text-zinc-500 sm:text-xs"
                      >
                        {file.path} <span className="mx-1">·</span>
                        {formatSize(file.file_size)} <span className="mx-1">·</span>
                        {extensionOf(file.file_name).toUpperCase() || "FILE"}
                      </p>
                    </div>
                  </div>

                  <div className="flex min-w-0 items-center gap-2 pr-3">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenMemberDetails({
                          user_id: file.uploaded_by,
                          name: uploader,
                          avatar_url: file.uploader_avatar_url || undefined,
                        })
                      }
                      aria-label={`View ${uploader}'s member details`}
                      title={`View ${uploader}'s member details`}
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-black bg-white text-[10px] font-semibold text-black transition-transform hover:z-10 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black",
                      )}
                    >
                      <UserAvatarContents
                        name={uploader}
                        avatarUrl={file.uploader_avatar_url || undefined}
                      />
                    </button>
                    <span className="truncate text-xs font-medium">{uploader}</span>
                  </div>

                  <span className="text-xs text-zinc-500">
                    {formatDate(file.last_modified)}
                  </span>

                  <span className="flex justify-end">
                    {file.can_download && (
                      <button
                        type="button"
                        onClick={() => void downloadFile(file)}
                        disabled={downloadingId === file.document_id}
                        aria-label={`Download ${file.title}`}
                        title="Download"
                        className={cn(
                          "flex size-8 items-center justify-center rounded-md transition disabled:opacity-50",
                          isDark
                            ? "text-zinc-400 hover:bg-zinc-700 hover:text-white"
                            : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                        )}
                      >
                        {downloadingId === file.document_id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Download className="size-4" />
                        )}
                      </button>
                    )}
                  </span>
                </div>
              )
            })
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
              <span className="text-zinc-400">{getFileFormatIcon(null, "size-8")}</span>
              <p className="mt-3 text-sm font-medium">
                {files.length ? "No files match these filters" : "No team files yet"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {files.length
                  ? "Try a different search or filter."
                  : "Documents shared with this team will appear here."}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
