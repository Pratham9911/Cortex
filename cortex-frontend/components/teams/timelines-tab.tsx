"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ListChecks, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  AvatarStack,
  TeamTaskOverlays,
  fromApiTask,
  progressFor,
  type Priority,
  type Task,
  type TaskStatus,
  type TeamMember,
} from "@/components/teams/team-task-overlays"

type Range = "1d" | "30d" | "12m" | "max"

const DAY_MS = 86400000
const ROW_H = 76
const HEADER_H = 64
const META_INSIDE_MIN_WIDTH = 360
const META_OUTSIDE_WIDTH = 190
const LOAD_THRESHOLD = 180
const MAX_DAYS = 720
const WEEKEND_HATCH = "repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(128,128,128,.08) 3px, rgba(128,128,128,.08) 5px)"

const priorityBar: Record<Priority, string> = {
  HIGH: "bg-rose-500",
  MEDIUM: "bg-amber-400",
  LOW: "bg-sky-500",
}

const atNoon = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
const addDays = (date: Date, days: number) => atNoon(new Date(atNoon(date).getTime() + days * DAY_MS))
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
const parseDay = (value: string) => atNoon(new Date(`${value.slice(0, 10)}T12:00:00`))
const diffDays = (start: Date, end: Date) => Math.round((atNoon(end).getTime() - atNoon(start).getTime()) / DAY_MS)
const columnWidthFor = (range: Range) => (range === "1d" ? 120 : range === "12m" ? 36 : 56)
const chunkFor = (range: Range) => (range === "12m" || range === "max" ? 45 : range === "1d" ? 10 : 30)

function buildDays(start: Date, count: number) {
  return Array.from({ length: Math.max(1, count) }, (_, index) => addDays(start, index))
}

export function TimelinesTab({
  isDark,
  members,
  teamId,
  canManage = false,
  onOpenMemberDetails,
}: {
  isDark: boolean
  members: TeamMember[]
  teamId: number
  canManage?: boolean
  onOpenMemberDetails: (member: TeamMember) => void
}) {
  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const scrollerRef = useRef<HTMLDivElement>(null)
  const prependAdjustRef = useRef(0)
  const loadingEdgeRef = useRef<"left" | "right" | null>(null)
  const armedRef = useRef(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<Range>("30d")
  const [windowStart, setWindowStart] = useState(() => addDays(new Date(), -14))
  const [dayCount, setDayCount] = useState(36)
  const [headingDate, setHeadingDate] = useState(() => atNoon(new Date()))
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorStatus, setEditorStatus] = useState<TaskStatus | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const colW = columnWidthFor(range)
  const days = useMemo(() => buildDays(windowStart, dayCount), [windowStart, dayCount])
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null
  const sortedTasks = useMemo(
    () => tasks.slice().sort((a, b) => parseDay(a.created_at).getTime() - parseDay(b.created_at).getTime() || a.title.localeCompare(b.title)),
    [tasks]
  )
  const weekendIndexes = useMemo(() => days.flatMap((day, index) => (day.getDay() === 0 || day.getDay() === 6 ? [index] : [])), [days])
  const todayIndex = days.findIndex((day) => dateKey(day) === dateKey(new Date()))
  const heading = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(headingDate)
  const gridHeight = Math.max(HEADER_H + sortedTasks.length * ROW_H + 120, 520)
  const lineColor = isDark ? "rgba(63,63,70,0.7)" : "rgba(226,232,240,1)"

  const getContext = () => {
    const token = localStorage.getItem("access_token")
    const projectId = localStorage.getItem("selected_project_id")
    if (!token || !projectId) throw new Error("Project context is missing")
    return { token, projectId }
  }

  const resetWindow = useCallback((nextRange: Range, taskList: Task[]) => {
    armedRef.current = false
    const today = atNoon(new Date())
    const width = scrollerRef.current?.clientWidth || 1200
    const cols = Math.ceil(width / columnWidthFor(nextRange))
    if (nextRange === "max" && taskList.length) {
      const start = new Date(Math.min(...taskList.map((task) => parseDay(task.created_at).getTime())))
      const end = new Date(Math.max(...taskList.map((task) => parseDay(task.due_date).getTime())))
      const paddedStart = addDays(start, -7)
      const paddedEnd = addDays(end, Math.max(14, cols))
      setWindowStart(paddedStart)
      setDayCount(Math.min(MAX_DAYS, Math.max(cols + 10, diffDays(paddedStart, paddedEnd) + 1)))
      return
    }
    const behind = nextRange === "1d" ? 3 : Math.max(10, Math.floor(cols * 0.35))
    const ahead = Math.max(nextRange === "1d" ? 8 : 18, cols)
    setWindowStart(addDays(today, -behind))
    setDayCount(Math.min(MAX_DAYS, behind + ahead))
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { token, projectId } = getContext()
        const response = await fetch(`${api}/projects/${projectId}/teams/${teamId}/tasks`, { headers: { Authorization: `Bearer ${token}` } })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.detail || "Could not load timeline")
        const nextTasks = Array.isArray(data.tasks) ? data.tasks.map(fromApiTask) : []
        setTasks(nextTasks)
        setError("")
        resetWindow("30d", nextTasks)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load timeline")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [api, resetWindow, teamId])

  const daysRef = useRef(days)
  daysRef.current = days

  const centerToday = useCallback((behavior: ScrollBehavior = "auto") => {
    const node = scrollerRef.current
    if (!node) return
    const index = daysRef.current.findIndex((day) => dateKey(day) === dateKey(new Date()))
    if (index < 0) return
    node.scrollTo({ left: Math.max(0, index * colW - node.clientWidth * 0.28), behavior })
    armedRef.current = true
  }, [colW])

  useEffect(() => {
    if (loading) return
    const id = window.requestAnimationFrame(() => centerToday("auto"))
    return () => window.cancelAnimationFrame(id)
  }, [centerToday, loading, range])

  const extendWindow = useCallback((edge: "left" | "right") => {
    if (!armedRef.current || loadingEdgeRef.current || dayCount >= MAX_DAYS) return
    loadingEdgeRef.current = edge
    const chunk = chunkFor(range)
    if (edge === "right") {
      setDayCount((count) => Math.min(MAX_DAYS, count + chunk))
      return
    }
    prependAdjustRef.current = chunk * colW
    setWindowStart((start) => addDays(start, -chunk))
    setDayCount((count) => Math.min(MAX_DAYS, count + chunk))
  }, [colW, dayCount, range])

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    if (prependAdjustRef.current) {
      node.scrollLeft += prependAdjustRef.current
      prependAdjustRef.current = 0
    }
    loadingEdgeRef.current = null
  }, [dayCount, windowStart])

  const onGridScroll = () => {
    const node = scrollerRef.current
    if (!node) return
    const index = Math.min(days.length - 1, Math.max(0, Math.floor((node.scrollLeft + 24) / colW)))
    const next = days[index]
    if (next && dateKey(next) !== dateKey(headingDate)) setHeadingDate(next)
    if (!armedRef.current) return
    if (node.scrollLeft + node.clientWidth >= node.scrollWidth - LOAD_THRESHOLD) extendWindow("right")
    if (node.scrollLeft <= LOAD_THRESHOLD) extendWindow("left")
  }

  const changeRange = (next: Range) => {
    setRange(next)
    resetWindow(next, tasks)
  }

  const shiftWindow = (direction: -1 | 1) => {
    const node = scrollerRef.current
    if (!node) return
    armedRef.current = true
    node.scrollBy({ left: direction * Math.max(colW * 7, node.clientWidth * 0.7), behavior: "smooth" })
  }

  const openCreate = () => {
    setEditingTask(null)
    setEditorStatus("TODO")
    setEditorOpen(true)
  }

  return (
    <section className={cn("relative flex h-full min-h-0 min-w-0 w-full max-w-full flex-col overflow-hidden", isDark ? "bg-[#111111] text-zinc-100" : "bg-[#f7f8fa] text-slate-900")}>
      {error && <p className="absolute left-4 top-4 z-40 rounded-md bg-rose-500/15 px-3 py-2 text-sm text-rose-500">{error}</p>}

      <header className={cn("z-20 flex w-full min-w-0 shrink-0 items-center justify-between gap-3 overflow-hidden border-b px-5 py-3 sm:px-8", isDark ? "border-zinc-800/80 bg-[#111111]" : "border-slate-200 bg-[#f7f8fa]")}>
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <button type="button" onClick={() => shiftWindow(-1)} className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", isDark ? "text-zinc-400 hover:bg-zinc-800 hover:text-white" : "text-slate-500 hover:bg-white hover:text-slate-900")} aria-label="Previous dates">
            <ChevronLeft className="size-4" />
          </button>
          <h2 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{heading}</h2>
          <button type="button" onClick={() => shiftWindow(1)} className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", isDark ? "text-zinc-400 hover:bg-zinc-800 hover:text-white" : "text-slate-500 hover:bg-white hover:text-slate-900")} aria-label="Next dates">
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { armedRef.current = true; centerToday("smooth") }} className={cn("h-8 rounded-md", isDark ? "border-zinc-700 bg-transparent" : "bg-white")}>
            Today
          </Button>
          <div className={cn("flex items-center rounded-md p-0.5", isDark ? "bg-zinc-900" : "bg-white shadow-sm")}>
            {(["1d", "30d", "12m", "max"] as Range[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => changeRange(item)}
                className={cn("rounded-md px-2.5 py-1.5 text-xs font-semibold sm:px-3 sm:text-sm", range === item ? "bg-blue-600 text-white shadow-sm" : "text-zinc-500 hover:text-current")}
              >
                {item === "max" ? "Max" : item}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="relative min-h-0 min-w-0 w-full flex-1 overflow-hidden">
        <div ref={scrollerRef} onScroll={onGridScroll} className="absolute inset-0 overflow-auto overscroll-contain">
        {loading ? (
          <div className="flex h-full min-h-72 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="relative" style={{ width: `${days.length * colW}px`, minHeight: "100%", height: gridHeight }}>
            <div
              className={cn("sticky top-0 z-30 grid border-b", isDark ? "border-zinc-800 bg-[#111111]" : "border-slate-200 bg-[#f7f8fa]")}
              style={{ gridTemplateColumns: `repeat(${days.length}, ${colW}px)`, height: HEADER_H }}
            >
              {days.map((day) => {
                const weekend = day.getDay() === 0 || day.getDay() === 6
                const today = dateKey(day) === dateKey(new Date())
                const monthStart = day.getDate() === 1
                return (
                  <div
                    key={dateKey(day)}
                    className={cn("flex flex-col items-center justify-center border-r px-1 text-center", isDark ? "border-zinc-800/80" : "border-slate-200")}
                    style={weekend ? { backgroundImage: WEEKEND_HATCH } : undefined}
                  >
                    {monthStart && <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">{new Intl.DateTimeFormat("en", { month: "short" }).format(day)}</span>}
                    <span className={cn("inline-flex min-w-7 items-center justify-center rounded-full px-1.5 py-0.5 text-sm font-semibold", today && "bg-blue-600 text-white")}>
                      {day.getDate()}
                    </span>
                    {range !== "12m" && (
                      <span className={cn("text-[10px]", today ? "font-semibold text-blue-500" : "text-zinc-500")}>
                        {new Intl.DateTimeFormat("en", { weekday: "narrow" }).format(day)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            <div
              className="relative"
              style={{
                height: gridHeight - HEADER_H,
                backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${colW - 1}px, ${lineColor} ${colW - 1}px, ${lineColor} ${colW}px), repeating-linear-gradient(to bottom, transparent 0, transparent ${ROW_H - 1}px, ${lineColor} ${ROW_H - 1}px, ${lineColor} ${ROW_H}px)`,
              }}
            >
              {weekendIndexes.map((index) => (
                <div key={`weekend-${index}`} className="pointer-events-none absolute inset-y-0" style={{ left: index * colW, width: colW, backgroundImage: WEEKEND_HATCH }} />
              ))}

              {todayIndex >= 0 && (
                <div className="pointer-events-none absolute inset-y-0 z-20" style={{ left: todayIndex * colW + colW / 2 }}>
                  <span className="absolute top-0 left-1/2 z-30 size-1.5 -translate-x-1/2 rounded-full bg-blue-600" />
                  <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-blue-500/80" />
                </div>
              )}

              {sortedTasks.length === 0 && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center">
                  <CalendarDays className="size-8 text-zinc-500" />
                  <p className="mt-3 text-sm font-medium">No tasks on this timeline yet</p>
                  <p className="mt-1 text-xs text-zinc-500">Create a task to see it span from start to due date.</p>
                </div>
              )}

              {sortedTasks.map((task, row) => {
                const rawStart = diffDays(windowStart, parseDay(task.created_at))
                const rawEnd = diffDays(windowStart, parseDay(task.due_date))
                const orderedStart = Math.min(rawStart, rawEnd)
                const orderedEnd = Math.max(rawStart, rawEnd)
                const start = Math.max(0, orderedStart)
                const end = Math.min(days.length - 1, orderedEnd)
                const visible = orderedEnd >= 0 && orderedStart < days.length && end >= start
                const span = visible ? Math.max(1, end - start + 1) : 1
                const progress = progressFor(task)
                const metaInside = visible && span * colW >= META_INSIDE_MIN_WIDTH
                const spaceAfterBar = (days.length - end - 1) * colW
                const metaAfter = spaceAfterBar >= META_OUTSIDE_WIDTH
                const metaLeft = metaAfter
                  ? (end + 1) * colW + 8
                  : Math.max(6, start * colW - META_OUTSIDE_WIDTH - 8)
                const isDone = task.status === "DONE"
                const top = row * ROW_H + 12
                return (
                  <div key={task.id} className="absolute left-0 right-0" style={{ top, height: ROW_H - 24 }}>
                    {visible && (
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Open task: ${task.title}`}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            setSelectedTaskId(task.id)
                          }
                        }}
                        onClick={() => setSelectedTaskId(task.id)}
                        style={{ left: start * colW + 6, width: Math.max(span * colW - 12, 112) }}
                        className={cn(
                          "absolute inset-y-0 z-10 flex min-w-0 items-center gap-2.5 rounded-lg border px-2.5 text-left shadow-[0_6px_18px_rgba(15,23,42,0.10)] transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                          isDone
                            ? isDark
                              ? "border-emerald-500/40 bg-emerald-400/10 text-zinc-100 hover:border-emerald-400/70"
                              : "border-emerald-200 bg-emerald-50 text-slate-800 hover:border-emerald-300"
                            : isDark
                              ? "border-zinc-700/80 bg-[#1c1c1c] text-zinc-100 hover:border-zinc-500"
                              : "border-white bg-white text-slate-800"
                        )}
                      >
                        <span className={cn("h-8 w-1 shrink-0 rounded-full", isDone ? "bg-emerald-500" : priorityBar[task.priority])} />
                        <ListChecks className="size-4 shrink-0 text-zinc-500" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
                        {metaInside && (
                          <span className="flex shrink-0 items-center gap-2 text-[10px] text-zinc-500 sm:gap-2.5 sm:text-[11px]">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="size-3.5" />
                              {parseDay(task.due_date).getDate()}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 className="size-3.5" />
                              {progress.complete}/{progress.total}
                            </span>
                            <AvatarStack
                              assigneeIds={task.assignees}
                              members={members}
                              isDark={isDark}
                              interactive
                              onMemberClick={onOpenMemberDetails}
                              onOverflowClick={() => setSelectedTaskId(task.id)}
                            />
                          </span>
                        )}
                      </div>
                    )}
                    {visible && !metaInside && (
                      <div className="absolute inset-y-0 z-10 flex items-center gap-3 px-2 text-xs text-zinc-500" style={{ left: metaLeft }}>
                        <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{parseDay(task.due_date).getDate()}</span>
                        <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3.5" />{progress.complete}/{progress.total}</span>
                        <AvatarStack assigneeIds={task.assignees} members={members} isDark={isDark} interactive onMemberClick={onOpenMemberDetails} onOverflowClick={() => setSelectedTaskId(task.id)} />
                      </div>
                    )}
                  </div>
                )
              })}

            </div>
          </div>
        )}
        </div>
      </div>

      {canManage && (
        <Button
          type="button"
          size="sm"
          onClick={openCreate}
          className={cn(
            "absolute left-5 top-1/2 z-40 h-9 -translate-y-1/2 rounded-full px-4 shadow-lg",
            isDark
              ? "bg-white text-black hover:bg-zinc-200"
              : "bg-slate-900 text-white hover:bg-slate-800",
          )}
        >
          <Plus className="size-4" />
          New
        </Button>
      )}

      <TeamTaskOverlays
        isDark={isDark}
        members={members}
        canManage={canManage}
        teamId={teamId}
        selectedTask={selectedTask}
        onClose={() => setSelectedTaskId(null)}
        onTaskSaved={(task) => {
          setTasks((current) => {
            const exists = current.some((item) => item.id === task.id)
            return exists ? current.map((item) => (item.id === task.id ? task : item)) : [...current, task]
          })
          setSelectedTaskId(task.id)
          const due = parseDay(task.due_date)
          const created = parseDay(task.created_at)
          const first = daysRef.current[0]
          const last = daysRef.current[daysRef.current.length - 1]
          if (first && created < first) {
            const extra = diffDays(created, first) + 7
            prependAdjustRef.current = extra * colW
            setWindowStart(addDays(created, -7))
            setDayCount((count) => Math.min(MAX_DAYS, count + extra))
          }
          if (last && due > last) {
            setDayCount((count) => Math.min(MAX_DAYS, count + diffDays(last, due) + 7))
          }
        }}
        onTaskDeleted={(taskId) => {
          setTasks((current) => current.filter((item) => item.id !== taskId))
          setSelectedTaskId(null)
        }}
        onOpenMemberDetails={onOpenMemberDetails}
        editorOpen={editorOpen}
        editorStatus={editorStatus}
        editingTask={editingTask}
        onEditorOpenChange={(open, next) => {
          setEditorOpen(open)
          if (!open) {
            setEditingTask(null)
            setEditorStatus(null)
            return
          }
          if (next?.task) {
            setSelectedTaskId(null)
            setEditingTask(next.task)
            setEditorStatus(next.status || next.task.status)
          } else if (next?.status) {
            setEditorStatus(next.status)
            setEditingTask(null)
          }
        }}
      />
    </section>
  )
}
