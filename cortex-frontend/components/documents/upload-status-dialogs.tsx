"use client"

import { FileWarning, HardDrive, Layers3, LoaderCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type DocumentPlanLimit = {
  code: "DOCUMENT_LIMIT_REACHED" | "STORAGE_LIMIT_REACHED"
  currentDocuments: number
  maxDocuments: number
  currentStorageBytes: number
  incomingFileSize: number
  maxStorageMb: number
  planName: string
}

export function parseDocumentPlanLimit(detail: unknown): DocumentPlanLimit | null {
  if (!detail || typeof detail !== "object") return null
  const value = detail as Record<string, unknown>
  if (value.code !== "DOCUMENT_LIMIT_REACHED" && value.code !== "STORAGE_LIMIT_REACHED") return null
  return {
    code: value.code,
    currentDocuments: Number(value.current_documents) || 0,
    maxDocuments: Number(value.max_documents) || 0,
    currentStorageBytes: Number(value.current_storage_bytes) || 0,
    incomingFileSize: Number(value.incoming_file_size) || 0,
    maxStorageMb: Number(value.max_storage_mb) || 0,
    planName: typeof value.plan_name === "string" ? value.plan_name : "Current",
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentUploadStatusDialogs({
  isDark,
  limit,
  onCloseLimit,
  uploadComplete,
  onCloseUploadComplete,
}: {
  isDark: boolean
  limit: DocumentPlanLimit | null
  onCloseLimit: () => void
  uploadComplete: boolean
  onCloseUploadComplete: () => void
}) {
  const maxStorageBytes = (limit?.maxStorageMb || 0) * 1024 * 1024

  return (
    <>
      <Dialog open={!!limit} onOpenChange={(open) => !open && onCloseLimit()}>
        <DialogContent className={cn(
          "overflow-hidden rounded-2xl p-0 sm:max-w-md",
          isDark ? "border-zinc-700 bg-[#15171d] text-white" : "border-slate-200 bg-white text-slate-900"
        )}>
          <div className={cn(
            "px-6 pb-5 pt-6",
            isDark
              ? "bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent"
              : "bg-gradient-to-br from-amber-50 via-orange-50/60 to-white"
          )}>
            <DialogHeader className="text-left">
              <div className={cn(
                "mb-2 flex h-11 w-11 items-center justify-center rounded-xl",
                isDark ? "bg-amber-400/10 text-amber-300" : "bg-amber-100 text-amber-700"
              )}>
                {limit?.code === "STORAGE_LIMIT_REACHED"
                  ? <HardDrive className="h-5 w-5" />
                  : <Layers3 className="h-5 w-5" />}
              </div>
              <DialogTitle className="text-xl font-bold">
                {limit?.code === "STORAGE_LIMIT_REACHED" ? "Storage limit reached" : "Document limit reached"}
              </DialogTitle>
              <DialogDescription className={isDark ? "pt-1 text-zinc-400" : "pt-1 text-slate-600"}>
                The {limit?.planName} plan sets limits for documents and storage in this project.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-4 px-6 pb-6">
            <div className={cn("space-y-4 rounded-xl border p-4", isDark ? "border-zinc-700 bg-[#101115]" : "border-slate-200 bg-slate-50")}>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className={isDark ? "text-zinc-300" : "text-slate-700"}>Documents</span>
                  <span className="font-semibold">{limit?.currentDocuments} / {limit?.maxDocuments}</span>
                </div>
                <div className={cn("h-2 overflow-hidden rounded-full", isDark ? "bg-zinc-800" : "bg-slate-200")}>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                    style={{
                      width: `${limit?.maxDocuments
                        ? Math.min(100, (limit.currentDocuments / limit.maxDocuments) * 100)
                        : 100}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className={isDark ? "text-zinc-300" : "text-slate-700"}>Storage used</span>
                  <span className="font-semibold">
                    {formatBytes(limit?.currentStorageBytes || 0)} / {limit?.maxStorageMb} MB
                  </span>
                </div>
                <div className={cn("h-2 overflow-hidden rounded-full", isDark ? "bg-zinc-800" : "bg-slate-200")}>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                    style={{
                      width: `${maxStorageBytes
                        ? Math.min(100, ((limit?.currentStorageBytes || 0) / maxStorageBytes) * 100)
                        : 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
            <p className={cn("text-sm leading-relaxed", isDark ? "text-zinc-400" : "text-slate-600")}>
              This upload ({formatBytes(limit?.incomingFileSize || 0)}) was not stored. Remove documents or versions you no longer need, or ask a project admin about changing the project plan.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={onCloseLimit}>Got it</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadComplete} onOpenChange={(open) => !open && onCloseUploadComplete()}>
        <DialogContent className={cn(
          "overflow-hidden rounded-2xl p-0 sm:max-w-md",
          isDark ? "border-zinc-700 bg-[#15171d] text-white" : "border-slate-200 bg-white text-slate-900"
        )}>
          <div className={cn(
            "px-6 pb-5 pt-6",
            isDark
              ? "bg-gradient-to-br from-violet-500/10 via-sky-500/5 to-transparent"
              : "bg-gradient-to-br from-violet-50 via-sky-50/60 to-white"
          )}>
            <DialogHeader className="text-left">
              <div className={cn(
                "mb-2 flex h-11 w-11 items-center justify-center rounded-xl",
                isDark ? "bg-violet-400/10 text-violet-300" : "bg-violet-100 text-violet-700"
              )}>
                <LoaderCircle className="h-5 w-5 animate-spin" />
              </div>
              <DialogTitle className="text-xl font-bold">Upload complete — processing started</DialogTitle>
              <DialogDescription className={isDark ? "pt-1 text-zinc-400" : "pt-1 text-slate-600"}>
                Your document has been uploaded and queued for processing. It should be ready soon.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-4 px-6 pb-6">
            <div className={cn(
              "flex gap-3 rounded-xl border p-4 text-sm leading-relaxed",
              isDark ? "border-zinc-700 bg-[#101115] text-zinc-300" : "border-slate-200 bg-slate-50 text-slate-700"
            )}>
              <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
              <p>Select the document and open its <span className="font-semibold">Versions</span> tab to check the processing status.</p>
            </div>
            <DialogFooter>
              <Button onClick={onCloseUploadComplete}>Got it</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
