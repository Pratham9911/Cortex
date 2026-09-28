"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { Check, FolderLock, Inbox, Loader2, Mail, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type InboxMessage = {
  message_id: number
  type: string
  title: string
  message: string
  status: "unread" | "read" | "accepted" | "rejected"
  sender_id?: number
  sender_name?: string
  related_project_id?: number
  project_name?: string
  created_at: string
}

type InboxControllerOptions = {
  apiUrl: string
  onInviteHandled?: () => void | Promise<void>
}

type ProjectLimit = {
  currentProjects: number
  maxProjects: number
  planName: string
}

type InboxController = ReturnType<typeof useInboxController>
const InboxControllerContext = createContext<InboxController | null>(null)

export function InboxControllerProvider({ controller, children }: { controller: InboxController; children: React.ReactNode }) {
  return <InboxControllerContext.Provider value={controller}>{children}</InboxControllerContext.Provider>
}

export function useInboxControllerContext() {
  const controller = useContext(InboxControllerContext)
  if (!controller) throw new Error("InboxControllerProvider is required")
  return controller
}

export function useInboxController({ apiUrl, onInviteHandled }: InboxControllerOptions) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [handlingMessageId, setHandlingMessageId] = useState<number | null>(null)
  const [projectLimit, setProjectLimit] = useState<ProjectLimit | null>(null)

  const loadInbox = async () => {
    setLoading(true)
    setError("")

    try {
      const token = localStorage.getItem("access_token")
      if (!token) throw new Error("Your session has expired.")

      const response = await fetch(`${apiUrl}/inbox`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => [])

      if (!response.ok) {
        throw new Error(data?.detail || "Could not load inbox messages.")
      }

      setMessages(Array.isArray(data) ? data : [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load inbox messages.")
    } finally {
      setLoading(false)
    }
  }

  const openInbox = () => {
    setOpen(true)
    loadInbox()
  }

  useEffect(() => {
    loadInbox()
  }, [])

  const markRead = async (message: InboxMessage) => {
    if (message.status !== "unread") return

    setMessages((current) =>
      current.map((item) =>
        item.message_id === message.message_id ? { ...item, status: "read" } : item
      )
    )

    try {
      const token = localStorage.getItem("access_token")
      const response = await fetch(`${apiUrl}/inbox/${message.message_id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) throw new Error("read-failed")
    } catch {
      setMessages((current) =>
        current.map((item) =>
          item.message_id === message.message_id ? { ...item, status: "unread" } : item
        )
      )
      setError("Could not mark this message as read.")
    }
  }

  const handleInvite = async (message: InboxMessage, action: "accept" | "reject") => {
    setHandlingMessageId(message.message_id)
    setError("")

    try {
      const token = localStorage.getItem("access_token")
      const response = await fetch(`${apiUrl}/inbox/${message.message_id}/${action}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        const detail = data?.detail
        if (action === "accept" && detail?.code === "PROJECT_LIMIT_REACHED") {
          setProjectLimit({
            currentProjects: Number(detail.current_projects) || 0,
            maxProjects: Number(detail.max_projects) || 0,
            planName: typeof detail.plan_name === "string" ? detail.plan_name : "Current",
          })
          return
        }
        throw new Error(data?.detail || `Could not ${action} invite.`)
      }

      const nextStatus = action === "accept" ? "accepted" : "rejected"
      setMessages((current) =>
        current.map((item) =>
          item.message_id === message.message_id ? { ...item, status: nextStatus } : item
        )
      )

      await onInviteHandled?.()
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : `Could not ${action} invite.`)
    } finally {
      setHandlingMessageId(null)
    }
  }

  return {
    open,
    setOpen,
    messages,
    loading,
    error,
    projectLimit,
    setProjectLimit,
    handlingMessageId,
    unreadCount: messages.filter((message) => message.status === "unread").length,
    loadInbox,
    openInbox,
    markRead,
    handleInvite,
  }
}

function formatInboxDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" })
}

export function InboxUnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null

  return (
    <span className="absolute -right-1.5 -top-1.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-[#0d0f14]">
      {count > 99 ? "99+" : count}
    </span>
  )
}

export function InboxContent({
  controller,
  isDark,
  fullPage = false,
}: {
  controller: ReturnType<typeof useInboxController>
  isDark: boolean
  fullPage?: boolean
}) {
  return (
    <>
    <div className={cn("grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden", isDark ? (fullPage ? "bg-[#0A0A0A] text-zinc-100" : "bg-[#171920] text-zinc-100") : "bg-white")}>
        <div className={cn("border-b px-6 py-5", isDark ? "border-zinc-800" : "border-slate-200")}>
          <div>
            <div className="flex items-center gap-3 text-lg font-semibold">
              <span className={cn("flex size-10 items-center justify-center rounded-xl", isDark ? "bg-sky-500/15 text-sky-400" : "bg-sky-100 text-sky-600")}>
                <Inbox className="size-5" />
              </span>
              <span>
                Inbox
                {controller.unreadCount > 0 && (
                  <span className="ml-2 rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    {controller.unreadCount} unread
                  </span>
                )}
              </span>
            </div>
            <p className={cn("mt-1 text-xs", isDark ? "text-zinc-400" : "text-slate-500")}>
              Project invitations, updates, and system messages.
            </p>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {controller.loading ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Loader2 className="size-7 animate-spin text-sky-500" />
              <p className="mt-3 text-sm text-zinc-500">Loading your messages...</p>
            </div>
          ) : controller.error && controller.messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-semibold text-red-400">{controller.error}</p>
              <Button onClick={controller.loadInbox} variant="outline" className="mt-4">
                Try again
              </Button>
            </div>
          ) : controller.messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <span className={cn("flex size-14 items-center justify-center rounded-full", isDark ? "bg-zinc-800 text-zinc-500" : "bg-slate-100 text-slate-400")}>
                <Mail className="size-6" />
              </span>
              <h3 className="mt-4 text-base font-semibold">Your inbox is clear</h3>
              <p className="mt-1 text-sm text-zinc-500">New invitations and updates will appear here.</p>
            </div>
          ) : (
            <div className={cn("divide-y", isDark ? "divide-zinc-800" : "divide-slate-200")}>
              {controller.error && (
                <div className="bg-red-500/10 px-5 py-2 text-xs text-red-400">{controller.error}</div>
              )}
              {controller.messages.map((message) => {
                const isUnread = message.status === "unread"
                const isInvite = message.type === "invite"
                const isHandledInvite = message.status === "accepted" || message.status === "rejected"
                const isHandling = controller.handlingMessageId === message.message_id

                return (
                  <div
                    key={message.message_id}
                    onClick={() => controller.markRead(message)}
                    className={cn(
                      "relative flex w-full gap-4 px-5 py-4 text-left transition-colors",
                      isUnread
                        ? isDark ? "bg-sky-500/10 hover:bg-sky-500/15" : "bg-sky-50 hover:bg-sky-100/80"
                        : isDark ? (fullPage ? "bg-[#0A0A0A] hover:bg-zinc-900" : "bg-[#171920] hover:bg-zinc-800/60") : "bg-white hover:bg-slate-50"
                    )}
                  >
                    {isUnread && <span className="absolute inset-y-0 left-0 w-1 bg-sky-500" />}
                    <span className={cn(
                      "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full",
                      isUnread ? "bg-sky-500 text-white" : isDark ? "bg-zinc-800 text-zinc-400" : "bg-slate-100 text-slate-500"
                    )}>
                      <Mail className="size-4" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className={cn("truncate text-sm", isUnread ? "font-bold" : "font-semibold", isDark ? "text-zinc-100" : "text-slate-900")}>
                          {message.title}
                        </span>
                        <span className={cn("shrink-0 text-[11px]", isUnread ? "font-semibold text-sky-500" : "text-zinc-500")}>
                          {formatInboxDate(message.created_at)}
                        </span>
                      </span>
                      <span className={cn("mt-1 block text-xs leading-5", isUnread ? isDark ? "text-zinc-300" : "text-slate-700" : "text-zinc-500")}>
                        {message.message}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        {message.sender_name && <span className="text-[10px] font-medium text-zinc-500">From {message.sender_name}</span>}
                        {message.project_name && (
                          <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold", isDark ? "bg-zinc-800 text-zinc-400" : "bg-slate-100 text-slate-600")}>
                            {message.project_name}
                          </span>
                        )}
                        {isHandledInvite && (
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase",
                            message.status === "accepted"
                              ? "bg-emerald-500/15 text-emerald-500"
                              : "bg-red-500/15 text-red-500"
                          )}>
                            {message.status}
                          </span>
                        )}
                      </span>

                      {isInvite && !isHandledInvite && (
                        <span className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={isHandling}
                            onClick={(event) => {
                              event.stopPropagation()
                              controller.handleInvite(message, "accept")
                            }}
                            className="h-8 rounded-full bg-emerald-600 px-4 text-xs text-white hover:bg-emerald-500"
                          >
                            {isHandling ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : <Check className="mr-1.5 size-3" />}
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isHandling}
                            onClick={(event) => {
                              event.stopPropagation()
                              controller.handleInvite(message, "reject")
                            }}
                            className={cn("h-8 rounded-full px-4 text-xs", isDark ? "border-zinc-700 hover:bg-zinc-800" : "")}
                          >
                            <X className="mr-1.5 size-3" />
                            Reject
                          </Button>
                        </span>
                      )}
                    </span>

                    {isUnread && <span className="mt-2 size-2 shrink-0 rounded-full bg-sky-500" />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
    </div>
    <Dialog open={!!controller.projectLimit} onOpenChange={(open) => !open && controller.setProjectLimit(null)}>
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
              <FolderLock className="h-5 w-5" />
            </div>
            <DialogTitle className="text-xl font-bold">Project limit reached</DialogTitle>
            <DialogDescription className={isDark ? "pt-1 text-zinc-400" : "pt-1 text-slate-600"}>
              Your {controller.projectLimit?.planName} plan includes up to {controller.projectLimit?.maxProjects} projects.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="space-y-4 px-6 pb-6">
          <div className={cn("rounded-xl border p-4", isDark ? "border-zinc-700 bg-[#101115]" : "border-slate-200 bg-slate-50")}>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className={isDark ? "text-zinc-300" : "text-slate-700"}>Projects in use</span>
              <span className="font-semibold">
                {controller.projectLimit?.currentProjects} / {controller.projectLimit?.maxProjects}
              </span>
            </div>
            <div className={cn("h-2 overflow-hidden rounded-full", isDark ? "bg-zinc-800" : "bg-slate-200")}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                style={{
                  width: `${controller.projectLimit?.maxProjects
                    ? Math.min(100, (controller.projectLimit.currentProjects / controller.projectLimit.maxProjects) * 100)
                    : 100}%`,
                }}
              />
            </div>
          </div>
          <p className={cn("text-sm leading-relaxed", isDark ? "text-zinc-400" : "text-slate-600")}>
            This invitation is still pending. Ask a project admin to remove you from a project you no longer need, then accept the invitation.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => controller.setProjectLimit(null)}>
              Got it
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}

export function InboxDialog({ controller, isDark }: { controller: InboxController; isDark: boolean }) {
  return <Dialog open={controller.open} onOpenChange={controller.setOpen}><DialogContent className={cn("h-[620px] max-h-[85vh] overflow-hidden p-0 sm:max-w-[760px]", isDark ? "border-zinc-700 bg-[#171920] text-zinc-100" : "border-slate-200 bg-white")}><InboxContent controller={controller} isDark={isDark} /></DialogContent></Dialog>
}
