"use client"

import { useEffect, useState, type MouseEvent } from "react"
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Flag, GripVertical, ListChecks, Pencil, Plus, Search, Tag, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE"
export type Priority = "LOW" | "MEDIUM" | "HIGH"
export type TeamMember = { user_id: number; name: string; avatar_url?: string; email?: string; role?: "admin" | "member" }
export type Subtask = { id: number; title: string; is_completed: boolean; position: number }
export type Task = {
  id: number
  team_id: number
  title: string
  description: string
  status: TaskStatus
  due_date: string
  priority: Priority
  assignees: number[]
  tags: string[]
  created_by: number
  created_at: string
  updated_at: string
  subtasks: Subtask[]
}
type ApiTask = Omit<Task, "assignees"> & { assignee_ids?: number[] }

export const STATUS_COLUMNS: Array<{ status: TaskStatus; title: string }> = [
  { status: "TODO", title: "New request" },
  { status: "IN_PROGRESS", title: "In progress" },
  { status: "DONE", title: "Completed" },
]

export const priorityOptionStyle: Record<Priority, string> = {
  LOW: "bg-blue-50 text-blue-600 ring-blue-300 dark:bg-blue-400/15 dark:text-blue-200 dark:ring-blue-300/40",
  MEDIUM: "bg-amber-50 text-amber-600 ring-amber-300 dark:bg-amber-300/15 dark:text-amber-200 dark:ring-amber-300/40",
  HIGH: "bg-rose-50 text-rose-600 ring-rose-300 dark:bg-rose-300/15 dark:text-rose-200 dark:ring-rose-300/40",
}

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

export const fromApiTask = (task: ApiTask): Task => ({
  ...task,
  assignees: Array.isArray(task.assignee_ids) ? task.assignee_ids : [],
})
export const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase() : (words[0] || "U").slice(0, 2).toUpperCase()
}
export const formatDueDate = (value: string) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`))
export const progressFor = (task: Task) => {
  const complete = task.subtasks.filter((subtask) => subtask.is_completed).length
  return { complete, total: task.subtasks.length, percent: task.subtasks.length ? Math.round((complete / task.subtasks.length) * 100) : 0 }
}
export function tagStyleFor(taskId: number, tag: string, isDark: boolean) {
  const index = Array.from(`${taskId}-${tag}`).reduce((total, character) => total + character.charCodeAt(0), 0) % tagStyles.length
  return isDark ? tagStyles[index].dark : tagStyles[index].light
}

export function AvatarStack({
  assigneeIds,
  members,
  isDark,
  interactive = false,
  onMemberClick,
  onOverflowClick,
}: {
  assigneeIds: number[]
  members: TeamMember[]
  isDark: boolean
  interactive?: boolean
  onMemberClick?: (member: TeamMember) => void
  onOverflowClick?: () => void
}) {
  const assignees = assigneeIds.map((id) => members.find((member) => member.user_id === id) || { user_id: id, name: `Member ${id}` })
  const visible = assignees.slice(0, 3)
  const remaining = assignees.length - visible.length
  const AvatarElement = interactive ? "button" : "span"

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((person, index) => (
        <AvatarElement
          key={person.user_id}
          title={person.name}
          {...(interactive ? { type: "button" as const, onClick: (event: MouseEvent) => { event.stopPropagation(); onMemberClick?.(person) } } : {})}
          className={cn(
            "flex size-7 items-center justify-center overflow-hidden rounded-full border-2 text-[9px] font-bold shadow-sm",
            interactive && "cursor-pointer transition-transform hover:z-10 hover:scale-110 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            isDark ? "border-[#191919] bg-zinc-100 text-black" : "border-black bg-white text-black",
            index === 1 && isDark && "bg-sky-200",
            index === 2 && isDark && "bg-amber-200"
          )}
        >
          {person.avatar_url ? <img src={person.avatar_url} alt={person.name} className="size-full object-cover" /> : initials(person.name)}
        </AvatarElement>
      ))}
      {remaining > 0 && (
        <AvatarElement
          title={`Show ${remaining} more assignee${remaining === 1 ? "" : "s"}`}
          {...(interactive ? { type: "button" as const, onClick: (event: MouseEvent) => { event.stopPropagation(); onOverflowClick?.() } } : {})}
          className={cn(
            "ml-1 flex size-7 items-center justify-center rounded-full border-2 text-[9px] font-bold",
            interactive && "cursor-pointer transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            isDark ? "border-[#191919] bg-zinc-700 text-white" : "border-black bg-white text-black"
          )}
        >
          +{remaining}
        </AvatarElement>
      )}
    </div>
  )
}

export function TeamTaskOverlays({
  isDark,
  members,
  canManage,
  teamId,
  selectedTask,
  onClose,
  onTaskSaved,
  onTaskDeleted,
  onOpenMemberDetails,
  editorOpen,
  editorStatus,
  editingTask,
  onEditorOpenChange,
}: {
  isDark: boolean
  members: TeamMember[]
  canManage: boolean
  teamId: number
  selectedTask: Task | null
  onClose: () => void
  onTaskSaved: (task: Task) => void
  onTaskDeleted: (taskId: number) => void
  onOpenMemberDetails: (member: TeamMember) => void
  editorOpen: boolean
  editorStatus: TaskStatus | null
  editingTask: Task | null
  onEditorOpenChange: (open: boolean, next?: { status?: TaskStatus; task?: Task | null }) => void
}) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const people = members
  const [taskError, setTaskError] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [assigneeListTask, setAssigneeListTask] = useState<Task | null>(null)
  const [draftTitle, setDraftTitle] = useState("")
  const [draftDescription, setDraftDescription] = useState("")
  const [draftPriority, setDraftPriority] = useState<Priority>("MEDIUM")
  const [draftDueDate, setDraftDueDate] = useState("")
  const [draftAssignees, setDraftAssignees] = useState<number[]>([])
  const [draftTags, setDraftTags] = useState<string[]>([])
  const [draftTag, setDraftTag] = useState("")
  const [draftSubtasks, setDraftSubtasks] = useState<string[]>([])
  const [draftSubtask, setDraftSubtask] = useState("")
  const [draggedDraftSubtaskIndex, setDraggedDraftSubtaskIndex] = useState<number | null>(null)
  const [memberQuery, setMemberQuery] = useState("")
  const [createAttempted, setCreateAttempted] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  const getTaskContext = () => {
    const token = localStorage.getItem("access_token")
    const projectId = localStorage.getItem("selected_project_id")
    if (!token || !projectId || !teamId) throw new Error("Project context is missing")
    return { token, projectId }
  }
  const taskUrl = (projectId: string, suffix = "") => `${apiUrl}/projects/${projectId}/teams/${teamId}/tasks${suffix}`

  const hydrateEditor = (task?: Task | null) => {
    setCreateAttempted(false)
    setDraftTag("")
    setDraftSubtask("")
    setMemberQuery("")
    if (task) {
      setDraftTitle(task.title)
      setDraftDescription(task.description)
      setDraftPriority(task.priority)
      setDraftDueDate(task.due_date)
      setDraftAssignees(task.assignees)
      setDraftTags(task.tags)
      setDraftSubtasks(task.subtasks.map((subtask) => subtask.title))
    } else {
      setDraftTitle("")
      setDraftDescription("")
      setDraftPriority("MEDIUM")
      setDraftDueDate("")
      setDraftAssignees([])
      setDraftTags([])
      setDraftSubtasks([])
    }
  }

  useEffect(() => {
    if (editorOpen) hydrateEditor(editingTask)
  }, [editorOpen, editingTask?.id])

  const appendDraftSubtask = () => {
    const title = draftSubtask.trim()
    if (!title) return
    setDraftSubtasks((current) => [...current, title])
    setDraftSubtask("")
  }
  const updateDraftSubtask = (index: number, title: string) => setDraftSubtasks((current) => current.map((item, itemIndex) => (itemIndex === index ? title : item)))
  const insertDraftSubtask = (index: number) => setDraftSubtasks((current) => [...current.slice(0, index), "", ...current.slice(index)])
  const reorderDraftSubtasks = (fromIndex: number, toIndex: number) =>
    setDraftSubtasks((current) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length) return current
      const next = [...current]
      const [movedSubtask] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, movedSubtask)
      return next
    })
  const removeDraftSubtask = (index: number) => setDraftSubtasks((current) => current.filter((_, itemIndex) => itemIndex !== index))

  const saveTask = async () => {
    setCreateAttempted(true)
    const normalizedSubtasks = draftSubtasks.map((title) => title.trim())
    const status = editingTask?.status || editorStatus
    if (!status || !draftTitle.trim() || !draftDueDate || (!editingTask && draftDueDate < today) || normalizedSubtasks.length === 0 || normalizedSubtasks.some((title) => !title)) return
    try {
      const { token, projectId } = getTaskContext()
      const payload = {
        title: draftTitle.trim(),
        description: draftDescription.trim(),
        status,
        due_date: draftDueDate,
        priority: draftPriority,
        assignee_ids: draftAssignees,
        tags: draftTags,
        subtasks: normalizedSubtasks.map((title, index) => ({ title, position: index + 1 })),
      }
      const response = await fetch(taskUrl(projectId, editingTask ? `/${editingTask.id}` : ""), {
        method: editingTask ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.detail || "Could not save task")
      const savedTask = fromApiTask(data.task)
      onTaskSaved(savedTask)
      onEditorOpenChange(false)
      setTaskError("")
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Could not save task")
    }
  }

  const deleteTask = async (task: Task) => {
    try {
      const { token, projectId } = getTaskContext()
      const response = await fetch(taskUrl(projectId, `/${task.id}`), { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.detail || "Could not delete task")
      }
      onTaskDeleted(task.id)
      setDeleteConfirm(false)
      setTaskError("")
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Could not delete task")
    }
  }

  const toggleSubtask = async (task: Task, subtaskId: number, checked: boolean) => {
    try {
      const { token, projectId } = getTaskContext()
      const response = await fetch(taskUrl(projectId, `/${task.id}/subtasks/${subtaskId}`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ is_completed: checked }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.detail || "Could not update subtask")
      onTaskSaved(fromApiTask(data.task))
      setTaskError("")
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Could not update subtask")
    }
  }

  return (
    <>
      {taskError && <p className="pointer-events-none absolute left-4 top-4 z-40 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">{taskError}</p>}
      <Sheet open={!!selectedTask} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" className={cn("w-full gap-0 overflow-y-auto p-0 sm:max-w-[600px]", isDark ? "border-zinc-800 bg-[#151515] text-white" : "border-slate-200 bg-white")}>
          {selectedTask && (() => {
            const progress = progressFor(selectedTask)
            return (
              <>
                <SheetHeader className={cn("border-b px-6 py-4 text-left", isDark ? "border-zinc-800" : "border-slate-200")}>
                  <div className="mr-10 flex items-center justify-between">
                    <Button variant="ghost" size="icon" onClick={onClose} className="size-8" aria-label="Back to tasks">
                      <ArrowLeft className="size-5" />
                    </Button>
                    {canManage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          hydrateEditor(selectedTask)
                          onEditorOpenChange(true, { status: selectedTask.status, task: selectedTask })
                        }}
                        className={cn("rounded-md", isDark ? "border-zinc-700 hover:bg-zinc-800" : "border-slate-200")}
                      >
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                    )}
                  </div>
                </SheetHeader>
                <div className="space-y-7 px-6 py-6">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">{selectedTask.title}</h2>
                  </div>
                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-[10rem_1fr] items-center gap-3">
                      <span className="flex items-center gap-2 text-slate-600 dark:text-zinc-300"><Clock3 className="size-4" />Created time</span>
                      <span>{formatDueDate(selectedTask.created_at.slice(0, 10))}</span>
                    </div>
                    <div className="grid grid-cols-[10rem_1fr] items-center gap-3">
                      <span className="flex items-center gap-2 text-slate-600 dark:text-zinc-300"><ListChecks className="size-4" />Status</span>
                      <span className={cn("w-fit rounded-full px-2 py-0.5 text-xs font-medium", selectedTask.status === "DONE" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : selectedTask.status === "IN_PROGRESS" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-slate-500/15 text-slate-600 dark:text-zinc-300")}>
                        {STATUS_COLUMNS.find((column) => column.status === selectedTask.status)?.title}
                      </span>
                    </div>
                    <div className="grid grid-cols-[10rem_1fr] items-center gap-3">
                      <span className="flex items-center gap-2 text-slate-600 dark:text-zinc-300"><Flag className="size-4" />Priority</span>
                      <span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", priorityOptionStyle[selectedTask.priority])}>
                        <Flag className="size-3 fill-current" />
                        {selectedTask.priority[0] + selectedTask.priority.slice(1).toLowerCase()}
                      </span>
                    </div>
                    <div className="grid grid-cols-[10rem_1fr] items-center gap-3">
                      <span className="flex items-center gap-2 text-slate-600 dark:text-zinc-300"><CalendarDays className="size-4" />Due date</span>
                      <span>{formatDueDate(selectedTask.due_date)}</span>
                    </div>
                    {selectedTask.tags.length > 0 && (
                      <div className="grid grid-cols-[10rem_1fr] items-start gap-3">
                        <span className="flex items-center gap-2 pt-1 text-slate-600 dark:text-zinc-300"><Tag className="size-4" />Tags</span>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedTask.tags.map((tag) => (
                            <span key={tag} className={cn("rounded-full px-2 py-1 text-xs font-medium", tagStyleFor(selectedTask.id, tag, isDark))}>{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-[10rem_1fr] items-center gap-3">
                      <span className="flex items-center gap-2 text-slate-600 dark:text-zinc-300"><Users className="size-4" />Assigned</span>
                      <AvatarStack
                        assigneeIds={selectedTask.assignees}
                        members={people}
                        isDark={isDark}
                        interactive
                        onMemberClick={onOpenMemberDetails}
                        onOverflowClick={() => setAssigneeListTask(selectedTask)}
                      />
                    </div>
                  </div>
                  {selectedTask.description.trim() && (
                    <section className={cn("rounded-lg p-4", isDark ? "bg-zinc-900/70" : "bg-slate-50")}>
                      <h3 className="text-sm font-semibold">Project description</h3>
                      <p className={cn("mt-2 text-sm leading-6", isDark ? "text-zinc-400" : "text-slate-600")}>{selectedTask.description}</p>
                    </section>
                  )}
                  <section>
                    <div className="border-b pb-2"><span className="border-b-2 border-blue-500 pb-2 text-sm font-medium">Tasks</span></div>
                    <div className="mt-5 flex items-center justify-between">
                      <h3 className="text-base font-semibold">Subtasks</h3>
                      <div className="flex items-center gap-2 text-sm text-zinc-500">
                        <span className="relative flex size-6 items-center justify-center rounded-full" style={{ background: `conic-gradient(${isDark ? "#ffffff" : "#111111"} ${progress.percent * 3.6}deg, ${isDark ? "#3f3f46" : "#e2e8f0"} 0deg)` }}>
                          <span className={cn("size-4 rounded-full", isDark ? "bg-[#151515]" : "bg-white")} />
                        </span>
                        {progress.complete}/{progress.total}
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      {selectedTask.subtasks.map((subtask) => (
                        <label key={subtask.id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm", isDark ? "border-zinc-800 bg-zinc-900/40" : "border-slate-200 bg-slate-50")}>
                          <Checkbox className="size-5 rounded-full" checked={subtask.is_completed} onCheckedChange={(checked) => toggleSubtask(selectedTask, subtask.id, checked === true)} />
                          <span className={cn(subtask.is_completed && "text-zinc-500 line-through")}>{subtask.title}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                  {canManage && (
                    <div className="flex justify-end border-t pt-5">
                      <Button type="button" variant="outline" onClick={() => setDeleteConfirm(true)} className="border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-400/40 dark:text-rose-300 dark:hover:bg-rose-400/10">
                        <Trash2 className="size-4" />
                        Delete task
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )
          })()}
        </SheetContent>
      </Sheet>
      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent className={cn(isDark ? "border-zinc-800 bg-[#151515] text-white" : "border-slate-200 bg-white")}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription className={isDark ? "text-zinc-400" : "text-slate-500"}>This removes the task, its assignments, and all of its subtasks. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => selectedTask && deleteTask(selectedTask)} className="bg-rose-600 text-white hover:bg-rose-500">
              <Trash2 className="size-4" />
              Delete task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!assigneeListTask} onOpenChange={(open) => !open && setAssigneeListTask(null)}>
        <DialogContent className={cn("sm:max-w-sm", isDark ? "border-zinc-800 bg-[#151515] text-white" : "border-slate-200 bg-white")}>
          <DialogHeader>
            <DialogTitle>Assigned people</DialogTitle>
            <DialogDescription className={isDark ? "text-zinc-400" : "text-slate-500"}>Select a person to view their information.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {(assigneeListTask?.assignees || []).map((id) => {
              const person = people.find((member) => member.user_id === id) || { user_id: id, name: `Member ${id}` }
              return (
                <button
                  key={person.user_id}
                  type="button"
                  onClick={() => {
                    setAssigneeListTask(null)
                    onOpenMemberDetails(person)
                  }}
                  className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left", isDark ? "hover:bg-zinc-800" : "hover:bg-slate-100")}
                >
                  <span className={cn("flex size-8 items-center justify-center overflow-hidden rounded-full border text-[10px] font-bold", isDark ? "border-white bg-zinc-100 text-black" : "border-black bg-white text-black")}>
                    {person.avatar_url ? <img src={person.avatar_url} alt="" className="size-full object-cover" /> : initials(person.name)}
                  </span>
                  <span className="truncate text-sm font-medium">{person.name}</span>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (open) hydrateEditor(editingTask)
          else {
            setCreateAttempted(false)
            onEditorOpenChange(false)
          }
        }}
      >
        <DialogContent className={cn("max-h-[90vh] overflow-y-auto rounded-xl border p-0 sm:max-w-2xl", isDark ? "border-zinc-800 bg-[#151515] text-white" : "border-slate-200 bg-white")}>
          <DialogHeader className={cn("border-b px-6 py-5 text-left", isDark ? "border-zinc-800" : "border-slate-200")}>
            <DialogTitle className="text-xl">{editingTask ? "Edit task" : "New task"}</DialogTitle>
            <DialogDescription className={isDark ? "text-zinc-400" : "text-slate-500"}>
              {editingTask ? "Update the task details and subtasks." : `Add a request to ${STATUS_COLUMNS.find((column) => column.status === editorStatus)?.title.toLowerCase() || "the board"}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 px-6 py-5">
            <div>
              <div className="mb-2 flex justify-between text-sm font-medium">
                <label htmlFor="timeline-task-title">Title</label>
                <span className="text-xs text-zinc-500">{draftTitle.length}/50</span>
              </div>
              <Input id="timeline-task-title" autoFocus maxLength={50} value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="What needs to happen?" className={isDark ? "border-zinc-700 bg-zinc-900" : ""} />
              {createAttempted && !draftTitle.trim() && <p className="mt-1 text-xs text-rose-500">A task title is required.</p>}
            </div>
            <div>
              <div className="mb-2 flex justify-between text-sm font-medium">
                <label htmlFor="timeline-task-description">Description</label>
                <span className="text-xs text-zinc-500">{draftDescription.length}/150</span>
              </div>
              <textarea id="timeline-task-description" maxLength={150} value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} placeholder="Add useful context for the team" className={cn("min-h-24 w-full resize-none rounded-md border p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500", isDark ? "border-zinc-700 bg-zinc-900" : "border-slate-200")} />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">Due date</label>
                <Input type="date" min={editingTask ? undefined : today} value={draftDueDate} onChange={(event) => setDraftDueDate(event.target.value)} className={isDark ? "border-zinc-700 bg-zinc-900" : ""} />
                {createAttempted && (!draftDueDate || (!editingTask && draftDueDate < today)) && <p className="mt-1 text-xs text-rose-500">Choose today or a future date.</p>}
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Select priority</label>
                <div className="flex flex-wrap gap-2">
                  {(["LOW", "MEDIUM", "HIGH"] as Priority[]).map((priority) => (
                    <button key={priority} type="button" onClick={() => setDraftPriority(priority)} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition", draftPriority === priority ? priorityOptionStyle[priority] + " ring-1" : isDark ? "bg-zinc-800 text-zinc-500 hover:bg-zinc-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>
                      <Flag className="size-3 fill-current" />
                      {priority[0] + priority.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
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
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                    <Input autoFocus value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search team members" className={cn("pl-9", isDark ? "border-zinc-700 bg-zinc-900" : "")} />
                  </div>
                  <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                    {people.filter((person) => person.name.toLowerCase().includes(memberQuery.toLowerCase())).map((person) => {
                      const selected = draftAssignees.includes(person.user_id)
                      return (
                        <button key={person.user_id} type="button" onClick={() => setDraftAssignees(selected ? draftAssignees.filter((id) => id !== person.user_id) : [...draftAssignees, person.user_id])} className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm", selected ? (isDark ? "bg-white text-black" : "bg-slate-900 text-white") : isDark ? "hover:bg-zinc-800" : "hover:bg-slate-100")}>
                          <span className={cn("flex size-7 items-center justify-center overflow-hidden rounded-full text-[9px] font-bold", selected ? "bg-black text-white" : "bg-slate-200 text-slate-700")}>
                            {person.avatar_url ? <img src={person.avatar_url} alt="" className="size-full object-cover" /> : initials(person.name)}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{person.name}</span>
                          {selected && <CheckCircle2 className="size-4" />}
                        </button>
                      )
                    })}
                    {people.filter((person) => person.name.toLowerCase().includes(memberQuery.toLowerCase())).length === 0 && <p className="px-2 py-6 text-center text-sm text-zinc-500">No team members match that search.</p>}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Tags <span className="font-normal text-zinc-500">({draftTags.length}/3)</span></label>
              <div className="flex gap-2">
                <Input value={draftTag} maxLength={24} onChange={(event) => setDraftTag(event.target.value)} placeholder="Add a tag" onKeyDown={(event) => { if (event.key === "Enter" && draftTag.trim() && draftTags.length < 3 && !draftTags.includes(draftTag.trim())) { event.preventDefault(); setDraftTags([...draftTags, draftTag.trim()]); setDraftTag("") } }} className={isDark ? "border-zinc-700 bg-zinc-900" : ""} />
                <Button type="button" variant="outline" disabled={!draftTag.trim() || draftTags.length >= 3 || draftTags.includes(draftTag.trim())} onClick={() => { setDraftTags([...draftTags, draftTag.trim()]); setDraftTag("") }}>Add</Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {draftTags.map((tag, index) => (
                  <button key={tag} type="button" onClick={() => setDraftTags(draftTags.filter((item) => item !== tag))} className={cn("rounded-full px-2 py-1 text-xs font-semibold", tagStyleFor(index + 1, tag, isDark))}>{tag} x</button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Subtasks</label>
              <div className="flex gap-2">
                <Input value={draftSubtask} maxLength={80} onChange={(event) => setDraftSubtask(event.target.value)} placeholder="Add a subtask at the end" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); appendDraftSubtask() } }} className={isDark ? "border-zinc-700 bg-zinc-900" : ""} />
                <Button type="button" variant="outline" disabled={!draftSubtask.trim()} onClick={appendDraftSubtask}>Add</Button>
              </div>
              <div className="mt-3 space-y-2">
                {draftSubtasks.map((subtask, index) => (
                  <div
                    key={index}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggedDraftSubtaskIndex !== null) reorderDraftSubtasks(draggedDraftSubtaskIndex, index)
                      setDraggedDraftSubtaskIndex(null)
                    }}
                    className={cn("flex items-center gap-2 rounded-lg border p-2 transition-colors", draggedDraftSubtaskIndex === index && "border-dashed opacity-60", isDark ? "border-zinc-800 bg-zinc-900/70" : "border-slate-200 bg-slate-50")}
                  >
                    <span draggable title="Drag to reorder" onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedDraftSubtaskIndex(index) }} onDragEnd={() => setDraggedDraftSubtaskIndex(null)} className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-zinc-500 active:cursor-grabbing">
                      <GripVertical className="size-4" />
                    </span>
                    <Input value={subtask} maxLength={80} aria-label={`Subtask ${index + 1}`} onChange={(event) => updateDraftSubtask(index, event.target.value)} placeholder="Describe this subtask" className={cn("h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0", isDark ? "text-white placeholder:text-zinc-600" : "text-slate-900 placeholder:text-slate-400")} />
                    <div className="flex shrink-0 items-center">
                      <Button type="button" variant="ghost" size="icon" title="Insert subtask below" onClick={() => insertDraftSubtask(index + 1)} className="size-7"><Plus className="size-3.5" /></Button>
                      <Button type="button" variant="ghost" size="icon" title="Remove subtask" onClick={() => removeDraftSubtask(index)} className="size-7 text-rose-500 hover:text-rose-600"><Trash2 className="size-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
              {createAttempted && draftSubtasks.length === 0 && <p className="mt-2 text-xs text-rose-500">Add at least one subtask before creating a task.</p>}
              {createAttempted && draftSubtasks.some((subtask) => !subtask.trim()) && <p className="mt-2 text-xs text-rose-500">Complete or remove every blank subtask before saving.</p>}
            </div>
          </div>
          <div className={cn("flex justify-end gap-2 border-t px-6 py-4", isDark ? "border-zinc-800" : "border-slate-200")}>
            <Button variant="outline" onClick={() => onEditorOpenChange(false)}>Cancel</Button>
            <Button onClick={saveTask} className="bg-blue-600 text-white hover:bg-blue-500">
              {editingTask ? <Pencil className="size-4" /> : <Plus className="size-4" />}
              {editingTask ? "Save changes" : "Create task"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
