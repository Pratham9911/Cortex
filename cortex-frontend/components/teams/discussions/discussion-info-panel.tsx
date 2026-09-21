"use client"

import { Calendar, Clock, Hash, Loader2, Pencil, Pin, Trash2, User, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { DiscussionItem } from "./types"

export function DiscussionInfoPanel({
  isDark,
  isAdmin,
  activeDiscussion,
  singleDetails,
  onClose,
  isEditingDetails,
  editName,
  editDescription,
  savingDetails,
  editError,
  onStartEditing,
  onCancelEditing,
  onNameChange,
  onDescriptionChange,
  onSaveDetails,
  togglingPin,
  onTogglePin,
  onOpenDelete,
}: {
  isDark: boolean
  isAdmin: boolean
  activeDiscussion: DiscussionItem
  singleDetails: DiscussionItem | null
  onClose: () => void
  isEditingDetails: boolean
  editName: string
  editDescription: string
  savingDetails: boolean
  editError: string
  onStartEditing: () => void
  onCancelEditing: () => void
  onNameChange: (val: string) => void
  onDescriptionChange: (val: string) => void
  onSaveDetails: () => void
  togglingPin: boolean
  onTogglePin: () => void
  onOpenDelete: () => void
}) {
  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "—"
    try {
      return new Date(isoString).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    } catch {
      return isoString
    }
  }

  return (
    <aside
      style={{ scrollbarWidth: "thin", scrollbarColor: isDark ? "#4b5563 transparent" : "#cbd5e1 transparent" }}
      className={cn(
        "flex w-[300px] shrink-0 flex-col min-h-0 overflow-y-auto border-l sm:w-[340px] transition-all duration-200 select-none",
        isDark ? "border-zinc-800 bg-[#101315] text-white" : "border-slate-200 bg-white text-slate-900"
      )}
    >
      {/* Panel Header */}
      <div
        className={cn(
          "flex h-[54px] shrink-0 items-center justify-between border-b px-4",
          isDark ? "border-zinc-800" : "border-slate-200"
        )}
      >
        <div className="flex items-center gap-3 font-semibold text-sm">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className={cn(
              "rounded-full",
              isDark ? "text-zinc-400 hover:bg-zinc-800 hover:text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <X className="size-4" />
          </Button>
          <span>Discussion info</span>
        </div>
      </div>

      {/* Panel Body */}
      <div className="p-5 space-y-6 overflow-y-auto">
        {/* Monochromatic Black/White # Avatar Hero */}
        <div className="flex flex-col items-center text-center">
          <div
            className={cn(
              "flex size-24 items-center justify-center rounded-3xl border-2 shadow-md mb-3",
              isDark
                ? "border-zinc-700 bg-zinc-900 text-white shadow-black/50"
                : "border-slate-300 bg-slate-100 text-slate-900 shadow-slate-200"
            )}
          >
            <Hash className="size-12 stroke-[2.5]" />
          </div>

          {/* Title & Editable Section */}
          {isEditingDetails ? (
            <div className="w-full space-y-3 mt-2 text-left">
              <div>
                <label
                  className={cn(
                    "text-[11px] font-bold uppercase tracking-wider block mb-1",
                    isDark ? "text-zinc-400" : "text-slate-500"
                  )}
                >
                  Discussion Name
                </label>
                <Input
                  value={editName}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="Discussion name..."
                  className={cn("h-9 text-xs rounded-xl", isDark ? "border-zinc-700 bg-[#1b2024] text-white" : "border-slate-300 bg-slate-50")}
                />
              </div>

              <div>
                <label
                  className={cn(
                    "text-[11px] font-bold uppercase tracking-wider block mb-1",
                    isDark ? "text-zinc-400" : "text-slate-500"
                  )}
                >
                  Description
                </label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  placeholder="Add a description..."
                  rows={3}
                  className={cn("text-xs resize-none rounded-xl", isDark ? "border-zinc-700 bg-[#1b2024] text-white" : "border-slate-300 bg-slate-50")}
                />
              </div>

              {editError && <p className="text-xs text-red-400">{editError}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={onCancelEditing} className="rounded-xl text-xs">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={savingDetails || !editName.trim()}
                  onClick={onSaveDetails}
                  className={cn("rounded-xl text-xs", isDark ? "bg-white text-black hover:bg-zinc-200" : "bg-slate-900 text-white hover:bg-slate-800")}
                >
                  {savingDetails ? <Loader2 className="size-3 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="w-full relative">
              <div className="flex items-center justify-center gap-2">
                <h3 className="text-lg font-bold tracking-tight">{activeDiscussion.name}</h3>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onStartEditing}
                    className={cn("rounded-lg opacity-70 hover:opacity-100", isDark ? "hover:bg-zinc-800" : "hover:bg-slate-100")}
                    title="Edit discussion info"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
              </div>
              <p
                className={cn(
                  "text-xs mt-1.5 px-2 leading-relaxed whitespace-pre-wrap",
                  isDark ? "text-zinc-400" : "text-slate-500"
                )}
              >
                {activeDiscussion.description || (
                  <span className="italic opacity-60">No description provided</span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Pin Action / Toggle */}
        <div
          className={cn(
            "rounded-2xl border p-3.5 flex items-center justify-between",
            isDark ? "border-zinc-800 bg-[#161a1e]" : "border-slate-200 bg-slate-50"
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-xl border",
                isDark ? "border-zinc-700 bg-zinc-800 text-amber-400" : "border-amber-200 bg-amber-50 text-amber-700"
              )}
            >
              <Pin className={cn("size-4", activeDiscussion.is_pinned && "fill-current")} />
            </div>
            <div>
              <p className="text-xs font-semibold">Pinned Channel</p>
              <p className={cn("text-[10px]", isDark ? "text-zinc-400" : "text-slate-500")}>
                {activeDiscussion.is_pinned ? "Pinned to top of team list" : "Standard discussion channel"}
              </p>
            </div>
          </div>
          {isAdmin && (
            <Button
              variant={activeDiscussion.is_pinned ? "secondary" : "outline"}
              size="sm"
              disabled={togglingPin}
              onClick={onTogglePin}
              className={cn(
                "text-xs rounded-xl h-8 px-3 font-medium",
                activeDiscussion.is_pinned
                  ? isDark
                    ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                    : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                  : isDark
                  ? "border-zinc-700 hover:bg-zinc-800"
                  : "border-slate-300 hover:bg-white"
              )}
            >
              {togglingPin ? <Loader2 className="size-3 animate-spin" /> : activeDiscussion.is_pinned ? "Unpin" : "Pin"}
            </Button>
          )}
        </div>

        {/* Info / Metadata Cards */}
        <div
          className={cn(
            "rounded-2xl border p-4 space-y-3 text-xs",
            isDark ? "border-zinc-800 bg-[#161a1e]" : "border-slate-200 bg-slate-50"
          )}
        >
          <h4
            className={cn(
              "text-[10px] font-bold uppercase tracking-wider",
              isDark ? "text-zinc-500" : "text-slate-400"
            )}
          >
            Channel Details
          </h4>

          <div className="flex items-center justify-between">
            <span className={cn("flex items-center gap-2", isDark ? "text-zinc-400" : "text-slate-500")}>
              <User className="size-3.5" /> Created by
            </span>
            <span className="font-semibold text-right">
              {singleDetails?.created_by_name || "Admin"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className={cn("flex items-center gap-2", isDark ? "text-zinc-400" : "text-slate-500")}>
              <Calendar className="size-3.5" /> Created at
            </span>
            <span className="font-medium">{formatDate(activeDiscussion.created_at)}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className={cn("flex items-center gap-2", isDark ? "text-zinc-400" : "text-slate-500")}>
              <Clock className="size-3.5" /> Last updated
            </span>
            <span className="font-medium">{formatDate(activeDiscussion.updated_at)}</span>
          </div>
        </div>

        {/* Admin Delete Action */}
        {isAdmin && (
          <div className="pt-2">
            <Button
              variant="destructive"
              className={cn(
                "w-full justify-center gap-2 rounded-xl text-xs h-10 font-semibold shadow-sm",
                isDark
                  ? "bg-rose-900/40 text-rose-300 border border-rose-800/60 hover:bg-rose-900/70"
                  : "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
              )}
              onClick={onOpenDelete}
            >
              <Trash2 className="size-4" /> Delete Discussion
            </Button>
          </div>
        )}
      </div>
    </aside>
  )
}
