"use client"

import { cn } from "@/lib/utils"

export function ChatSkeletons({ isDark }: { isDark: boolean }) {
  return (
    <div className="space-y-6 px-5 py-5 animate-pulse">
      {/* Left Message Skeleton */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "size-9 shrink-0 rounded-full",
            isDark ? "bg-zinc-800" : "bg-slate-200"
          )}
        />
        <div className="space-y-2 max-w-[420px] w-full">
          <div className="flex items-center gap-2">
            <div className={cn("h-3.5 w-24 rounded-md", isDark ? "bg-zinc-800" : "bg-slate-200")} />
            <div className={cn("h-3 w-12 rounded-md", isDark ? "bg-zinc-850 opacity-60" : "bg-slate-200 opacity-60")} />
          </div>
          <div
            className={cn(
              "h-14 w-full rounded-2xl p-3",
              isDark ? "bg-[#1c2227]" : "bg-slate-100"
            )}
          />
        </div>
      </div>

      {/* Right Message Skeleton */}
      <div className="flex items-start justify-end gap-3">
        <div className="space-y-2 max-w-[380px] w-full flex flex-col items-end">
          <div className="flex items-center gap-2">
            <div className={cn("h-3 w-12 rounded-md", isDark ? "bg-zinc-850 opacity-60" : "bg-slate-200 opacity-60")} />
            <div className={cn("h-3.5 w-20 rounded-md", isDark ? "bg-zinc-800" : "bg-slate-200")} />
          </div>
          <div
            className={cn(
              "h-12 w-full rounded-2xl p-3",
              isDark ? "bg-zinc-800" : "bg-slate-200"
            )}
          />
        </div>
        <div
          className={cn(
            "size-9 shrink-0 rounded-full",
            isDark ? "bg-zinc-800" : "bg-slate-200"
          )}
        />
      </div>

      {/* Left Message Skeleton with Reply Quote */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "size-9 shrink-0 rounded-full",
            isDark ? "bg-zinc-800" : "bg-slate-200"
          )}
        />
        <div className="space-y-2 max-w-[480px] w-full">
          <div className="flex items-center gap-2">
            <div className={cn("h-3.5 w-28 rounded-md", isDark ? "bg-zinc-800" : "bg-slate-200")} />
            <div className={cn("h-3 w-14 rounded-md", isDark ? "bg-zinc-850 opacity-60" : "bg-slate-200 opacity-60")} />
          </div>
          <div
            className={cn(
              "space-y-2 rounded-2xl p-3.5",
              isDark ? "bg-[#1c2227]" : "bg-slate-100"
            )}
          >
            {/* Quote block preview skeleton */}
            <div className={cn("h-8 w-full rounded-lg border-l-4 border-violet-500/50 pl-3 pt-1", isDark ? "bg-zinc-900/60" : "bg-slate-200/60")} />
            <div className={cn("h-4 w-3/4 rounded-md", isDark ? "bg-zinc-800" : "bg-slate-200")} />
          </div>
        </div>
      </div>
    </div>
  )
}
