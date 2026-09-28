"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { Bell, CheckCircle2, Loader2, Trash2 } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { UserAvatarContents } from "@/components/teams/user-avatar-contents"
import { cn } from "@/lib/utils"

type Notification = {
  id: number
  type: "TASK_ASSIGNED"
  title: string
  message: string
  reference_type: "TASK"
  reference_id: number
  team_id: number | null
  is_read: boolean
  created_at: string
  actor: { user_id: number; name: string; avatar_url?: string } | null
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const now = new Date()
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" })
}

export default function NotificationsPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const isDark = theme === "dark"
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notificationPendingDeletion, setNotificationPendingDeletion] = useState<Notification | null>(null)

  const loadNotifications = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      if (!token || !projectId) throw new Error("Project context is missing")
      const response = await fetch(`${apiUrl}/projects/${projectId}/notifications`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.detail || "Could not load notifications")
      setNotifications(Array.isArray(data.notifications) ? data.notifications : [])
      setError("")
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load notifications") } finally { setLoading(false) }
  }

  useEffect(() => { void loadNotifications() }, [])

  const openNotification = async (notification: Notification) => {
    const token = localStorage.getItem("access_token")
    const projectId = localStorage.getItem("selected_project_id")
    if (!token || !projectId || !notification.team_id) return
    if (!notification.is_read) {
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item))
      await fetch(`${apiUrl}/projects/${projectId}/notifications/${notification.id}/read`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } })
    }
    router.push(`/teams/${notification.team_id}?taskId=${notification.reference_id}`)
  }

  const deleteNotification = async (notification: Notification) => {
    const token = localStorage.getItem("access_token")
    const projectId = localStorage.getItem("selected_project_id")
    if (!token || !projectId) return

    setNotifications((current) => current.filter((item) => item.id !== notification.id))
    try {
      const response = await fetch(`${apiUrl}/projects/${projectId}/notifications/${notification.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error("Could not delete notification")
    } catch (caught) {
      setNotifications((current) => [...current, notification].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
      setError(caught instanceof Error ? caught.message : "Could not delete notification")
    }
  }

  const unreadCount = notifications.filter((notification) => !notification.is_read).length

  return (
    <>
      <section className={cn("flex h-full min-h-0 w-full flex-col", isDark ? "bg-[#0A0A0A] text-zinc-100" : "bg-white text-slate-900")}>
      <header className={cn("shrink-0 border-b px-6 py-5", isDark ? "border-zinc-800" : "border-slate-200")}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 text-lg font-semibold">
              <span className={cn("flex size-10 items-center justify-center rounded-xl", isDark ? "bg-sky-500/15 text-sky-400" : "bg-sky-100 text-sky-600")}>
                <Bell className="size-5" />
              </span>
              <span>
                Notifications
                {unreadCount > 0 && <span className="ml-2 rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-bold text-white">{unreadCount} unread</span>}
              </span>
            </div>
            <p className={cn("mt-1 text-xs", isDark ? "text-zinc-400" : "text-slate-500")}>Task assignments and project updates.</p>
          </div>
          <button type="button" onClick={() => void loadNotifications()} className={cn("rounded-md border px-3 py-2 text-xs font-semibold", isDark ? "border-zinc-700 hover:bg-zinc-900" : "border-slate-200 hover:bg-slate-50")}>Refresh</button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? <div className="flex h-full flex-col items-center justify-center text-center"><Loader2 className="size-7 animate-spin text-sky-500" /><p className="mt-3 text-sm text-zinc-500">Loading your notifications...</p></div> : error && notifications.length === 0 ? <div className="flex h-full items-center justify-center px-6 text-sm text-rose-500">{error}</div> : notifications.length === 0 ? <div className="flex h-full flex-col items-center justify-center gap-3 text-center"><span className={cn("flex size-14 items-center justify-center rounded-full", isDark ? "bg-zinc-800 text-zinc-500" : "bg-slate-100 text-slate-400")}><Bell className="size-6" /></span><h3 className="text-base font-semibold">You are all caught up</h3><p className="text-sm text-zinc-500">New task assignments will appear here.</p></div> : <div className={cn("divide-y", isDark ? "divide-zinc-800" : "divide-slate-200")}>
          {error && <div className="bg-red-500/10 px-5 py-2 text-xs text-red-400">{error}</div>}
          {notifications.map((notification) => {
            const isUnread = !notification.is_read
            return <div key={notification.id} onClick={() => void openNotification(notification)} className={cn("group relative flex cursor-pointer gap-4 px-5 py-4 text-left transition-colors", isUnread ? (isDark ? "bg-sky-500/10 hover:bg-sky-500/15" : "bg-sky-50 hover:bg-sky-100/80") : (isDark ? "hover:bg-zinc-900" : "hover:bg-slate-50"))}>
              {isUnread && <span className="absolute inset-y-0 left-0 w-1 bg-sky-500" />}
              <span className={cn("mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full", isUnread ? "bg-sky-500 text-white" : (isDark ? "bg-zinc-800 text-zinc-400" : "bg-slate-100 text-slate-500"))}><Bell className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-3"><span className={cn("truncate text-sm", isUnread ? "font-bold" : "font-semibold")}>{notification.title}</span><span className={cn("shrink-0 text-[11px]", isUnread ? "font-semibold text-sky-500" : "text-zinc-500")}>{formatDate(notification.created_at)}</span></span><span className={cn("mt-1 block text-xs leading-5", isUnread ? (isDark ? "text-zinc-300" : "text-slate-700") : "text-zinc-500")}>{notification.message}</span><span className="mt-2 flex items-center gap-2"><span className={cn("flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-black bg-white text-[8px] font-bold text-black")} >{notification.actor ? <UserAvatarContents name={notification.actor.name} avatarUrl={notification.actor.avatar_url} /> : "CX"}</span><span className="text-[10px] font-medium text-zinc-500">{notification.actor ? `From ${notification.actor.name}` : "Project update"}</span><span className="flex items-center gap-1 text-[10px] text-zinc-500"><CheckCircle2 className="size-3" />Open task</span></span></span>
              <button type="button" title="Delete notification" onClick={(event) => { event.stopPropagation(); setNotificationPendingDeletion(notification) }} className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500 focus:opacity-100", isDark ? "hover:bg-zinc-800" : "hover:bg-slate-100")}><Trash2 className="size-4" /></button>
            </div>
          })}
        </div>}
      </div>
      </section>
      <AlertDialog open={Boolean(notificationPendingDeletion)} onOpenChange={(open) => { if (!open) setNotificationPendingDeletion(null) }}>
        <AlertDialogContent className={cn(isDark ? "border-zinc-800 bg-[#151515] text-white" : "border-slate-200 bg-white")}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this notification?</AlertDialogTitle>
            <AlertDialogDescription className={isDark ? "text-zinc-400" : "text-slate-500"}>This removes the notification from your list. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (notificationPendingDeletion) void deleteNotification(notificationPendingDeletion); setNotificationPendingDeletion(null) }} className="bg-rose-600 text-white hover:bg-rose-500"><Trash2 className="size-4" />Delete notification</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
