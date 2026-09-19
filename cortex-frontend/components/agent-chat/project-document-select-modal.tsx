"use client"

import React, { useEffect, useState } from "react"
import { Check, FileText, Folder, Loader2, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { listProjectDocuments, type ProjectDocumentItem } from "@/lib/ai-agent"

type ProjectDocumentSelectModalProps = {
  isOpen: boolean
  onClose: () => void
  projectId: number
  selectedDocs: ProjectDocumentItem[]
  onApplySelection: (docs: ProjectDocumentItem[]) => void
  isDark: boolean
}

export function getFileFormatIcon(fileName?: string | null, className: string = "size-4") {
  if (!fileName) return <FileText className={cn(className, "text-indigo-500 shrink-0")} />
  const lower = fileName.toLowerCase()
  if (lower.endsWith(".pdf")) {
    return <img src="/icons/pdf.svg" className={cn(className, "object-contain shrink-0")} alt="PDF" />
  }
  if (lower.endsWith(".txt")) {
    return <img src="/icons/txt.svg" className={cn(className, "object-contain shrink-0")} alt="TXT" />
  }
  if (lower.endsWith(".md")) {
    return (
      <span className={cn(className, "inline-flex items-center justify-center bg-orange-600 text-white rounded-[4px] font-bold text-[9px] shrink-0 leading-none select-none px-0.5 py-0.5")}>
        M↓
      </span>
    )
  }
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
    return <img src="/icons/docx.png" className={cn(className, "object-contain shrink-0")} alt="DOCX" />
  }
  if (lower.endsWith(".pptx") || lower.endsWith(".ppt")) {
    return <img src="/icons/pptx.png" className={cn(className, "object-contain shrink-0")} alt="PPTX" />
  }
  return <FileText className={cn(className, "text-indigo-500 shrink-0")} />
}

export function ProjectDocumentSelectModal({
  isOpen,
  onClose,
  projectId,
  selectedDocs,
  onApplySelection,
  isDark,
}: ProjectDocumentSelectModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [documents, setDocuments] = useState<ProjectDocumentItem[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [tempSelected, setTempSelected] = useState<ProjectDocumentItem[]>([])

  useEffect(() => {
    if (isOpen) {
      setTempSelected(selectedDocs)
      fetchDocs()
    }
  }, [isOpen, projectId])

  const fetchDocs = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await listProjectDocuments(projectId)
      setDocuments(data || [])
    } catch (err: any) {
      setError(err?.message || "Failed to load project documents")
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const filteredDocs = documents.filter((doc) => {
    const term = searchQuery.toLowerCase().trim()
    if (!term) return true
    const titleMatch = (doc.title || "").toLowerCase().includes(term)
    const fileMatch = (doc.file_name || "").toLowerCase().includes(term)
    const folderMatch = (doc.folder_name || "").toLowerCase().includes(term)
    return titleMatch || fileMatch || folderMatch
  })

  const isSelected = (docId: number) => {
    return tempSelected.some((d) => d.document_id === docId)
  }

  const toggleDoc = (doc: ProjectDocumentItem) => {
    if (isSelected(doc.document_id)) {
      setTempSelected(tempSelected.filter((d) => d.document_id !== doc.document_id))
    } else {
      setTempSelected([...tempSelected, doc])
    }
  }

  const handleApply = () => {
    onApplySelection(tempSelected)
    onClose()
  }

  const selectAllFiltered = () => {
    const newItems = [...tempSelected]
    for (const doc of filteredDocs) {
      if (!newItems.some((d) => d.document_id === doc.document_id)) {
        newItems.push(doc)
      }
    }
    setTempSelected(newItems)
  }

  const clearAllSelections = () => {
    setTempSelected([])
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        className={cn(
          "relative flex flex-col w-full max-w-2xl max-h-[85vh] rounded-2xl border shadow-2xl overflow-hidden transition-all duration-200",
          isDark
            ? "border-zinc-800 bg-[#161618] text-white shadow-black/80"
            : "border-slate-200 bg-white text-slate-900 shadow-xl"
        )}
      >
        {/* Top Header Bar */}
        <div
          className={cn(
            "flex items-center justify-between px-5 py-4 border-b shrink-0",
            isDark ? "border-zinc-800 bg-zinc-900/50" : "border-slate-100 bg-slate-50/70"
          )}
        >
          {/* Left Header Title */}
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold tracking-tight text-slate-800 dark:text-zinc-100">
              Select Project Documents
            </h3>
            {tempSelected.length > 0 && (
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-bold",
                  isDark ? "bg-indigo-950 text-indigo-300 border border-indigo-700/60" : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                )}
              >
                {tempSelected.length} selected
              </span>
            )}
          </div>

          {/* Right Action Buttons (Done / Select N, Clear, Close) */}
          <div className="flex items-center gap-2">
            {tempSelected.length > 0 && (
              <button
                type="button"
                onClick={clearAllSelections}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                  isDark ? "text-zinc-400 hover:text-white hover:bg-zinc-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/60"
                )}
              >
                Clear
              </button>
            )}

            <button
              type="button"
              onClick={handleApply}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-xs flex items-center gap-1.5",
                tempSelected.length > 0
                  ? "bg-indigo-600 text-white hover:bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.4)]"
                  : isDark
                  ? "bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-750 hover:text-white"
                  : "bg-slate-900 text-white hover:bg-slate-800"
              )}
            >
              <Check className="size-3.5 stroke-[2.5]" />
              <span>{tempSelected.length > 0 ? `Select (${tempSelected.length})` : "Done"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className={cn(
                "grid size-7 place-items-center rounded-lg transition-colors cursor-pointer ml-1",
                isDark ? "text-zinc-400 hover:bg-zinc-800 hover:text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className={cn("px-5 py-3 border-b shrink-0", isDark ? "border-zinc-800/80 bg-zinc-900/30" : "border-slate-100 bg-white")}>
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 size-4 text-slate-400 dark:text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search allowed documents by title, file name, or folder..."
              className={cn(
                "w-full rounded-xl border pl-10 pr-4 py-2 text-xs outline-none transition-colors",
                isDark
                  ? "border-zinc-800 bg-zinc-900 text-white placeholder:text-zinc-500 focus:border-indigo-500"
                  : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500"
              )}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Document List Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[55vh] custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400 dark:text-zinc-500">
              <Loader2 className="size-6 animate-spin text-indigo-500" />
              <span className="text-xs font-medium">Fetching allowed project documents...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-red-500 text-xs font-medium text-center">
              <span>{error}</span>
              <button
                type="button"
                onClick={fetchDocs}
                className="mt-1 px-3 py-1 bg-red-500/10 border border-red-500/30 text-red-400 rounded-md hover:bg-red-500/20"
              >
                Retry
              </button>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-zinc-500 text-center">
              <FileText className="size-8 stroke-[1.5] text-slate-300 dark:text-zinc-600 mb-2" />
              <span className="text-xs font-medium">
                {searchQuery ? "No matching documents found" : "No allowed project documents available"}
              </span>
            </div>
          ) : (
            filteredDocs.map((doc) => {
              const checked = isSelected(doc.document_id)
              return (
                <div
                  key={doc.document_id}
                  onClick={() => toggleDoc(doc)}
                  className={cn(
                    "flex items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none",
                    checked
                      ? isDark
                        ? "border-indigo-500/70 bg-indigo-950/30 text-white shadow-[0_0_12px_rgba(99,102,241,0.15)]"
                        : "border-indigo-400 bg-indigo-50/60 text-slate-900 shadow-xs"
                      : isDark
                      ? "border-zinc-800/80 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800/60 hover:border-zinc-700"
                      : "border-slate-100 bg-slate-50/50 text-slate-700 hover:bg-slate-100/70 hover:border-slate-200"
                  )}
                >
                  {/* Left Document Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={cn(
                        "grid size-9 place-items-center rounded-lg shrink-0 border",
                        isDark ? "border-zinc-700/60 bg-zinc-800" : "border-slate-200 bg-white"
                      )}
                    >
                      {getFileFormatIcon(doc.file_name, "size-4.5")}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs truncate max-w-[320px]">
                          {doc.title || doc.file_name}
                        </span>
                        {doc.active_version && (
                          <span
                            className={cn(
                              "px-1.5 py-0.2 rounded-xs text-[10px] font-bold uppercase tracking-wider shrink-0",
                              isDark ? "bg-zinc-800 text-indigo-300 border border-zinc-700" : "bg-indigo-100 text-indigo-700"
                            )}
                          >
                            v{doc.active_version}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400 dark:text-zinc-500 truncate">
                        <span className="truncate">{doc.file_name}</span>
                        {doc.folder_name && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1 shrink-0">
                              <Folder className="size-3 text-indigo-400" />
                              {doc.folder_name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Custom Checkbox */}
                  <div className="shrink-0 pl-2">
                    <div
                      className={cn(
                        "grid size-5 place-items-center rounded-md border transition-all",
                        checked
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                          : isDark
                          ? "border-zinc-700 bg-zinc-800/80"
                          : "border-slate-300 bg-white"
                      )}
                    >
                      {checked && <Check className="size-3.5 stroke-[3]" />}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
