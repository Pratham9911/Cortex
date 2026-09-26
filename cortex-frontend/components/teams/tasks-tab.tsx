"use client"

import { useMemo, useState } from "react"
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronDown, Clock3, Flag, GripVertical, LayoutGrid, List, ListChecks, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, Tag, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE"
type Priority = "LOW" | "MEDIUM" | "HIGH"
type TeamMember = { user_id: number; name: string; avatar_url?: string }
type Subtask = { id: number; title: string; is_completed: boolean; position: number }
type Task = { id: number; team_id: number; title: string; description: string; status: TaskStatus; due_date: string; priority: Priority; assignees: number[]; tags: string[]; created_by: number; created_at: string; updated_at: string; subtasks: Subtask[] }

const columns: Array<{ status: TaskStatus; title: string; dotClass: string }> = [
  { status: "TODO", title: "New request", dotClass: "bg-slate-400" },
  { status: "IN_PROGRESS", title: "In progress", dotClass: "bg-amber-500" },
  { status: "DONE", title: "Completed", dotClass: "bg-emerald-500" },
]

const initialTasks: Task[] = [
  { id: 1, team_id: 1, title: "Homepage experience refresh", description: "Refine the information hierarchy and make the first-run experience clearer for new visitors.", status: "TODO", due_date: "2026-10-02", priority: "HIGH", assignees: [1, 2, 3, 4], tags: ["Website", "Design"], created_by: 1, created_at: "2026-09-18", updated_at: "2026-09-22", subtasks: [{ id: 1, title: "Review the current conversion path", is_completed: true, position: 1 }, { id: 2, title: "Map the revised content hierarchy", is_completed: false, position: 2 }, { id: 3, title: "Prepare desktop and mobile directions", is_completed: false, position: 3 }, { id: 4, title: "Collect stakeholder feedback", is_completed: false, position: 4 }] },
  { id: 2, team_id: 1, title: "Client onboarding checklist", description: "Create the practical handoff checklist used when a new workspace is ready to launch.", status: "TODO", due_date: "2026-10-08", priority: "MEDIUM", assignees: [2, 5], tags: ["Operations", "Launch"], created_by: 2, created_at: "2026-09-19", updated_at: "2026-09-21", subtasks: [{ id: 5, title: "List account setup requirements", is_completed: true, position: 1 }, { id: 6, title: "Write the handoff sequence", is_completed: true, position: 2 }, { id: 7, title: "Add owner contacts", is_completed: false, position: 3 }] },
  { id: 3, team_id: 1, title: "Research competing workflows", description: "Compare the workflows teams use most often and highlight opportunities for a simpler path.", status: "IN_PROGRESS", due_date: "2026-09-29", priority: "HIGH", assignees: [1, 3, 5], tags: ["Research", "Product"], created_by: 1, created_at: "2026-09-14", updated_at: "2026-09-23", subtasks: [{ id: 8, title: "Choose five comparable products", is_completed: true, position: 1 }, { id: 9, title: "Capture common workflow patterns", is_completed: true, position: 2 }, { id: 10, title: "Share a concise recommendation", is_completed: false, position: 3 }, { id: 11, title: "Review findings with product", is_completed: false, position: 4 }] },
  { id: 4, team_id: 1, title: "Prepare design system inventory", description: "Document the existing shared components and identify the highest-value gaps to close.", status: "IN_PROGRESS", due_date: "2026-10-05", priority: "LOW", assignees: [4], tags: ["Design", "System"], created_by: 4, created_at: "2026-09-16", updated_at: "2026-09-20", subtasks: [{ id: 12, title: "Audit reusable components", is_completed: true, position: 1 }, { id: 13, title: "Record gaps and inconsistencies", is_completed: false, position: 2 }] },
  { id: 5, team_id: 1, title: "Release notes for September", description: "Turn this month’s completed work into clear release notes for the wider team.", status: "DONE", due_date: "2026-09-25", priority: "MEDIUM", assignees: [2, 3], tags: ["Content", "Launch"], created_by: 3, created_at: "2026-09-10", updated_at: "2026-09-24", subtasks: [{ id: 14, title: "Collect shipped work", is_completed: true, position: 1 }, { id: 15, title: "Draft the release note", is_completed: true, position: 2 }, { id: 16, title: "Publish to the team", is_completed: true, position: 3 }] },
]

const priorityStyle: Record<Priority, string> = { HIGH: "bg-rose-500/12 text-rose-600 dark:text-rose-300", MEDIUM: "bg-amber-500/12 text-amber-700 dark:text-amber-300", LOW: "bg-sky-500/12 text-sky-700 dark:text-sky-300" }
const priorityOptionStyle: Record<Priority, string> = {
  LOW: "bg-blue-50 text-blue-600 ring-blue-300 dark:bg-blue-400/15 dark:text-blue-200 dark:ring-blue-300/40",
  MEDIUM: "bg-amber-50 text-amber-600 ring-amber-300 dark:bg-amber-300/15 dark:text-amber-200 dark:ring-amber-300/40",
  HIGH: "bg-rose-50 text-rose-600 ring-rose-300 dark:bg-rose-300/15 dark:text-rose-200 dark:ring-rose-300/40",
}
const initials = (name: string) => { const words = name.trim().split(/\s+/).filter(Boolean); return words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase() : (words[0] || "U").slice(0, 2).toUpperCase() }
const formatDueDate = (value: string) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`))
const progressFor = (task: Task) => { const complete = task.subtasks.filter((subtask) => subtask.is_completed).length; return { complete, total: task.subtasks.length, percent: task.subtasks.length ? Math.round((complete / task.subtasks.length) * 100) : 0 } }

const tagStyles = [
  { light: "bg-blue-100 text-blue-700", dark: "bg-blue-200/20 text-blue-200" },
  { light: "bg-emerald-100 text-emerald-700", dark: "bg-emerald-200/20 text-emerald-200" },
  { light: "bg-orange-100 text-orange-700", dark: "bg-orange-200/20 text-orange-200" },
  { light: "bg-amber-100 text-amber-700", dark: "bg-yellow-200/20 text-yellow-100" },
  { light: "bg-rose-100 text-rose-700", dark: "bg-rose-200/20 text-rose-200" },
  { light: "bg-pink-100 text-pink-700", dark: "bg-pink-200/20 text-pink-200" },
  { light: "bg-violet-100 text-violet-700", dark: "bg-violet-200/20 text-violet-200" },
  { light: "bg-teal-100 text-teal-700", dark: "bg-teal-200/20 text-teal-200" },
]

function tagStyleFor(taskId: number, tag: string, isDark: boolean) {
  const index = Array.from(`${taskId}-${tag}`).reduce((total, character) => total + character.charCodeAt(0), 0) % tagStyles.length
  return isDark ? tagStyles[index].dark : tagStyles[index].light
}

function AvatarStack({ assigneeIds, members, isDark }: { assigneeIds: number[]; members: TeamMember[]; isDark: boolean }) {
  const assignees = assigneeIds.map((id) => members.find((member) => member.user_id === id) || { user_id: id, name: `Member ${id}` })
  const visible = assignees.slice(0, 3)
  const remaining = assignees.length - visible.length

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((person, index) => (
        <span
          key={person.user_id}
          title={person.name}
          className={cn(
            "flex size-7 items-center justify-center overflow-hidden rounded-full border-2 text-[9px] font-bold shadow-sm",
            isDark ? "border-[#191919] bg-zinc-100 text-black" : "border-black bg-white text-black",
            index === 1 && isDark && "bg-sky-200",
            index === 2 && isDark && "bg-amber-200"
          )}
        >
          {person.avatar_url ? <img src={person.avatar_url} alt={person.name} className="size-full object-cover" /> : initials(person.name)}
        </span>
      ))}
      {remaining > 0 && (
        <span className={cn("ml-1 flex size-7 items-center justify-center rounded-full border-2 text-[9px] font-bold", isDark ? "border-[#191919] bg-zinc-700 text-white" : "border-black bg-white text-black")}>+{remaining}</span>
      )}
    </div>
  )
}

function TaskCard({ task, members, isDark, onOpen, onDragStart }: { task: Task; members: TeamMember[]; isDark: boolean; onOpen: () => void; onDragStart: () => void }) {
  const progress = progressFor(task)

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className={cn(
        "group cursor-pointer rounded-xl border p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md",
        isDark ? "border-zinc-800 bg-[#191919] hover:border-zinc-600" : "border-slate-200 bg-white hover:border-slate-300"
      )}
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {task.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", tagStyleFor(task.id, tag, isDark))}
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 line-clamp-2 text-base font-bold leading-5">{task.title}</h3>
        <span className="flex shrink-0 items-center text-zinc-400"><GripVertical className="size-4 opacity-0 transition-opacity group-hover:opacity-100" /><MoreHorizontal className="size-4" /></span>
      </div>
      <p className={cn("mt-2 line-clamp-2 text-xs leading-5", isDark ? "text-zinc-400" : "text-slate-500")}>{task.description}</p>
      <div className="mt-5">
        <div className={cn("mb-2 flex items-center justify-between text-sm", isDark ? "text-zinc-400" : "text-slate-500")}>
          <span className="flex items-center gap-2"><ListChecks className="size-4" />Progress</span>
          <span className={cn("font-medium", isDark ? "text-zinc-300" : "text-slate-700")}>{progress.complete}/{progress.total}</span>
        </div>
        <Progress value={progress.percent} className={cn("h-1.5 rounded-full", isDark ? "bg-zinc-800 [&_[data-slot=progress-indicator]]:bg-white" : "bg-slate-100 [&_[data-slot=progress-indicator]]:bg-black")} />
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className={cn("text-sm", isDark ? "text-zinc-400" : "text-slate-500")}>Assigned for</span>
        <AvatarStack assigneeIds={task.assignees} members={members} isDark={isDark} />
      </div>
      <div className={cn("mt-4 flex items-center gap-2 border-t pt-3 text-xs", isDark ? "border-zinc-800 text-zinc-400" : "border-slate-100 text-slate-500")}>
        <CalendarDays className="size-4" />
        <span>{formatDueDate(task.due_date)}</span>
      </div>
    </article>
  )
}
export function TasksTab({ isDark, members = [] }: { isDark: boolean; members?: TeamMember[] }) {
  const fallbackMembers: TeamMember[] = [{ user_id: 1, name: "Pratham" }, { user_id: 2, name: "Aarav Kapoor" }, { user_id: 3, name: "Maya Shah" }, { user_id: 4, name: "Isha Patel" }, { user_id: 5, name: "Rohan Mehta" }]
  const people = members.length ? members : fallbackMembers
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [priorityFilter, setPriorityFilter] = useState<Priority | "ALL">("ALL")
  const [sortBy, setSortBy] = useState<"DUE_DATE" | "PRIORITY">("DUE_DATE")
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftDescription, setDraftDescription] = useState("")
  const [draftPriority, setDraftPriority] = useState<Priority>("MEDIUM")
  const [draftDueDate, setDraftDueDate] = useState("")
  const [draftAssignees, setDraftAssignees] = useState<number[]>([])
  const [draftTags, setDraftTags] = useState<string[]>([])
  const [draftTag, setDraftTag] = useState("")
  const [draftSubtasks, setDraftSubtasks] = useState<string[]>([])
  const [draftSubtask, setDraftSubtask] = useState("")
  const [memberQuery, setMemberQuery] = useState("")
  const [createAttempted, setCreateAttempted] = useState(false)
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null
  const filteredTasks = useMemo(() => tasks.filter((task) => priorityFilter === "ALL" || task.priority === priorityFilter).sort((a, b) => sortBy === "DUE_DATE" ? a.due_date.localeCompare(b.due_date) : ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.priority] - { HIGH: 0, MEDIUM: 1, LOW: 2 }[b.priority])), [tasks, priorityFilter, sortBy])
  const updateTask = (taskId: number, update: Partial<Task>) => setTasks((current) => current.map((task) => task.id === taskId ? { ...task, ...update, updated_at: new Date().toISOString() } : task))
  const moveTask = (taskId: number, status: TaskStatus) => { const task = tasks.find((item) => item.id === taskId); if (!task || (status === "DONE" && task.subtasks.some((subtask) => !subtask.is_completed))) return; updateTask(taskId, { status }) }
  const today = new Date().toISOString().slice(0, 10)
  const createTask = () => {
    setCreateAttempted(true)
    if (!newTaskStatus || !draftTitle.trim() || !draftDueDate || draftDueDate < today || draftSubtasks.length === 0) return
    const task: Task = { id: Date.now(), team_id: 1, title: draftTitle.trim(), description: draftDescription.trim(), status: newTaskStatus, due_date: draftDueDate, priority: draftPriority, assignees: draftAssignees, tags: draftTags, created_by: people[0]?.user_id || 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), subtasks: draftSubtasks.map((title, index) => ({ id: Date.now() + index, title, is_completed: false, position: index + 1 })) }
    if (editingTaskId) {
      const existing = tasks.find((item) => item.id === editingTaskId)
      if (existing) updateTask(editingTaskId, { ...task, id: editingTaskId, created_at: existing.created_at, subtasks: draftSubtasks.map((title, index) => ({ id: existing.subtasks[index]?.id || Date.now() + index, title, is_completed: existing.subtasks[index]?.is_completed || false, position: index + 1 })) })
    } else setTasks((current) => [...current, task])
    const taskId = editingTaskId || task.id
    setDraftTitle(""); setDraftDescription(""); setDraftPriority("MEDIUM"); setDraftDueDate(""); setDraftAssignees([]); setDraftTags([]); setDraftTag(""); setDraftSubtasks([]); setDraftSubtask(""); setMemberQuery(""); setCreateAttempted(false); setEditingTaskId(null); setNewTaskStatus(null); setSelectedTaskId(taskId)
  }
  const openEditTask = (task: Task) => { setEditingTaskId(task.id); setDraftTitle(task.title); setDraftDescription(task.description); setDraftPriority(task.priority); setDraftDueDate(task.due_date); setDraftAssignees(task.assignees); setDraftTags(task.tags); setDraftSubtasks(task.subtasks.map((subtask) => subtask.title)); setNewTaskStatus(task.status); setSelectedTaskId(null) }
  const toggleSubtask = (task: Task, subtaskId: number, checked: boolean) => updateTask(task.id, { subtasks: task.subtasks.map((subtask) => subtask.id === subtaskId ? { ...subtask, is_completed: checked } : subtask) })

  return <section className="min-w-0 space-y-5"><div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 dark:border-zinc-800"><div className="flex items-center gap-1 sm:gap-2"><Button variant="ghost" size="sm" className={cn("h-9 rounded-none border-b-2 px-2 font-semibold", isDark ? "border-white text-white hover:bg-transparent" : "border-black text-black hover:bg-transparent")}><LayoutGrid className="size-4" />Board view</Button><Button variant="ghost" size="sm" className={cn("h-9 rounded-none px-2", isDark ? "text-zinc-500 hover:bg-transparent hover:text-zinc-200" : "text-slate-500 hover:bg-transparent hover:text-slate-900")}><List className="size-4" />List view</Button></div><div className="flex flex-wrap items-center gap-2"><div className="relative"><Button variant="outline" size="sm" onClick={() => setFilterOpen((open) => !open)} className={cn("rounded-md", filterOpen && (isDark ? "border-white bg-white text-black" : "border-black bg-black text-white"))}><SlidersHorizontal className="size-3.5" />Filter <ChevronDown className="size-3.5" /></Button>{filterOpen && <div className={cn("absolute right-0 z-20 mt-2 w-64 border p-3 shadow-lg", isDark ? "border-zinc-700 bg-[#191919]" : "border-slate-200 bg-white")}><p className="text-xs font-semibold">Show priority</p><Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as Priority | "ALL")}><SelectTrigger className="mt-2 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">All priorities</SelectItem><SelectItem value="HIGH">High priority</SelectItem><SelectItem value="MEDIUM">Medium priority</SelectItem><SelectItem value="LOW">Low priority</SelectItem></SelectContent></Select><p className="mt-4 text-xs font-semibold">Sort tasks</p><Select value={sortBy} onValueChange={(value) => setSortBy(value as "DUE_DATE" | "PRIORITY")}><SelectTrigger className="mt-2 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DUE_DATE">Due date, nearest first</SelectItem><SelectItem value="PRIORITY">Priority, highest first</SelectItem></SelectContent></Select></div>}</div><Button size="sm" onClick={() => setNewTaskStatus("TODO")} className={cn("rounded-md", isDark ? "bg-white text-black hover:bg-zinc-200" : "bg-black text-white hover:bg-zinc-800")}><Plus className="size-4" />New task</Button></div></div>
    <div className="grid items-start gap-4 xl:grid-cols-3">{columns.map((column) => { const columnTasks = filteredTasks.filter((task) => task.status === column.status); return <div key={column.status} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedTaskId) moveTask(draggedTaskId, column.status); setDraggedTaskId(null) }} className="min-h-[460px] p-0"><div className="mb-3 flex items-center justify-between py-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><span className={cn("size-2 rounded-full", column.dotClass)} />{column.title}<span className={cn("flex size-5 items-center justify-center rounded-full text-[10px] font-bold", column.status === "TODO" ? (isDark ? "bg-white text-black" : "bg-slate-900 text-white") : column.status === "IN_PROGRESS" ? (isDark ? "bg-amber-300 text-black" : "bg-amber-400 text-white") : (isDark ? "bg-emerald-300 text-black" : "bg-emerald-500 text-white"))}>{columnTasks.length}</span></h2><Button variant="ghost" size="icon" onClick={() => setNewTaskStatus(column.status)} className="size-7"><Plus className="size-4" /></Button></div><div className="space-y-3">{columnTasks.map((task) => <TaskCard key={task.id} task={task} members={people} isDark={isDark} onOpen={() => setSelectedTaskId(task.id)} onDragStart={() => setDraggedTaskId(task.id)} />)}<button type="button" onClick={() => setNewTaskStatus(column.status)} className={cn("flex w-full items-center justify-center gap-1.5 border border-dashed py-2.5 text-xs font-medium transition-colors", isDark ? "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:bg-zinc-900" : "border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-white")}><Plus className="size-3.5" />Add task</button></div></div> })}</div>
    <Sheet open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
      <SheetContent side="right" className={cn("w-full gap-0 overflow-y-auto p-0 sm:max-w-[600px]", isDark ? "border-zinc-800 bg-[#151515] text-white" : "border-slate-200 bg-white")}>
        {selectedTask && (() => {
          const progress = progressFor(selectedTask)
          return <>
            <SheetHeader className={cn("border-b px-6 py-4 text-left", isDark ? "border-zinc-800" : "border-slate-200")}>
              <div className="mr-10 flex items-center justify-between"><Button variant="ghost" size="icon" onClick={() => setSelectedTaskId(null)} className="size-8" aria-label="Back to tasks"><ArrowLeft className="size-5" /></Button><Button variant="outline" size="sm" onClick={() => openEditTask(selectedTask)} className={cn("rounded-md", isDark ? "border-zinc-700 hover:bg-zinc-800" : "border-slate-200")}><Pencil className="size-3.5" />Edit</Button></div>
            </SheetHeader>
            <div className="space-y-7 px-6 py-6">
              <div><h2 className="text-2xl font-semibold tracking-tight">{selectedTask.title}</h2></div>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-[10rem_1fr] items-center gap-3"><span className="flex items-center gap-2 text-slate-600 dark:text-zinc-300"><Clock3 className="size-4" />Created time</span><span>{formatDueDate(selectedTask.created_at.slice(0, 10))}</span></div>
                <div className="grid grid-cols-[10rem_1fr] items-center gap-3"><span className="flex items-center gap-2 text-slate-600 dark:text-zinc-300"><ListChecks className="size-4" />Status</span><span className={cn("w-fit rounded-full px-2 py-0.5 text-xs font-medium", selectedTask.status === "DONE" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : selectedTask.status === "IN_PROGRESS" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-slate-500/15 text-slate-600 dark:text-zinc-300")}>{columns.find((column) => column.status === selectedTask.status)?.title}</span></div>
                <div className="grid grid-cols-[10rem_1fr] items-center gap-3"><span className="flex items-center gap-2 text-slate-600 dark:text-zinc-300"><Flag className="size-4" />Priority</span><span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", priorityOptionStyle[selectedTask.priority])}><Flag className="size-3 fill-current" />{selectedTask.priority[0] + selectedTask.priority.slice(1).toLowerCase()}</span></div>
                <div className="grid grid-cols-[10rem_1fr] items-center gap-3"><span className="flex items-center gap-2 text-slate-600 dark:text-zinc-300"><CalendarDays className="size-4" />Due date</span><span>{formatDueDate(selectedTask.due_date)}</span></div>
                {selectedTask.tags.length > 0 && <div className="grid grid-cols-[10rem_1fr] items-start gap-3"><span className="flex items-center gap-2 pt-1 text-slate-600 dark:text-zinc-300"><Tag className="size-4" />Tags</span><div className="flex flex-wrap gap-1.5">{selectedTask.tags.map((tag) => <span key={tag} className={cn("rounded-full px-2 py-1 text-xs font-medium", tagStyleFor(selectedTask.id, tag, isDark))}>{tag}</span>)}</div></div>}
                <div className="grid grid-cols-[10rem_1fr] items-center gap-3"><span className="flex items-center gap-2 text-slate-600 dark:text-zinc-300"><Users className="size-4" />Assigned</span><AvatarStack assigneeIds={selectedTask.assignees} members={people} isDark={isDark} /></div>
              </div>
              {selectedTask.description.trim() && <section className={cn("rounded-lg p-4", isDark ? "bg-zinc-900/70" : "bg-slate-50")}><h3 className="text-sm font-semibold">Project description</h3><p className={cn("mt-2 text-sm leading-6", isDark ? "text-zinc-400" : "text-slate-600")}>{selectedTask.description}</p></section>}
              <section>
                <div className="border-b pb-2"><span className="border-b-2 border-blue-500 pb-2 text-sm font-medium">Tasks</span></div>
                <div className="mt-5 flex items-center justify-between"><h3 className="text-base font-semibold">Subtasks</h3><div className="flex items-center gap-2 text-sm text-zinc-500"><span className="relative flex size-6 items-center justify-center rounded-full" style={{ background: `conic-gradient(${isDark ? "#ffffff" : "#111111"} ${progress.percent * 3.6}deg, ${isDark ? "#3f3f46" : "#e2e8f0"} 0deg)` }}><span className={cn("size-4 rounded-full", isDark ? "bg-[#151515]" : "bg-white")} /></span>{progress.complete}/{progress.total}</div></div>
                <div className="mt-4 space-y-2">{selectedTask.subtasks.map((subtask) => <label key={subtask.id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm", isDark ? "border-zinc-800 bg-zinc-900/40" : "border-slate-200 bg-slate-50")}><Checkbox className="size-5 rounded-full" checked={subtask.is_completed} onCheckedChange={(checked) => toggleSubtask(selectedTask, subtask.id, checked === true)} /><span className={cn(subtask.is_completed && "text-zinc-500 line-through")}>{subtask.title}</span></label>)}</div>
              </section>
              <div className="flex justify-end border-t pt-5"><Button type="button" variant="outline" onClick={() => setDeleteConfirm((current) => !current)} className={cn("border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-400/40 dark:text-rose-300 dark:hover:bg-rose-400/10", deleteConfirm && "bg-rose-600 text-white hover:bg-rose-500 dark:bg-rose-600 dark:text-white")}><Trash2 className="size-4" />{deleteConfirm ? "Confirm delete" : "Delete task"}</Button></div>
            </div>
          </>
        })()}
      </SheetContent>
    </Sheet>    <Dialog open={!!newTaskStatus} onOpenChange={(open) => { if (!open) { setCreateAttempted(false); setEditingTaskId(null); setNewTaskStatus(null) } }}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto rounded-xl border p-0 sm:max-w-2xl", isDark ? "border-zinc-800 bg-[#151515] text-white" : "border-slate-200 bg-white")}>
        <DialogHeader className={cn("border-b px-6 py-5 text-left", isDark ? "border-zinc-800" : "border-slate-200")}>
          <DialogTitle className="text-xl">{editingTaskId ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription className={isDark ? "text-zinc-400" : "text-slate-500"}>{editingTaskId ? "Update the task details and subtasks." : `Add a request to ${columns.find((column) => column.status === newTaskStatus)?.title.toLowerCase()}.`}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 px-6 py-5">
          <div>
            <div className="mb-2 flex justify-between text-sm font-medium"><label htmlFor="task-title">Title</label><span className="text-xs text-zinc-500">{draftTitle.length}/50</span></div>
            <Input id="task-title" autoFocus maxLength={50} value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="What needs to happen?" className={isDark ? "border-zinc-700 bg-zinc-900" : ""} />
            {createAttempted && !draftTitle.trim() && <p className="mt-1 text-xs text-rose-500">A task title is required.</p>}
          </div>
          <div>
            <div className="mb-2 flex justify-between text-sm font-medium"><label htmlFor="task-description">Description</label><span className="text-xs text-zinc-500">{draftDescription.length}/150</span></div>
            <textarea id="task-description" maxLength={150} value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} placeholder="Add useful context for the team" className={cn("min-h-24 w-full resize-none rounded-md border p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500", isDark ? "border-zinc-700 bg-zinc-900" : "border-slate-200")} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div><label className="mb-2 block text-sm font-medium">Due date</label><Input type="date" min={today} value={draftDueDate} onChange={(event) => setDraftDueDate(event.target.value)} className={isDark ? "border-zinc-700 bg-zinc-900" : ""} />{createAttempted && (!draftDueDate || draftDueDate < today) && <p className="mt-1 text-xs text-rose-500">Choose today or a future date.</p>}</div>
            <div><label className="mb-2 block text-sm font-medium">Select priority</label><div className="flex flex-wrap gap-2">{(["LOW", "MEDIUM", "HIGH"] as Priority[]).map((priority) => <button key={priority} type="button" onClick={() => setDraftPriority(priority)} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition", draftPriority === priority ? priorityOptionStyle[priority] + " ring-1" : (isDark ? "bg-zinc-800 text-zinc-500 hover:bg-zinc-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"))}><Flag className="size-3 fill-current" />{priority[0] + priority.slice(1).toLowerCase()}</button>)}</div></div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Assigned</label>
            <Popover onOpenChange={(open) => { if (!open) setMemberQuery("") }}>
              <PopoverTrigger asChild>
                <button type="button" className={cn("flex min-h-10 w-full items-center justify-between rounded-md border px-3 text-left text-sm transition-colors", isDark ? "border-zinc-700 bg-zinc-900 hover:border-zinc-500" : "border-slate-200 bg-white hover:border-slate-400")}>
                  {draftAssignees.length ? <AvatarStack assigneeIds={draftAssignees} members={people} isDark={isDark} /> : <span className="text-zinc-500">Select team members</span>}
                  <Users className="size-4 text-zinc-400" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className={cn("w-[min(24rem,calc(100vw-3rem))] p-3", isDark ? "border-zinc-700 bg-[#1a1a1a] text-white" : "border-slate-200 bg-white")}>
                <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" /><Input autoFocus value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search team members" className={cn("pl-9", isDark ? "border-zinc-700 bg-zinc-900" : "")} /></div>
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                  {people.filter((person) => person.name.toLowerCase().includes(memberQuery.toLowerCase())).map((person) => { const selected = draftAssignees.includes(person.user_id); return <button key={person.user_id} type="button" onClick={() => setDraftAssignees(selected ? draftAssignees.filter((id) => id !== person.user_id) : [...draftAssignees, person.user_id])} className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm", selected ? (isDark ? "bg-white text-black" : "bg-slate-900 text-white") : (isDark ? "hover:bg-zinc-800" : "hover:bg-slate-100"))}><span className={cn("flex size-7 items-center justify-center overflow-hidden rounded-full text-[9px] font-bold", selected ? "bg-black text-white" : "bg-slate-200 text-slate-700")}>{person.avatar_url ? <img src={person.avatar_url} alt="" className="size-full object-cover" /> : initials(person.name)}</span><span className="min-w-0 flex-1 truncate">{person.name}</span>{selected && <CheckCircle2 className="size-4" />}</button> })}
                  {people.filter((person) => person.name.toLowerCase().includes(memberQuery.toLowerCase())).length === 0 && <p className="px-2 py-6 text-center text-sm text-zinc-500">No team members match that search.</p>}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Tags <span className="font-normal text-zinc-500">({draftTags.length}/3)</span></label>
            <div className="flex gap-2"><Input value={draftTag} maxLength={24} onChange={(event) => setDraftTag(event.target.value)} placeholder="Add a tag" onKeyDown={(event) => { if (event.key === "Enter" && draftTag.trim() && draftTags.length < 3 && !draftTags.includes(draftTag.trim())) { event.preventDefault(); setDraftTags([...draftTags, draftTag.trim()]); setDraftTag("") } }} className={isDark ? "border-zinc-700 bg-zinc-900" : ""} /><Button type="button" variant="outline" disabled={!draftTag.trim() || draftTags.length >= 3 || draftTags.includes(draftTag.trim())} onClick={() => { setDraftTags([...draftTags, draftTag.trim()]); setDraftTag("") }}>Add</Button></div>
            <div className="mt-2 flex flex-wrap gap-2">{draftTags.map((tag, index) => <button key={tag} type="button" onClick={() => setDraftTags(draftTags.filter((item) => item !== tag))} className={cn("rounded-full px-2 py-1 text-xs font-semibold", tagStyleFor(index + 1, tag, isDark))}>{tag} x</button>)}</div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Subtasks</label>
            <div className="flex gap-2"><Input value={draftSubtask} maxLength={80} onChange={(event) => setDraftSubtask(event.target.value)} placeholder="Add a subtask" onKeyDown={(event) => { if (event.key === "Enter" && draftSubtask.trim()) { event.preventDefault(); setDraftSubtasks([...draftSubtasks, draftSubtask.trim()]); setDraftSubtask("") } }} className={isDark ? "border-zinc-700 bg-zinc-900" : ""} /><Button type="button" variant="outline" disabled={!draftSubtask.trim()} onClick={() => { setDraftSubtasks([...draftSubtasks, draftSubtask.trim()]); setDraftSubtask("") }}>Add</Button></div>
            <div className="mt-2 space-y-1">{draftSubtasks.map((subtask, index) => <button key={`${subtask}-${index}`} type="button" onClick={() => setDraftSubtasks(draftSubtasks.filter((_, itemIndex) => itemIndex !== index))} className={cn("block w-full rounded px-3 py-2 text-left text-xs", isDark ? "bg-zinc-800 text-zinc-300" : "bg-slate-100 text-slate-600")}>{index + 1}. {subtask} x</button>)}</div>
            {createAttempted && draftSubtasks.length === 0 && <p className="mt-2 text-xs text-rose-500">Add at least one subtask before creating a task.</p>}
          </div>
        </div>
        <div className={cn("flex justify-end gap-2 border-t px-6 py-4", isDark ? "border-zinc-800" : "border-slate-200")}><Button variant="outline" onClick={() => { setCreateAttempted(false); setEditingTaskId(null); setNewTaskStatus(null) }}>Cancel</Button><Button onClick={createTask} className="bg-blue-600 text-white hover:bg-blue-500">{editingTaskId ? <Pencil className="size-4" /> : <Plus className="size-4" />}{editingTaskId ? "Save changes" : "Create task"}</Button></div>
      </DialogContent>
    </Dialog>  </section>
}
