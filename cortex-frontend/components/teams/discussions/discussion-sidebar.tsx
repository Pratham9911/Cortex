"use client"

import { Hash, Loader2, Pin, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { DiscussionItem } from "./types"

export function DiscussionSidebar({
  isDark,
  isAdmin,
  discussions,
  loading,
  activeDiscussionId,
  searchQuery,
  onSearchChange,
  onSelectDiscussion,
  onCreateOpen,
}: {
  isDark: boolean
  isAdmin: boolean
  discussions: DiscussionItem[]
  loading: boolean
  activeDiscussionId: number | null
  searchQuery: string
  onSearchChange: (query: string) => void
  onSelectDiscussion: (id: number) => void
  onCreateOpen: () => void
}) {
  const filtered = discussions.filter((d) =>
    `${d.name} ${d.description || ""}`.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const pinnedList = filtered.filter((d) => d.is_pinned)
  const unpinnedList = filtered.filter((d) => !d.is_pinned)

  return (
    <aside
      className={cn(
        "flex flex-col h-full w-[240px] shrink-0 border-r min-h-0 select-none sm:w-[260px]",
        isDark ? "border-zinc-800 bg-[#121518]" : "border-slate-200 bg-white"
      )}
    >
      {/* Top Fixed Header with Search & Add Button */}
      <div
        className={cn(
          "shrink-0 border-b p-4 shadow-sm z-10",
          isDark ? "border-zinc-800 bg-[#121518]" : "border-slate-200 bg-white"
        )}
      >
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              className={cn(
                "pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2",
                isDark ? "text-zinc-400" : "text-slate-400"
              )}
            />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search discussions"
              className={cn(
                "h-10 rounded-xl pl-9 text-xs shadow-sm",
                isDark
                  ? "border-zinc-700 bg-[#1b2024] text-white placeholder:text-zinc-500 focus-visible:border-zinc-500"
                  : "border-slate-200 bg-slate-50"
              )}
            />
          </div>
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onCreateOpen}
              title="Create new discussion"
              className={cn(
                "shrink-0 rounded-xl",
                isDark ? "text-zinc-300 hover:bg-zinc-800 hover:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-black"
              )}
            >
              <Plus className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Scrolling Discussion List Container — Starts Directly Below Search Bar Area */}
      <div
        style={{ scrollbarWidth: "thin", scrollbarColor: isDark ? "#4b5563 transparent" : "#cbd5e1 transparent" }}
        className="flex-1 overflow-y-auto px-3 py-2 min-h-0"
      >

      {loading ? (
        <div className="flex flex-col items-center justify-center py-10 text-center text-xs opacity-60">
          <Loader2 className="mb-2 size-5 animate-spin" />
          <span>Loading discussions...</span>
        </div>
      ) : (
        <>
          {/* Pinned Channels */}
          {pinnedList.length > 0 && (
            <div className="mt-1">
              <p
                className={cn(
                  "flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em]",
                  isDark ? "text-zinc-400" : "text-slate-500"
                )}
              >
                <Pin className="size-3 fill-current text-amber-500" /> Pinned Channels
              </p>
              <div className="mt-1.5 space-y-1">
                {pinnedList.map((d) => (
                  <DiscussionRow
                    key={d.id}
                    discussion={d}
                    active={activeDiscussionId === d.id}
                    isDark={isDark}
                    onClick={() => onSelectDiscussion(d.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* All Discussions */}
          <div className={cn(pinnedList.length > 0 ? "mt-4" : "mt-1")}>
            <p
              className={cn(
                "flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em]",
                isDark ? "text-zinc-400" : "text-slate-500"
              )}
            >
              <Hash className="size-3" /> Discussions ({filtered.length})
            </p>
            <div className="mt-2 space-y-1">
              {unpinnedList.length === 0 && pinnedList.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-500">
                  <p>No discussions found.</p>
                  {isAdmin && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={onCreateOpen}
                      className="mt-1 h-auto p-0 text-xs text-violet-500"
                    >
                      + Create Discussion
                    </Button>
                  )}
                </div>
              ) : (
                unpinnedList.map((d) => (
                  <DiscussionRow
                    key={d.id}
                    discussion={d}
                    active={activeDiscussionId === d.id}
                    isDark={isDark}
                    onClick={() => onSelectDiscussion(d.id)}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
      </div>
    </aside>
  )
}

function DiscussionRow({
  discussion,
  active,
  isDark,
  onClick,
}: {
  discussion: DiscussionItem
  active: boolean
  isDark: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all select-none",
        active
          ? isDark
            ? "bg-[#22282e] text-white shadow-sm border border-zinc-700/60"
            : "bg-slate-100 text-slate-900 border border-slate-300/80 shadow-sm"
          : isDark
          ? "hover:bg-[#1b2024] text-zinc-300"
          : "hover:bg-slate-50 text-slate-700"
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-xl border text-sm font-bold transition-colors",
          active
            ? isDark
              ? "border-zinc-600 bg-zinc-800 text-white"
              : "border-slate-400 bg-slate-900 text-white"
            : isDark
            ? "border-zinc-800 bg-zinc-900 text-zinc-400 group-hover:border-zinc-700 group-hover:text-zinc-200"
            : "border-slate-200 bg-slate-100 text-slate-600 group-hover:border-slate-300 group-hover:text-slate-900"
        )}
      >
        <Hash className="size-4 stroke-[2.5]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-1.5">
          <span className="truncate text-xs font-semibold">{discussion.name}</span>
          {discussion.is_pinned && <Pin className="size-3 shrink-0 text-amber-500 fill-amber-500" />}
        </span>
        {discussion.description && (
          <span className={cn("mt-0.5 block truncate text-[11px]", isDark ? "text-zinc-400" : "text-slate-500")}>
            {discussion.description}
          </span>
        )}
      </span>
    </button>
  )
}
