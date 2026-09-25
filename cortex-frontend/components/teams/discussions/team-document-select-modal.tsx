"use client"

import React, { useEffect, useState } from "react"
import { Check, FileText, Folder, Loader2, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { getFileFormatIcon } from "@/components/agent-chat/project-document-select-modal"
import type { ProjectDocumentItem } from "@/lib/ai-agent"

type TeamDocumentSelectModalProps = {
  isDark: boolean
  teamDocs: ProjectDocumentItem[]
  loading: boolean
  selectedDocs: ProjectDocumentItem[]
  onApplySelection: (docs: ProjectDocumentItem[]) => void
  onClose: () => void
}

export function TeamDocumentSelectModal({
  isDark,
  teamDocs,
  loading,
  selectedDocs,
  onApplySelection,
  onClose,
}: TeamDocumentSelectModalProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [tempSelected, setTempSelected] = useState<ProjectDocumentItem[]>(selectedDocs)

  useEffect(() => {
    setTempSelected(selectedDocs)
  }, [selectedDocs])

  const filteredDocs = teamDocs.filter((doc) => {
    const term = searchQuery.toLowerCase().trim()
    if (!term) return true
    return (
      (doc.title || "").toLowerCase().includes(term) ||
      (doc.file_name || "").toLowerCase().includes(term) ||
      (doc.folder_name || "").toLowerCase().includes(term)
    )
  })

  const isSelected = (docId: number) => tempSelected.some((d) => d.document_id === docId)

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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={cn(
          "relative flex flex-col w-full max-w-2xl max-h-[80vh] rounded-2xl border shadow-2xl overflow-hidden transition-all duration-200",
          isDark
            ? "border-zinc-800 bg-[#161618] text-white shadow-black/80"
            : "border-slate-200 bg-white text-slate-900 shadow-xl"
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex items-center justify-between px-5 py-4 border-b shrink-0",
            isDark ? "border-zinc-800 bg-zinc-900/50" : "border-slate-100 bg-slate-50/70"
          )}
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold tracking-tight">
              Select Team Documents
            </h3>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-medium",
                isDark ? "bg-violet-950/60 text-violet-300 border border-violet-700/50" : "bg-violet-50 text-violet-700 border border-violet-200"
              )}
            >
              Team only
            </span>
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

          <div className="flex items-center gap-2">
            {tempSelected.length > 0 && (
              <button
                type="button"
                onClick={() => setTempSelected([])}
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

        {/* Search */}
        <div className={cn("px-5 py-3 border-b shrink-0", isDark ? "border-zinc-800/80 bg-zinc-900/30" : "border-slate-100 bg-white")}>
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 size-4 text-slate-400 dark:text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, file name, or folder..."
              autoFocus
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

        {/* Document List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400 dark:text-zinc-500">
              <Loader2 className="size-6 animate-spin text-indigo-500" />
              <span className="text-xs font-medium">Loading team documents...</span>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-zinc-500 text-center">
              <FileText className="size-8 stroke-[1.5] text-slate-300 dark:text-zinc-600 mb-2" />
              <span className="text-xs font-medium">
                {searchQuery ? "No matching documents found" : "No documents are accessible for this team"}
              </span>
              {!searchQuery && (
                <p className="mt-1 text-[11px] text-slate-400 dark:text-zinc-500 max-w-xs">
                  Documents must be assigned to this team when uploaded. Contact your admin to add documents.
                </p>
              )}
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
                              "px-1.5 rounded-xs text-[10px] font-bold uppercase tracking-wider shrink-0",
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

                  {/* Checkbox */}
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

        {/* Footer hint */}
        {tempSelected.length > 0 && (
          <div
            className={cn(
              "px-5 py-3 border-t text-[11px] shrink-0",
              isDark ? "border-zinc-800 bg-zinc-900/30 text-zinc-500" : "border-slate-100 bg-slate-50 text-slate-400"
            )}
          >
            ✦ Cortex will answer only from the {tempSelected.length} selected document{tempSelected.length > 1 ? "s" : ""}. Clear selection to use all team docs.
          </div>
        )}
      </div>
    </div>
  )
}
