"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
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

import { useAuth } from "@/components/auth/protected-route"
import { CreateDiscussionDialog } from "./discussions/create-discussion-dialog"
import { DiscussionChat } from "./discussions/discussion-chat"
import { DiscussionInfoPanel } from "./discussions/discussion-info-panel"
import { DiscussionSidebar } from "./discussions/discussion-sidebar"
import type { DiscussionItem, WsMessage } from "./discussions/types"

export { EmptyTeamTab } from "./discussions/empty-team-tab"
export type { DiscussionItem, WsMessage } from "./discussions/types"

export function DiscussionsTab({
  isDark,
  teamId,
  userRole = "member",
  onOpenMemberDetails,
}: {
  isDark: boolean
  teamId?: string | number
  userRole?: "admin" | "member"
  onOpenMemberDetails?: (member: { user_id: number; name?: string; avatar_url?: string } | number) => void
}) {
  const { user } = useAuth()
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const isAdmin = userRole === "admin"

  const getAuthToken = () => {
    if (typeof window === "undefined") return null
    return localStorage.getItem("access_token") || localStorage.getItem("token")
  }

  const getProjectId = () => {
    if (typeof window === "undefined") return "1"
    return localStorage.getItem("selected_project_id") || "1"
  }

  // Discussions API state
  const [discussions, setDiscussions] = useState<DiscussionItem[]>([])
  const [loadingDiscussions, setLoadingDiscussions] = useState(true)
  const [activeDiscussionId, setActiveDiscussionId] = useState<number | null>(null)
  const [singleDetails, setSingleDetails] = useState<DiscussionItem | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Panel 3 visibility
  const [showDetailsPanel, setShowDetailsPanel] = useState(false)

  // Create Discussion Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createDescription, setCreateDescription] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")

  // Edit Discussion state (in Panel 3)
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [savingDetails, setSavingDetails] = useState(false)
  const [editError, setEditError] = useState("")

  // Pin / Delete states
  const [togglingPin, setTogglingPin] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // WebSocket Chat state
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting")
  const [messages, setMessages] = useState<WsMessage[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const socketRef = useRef<WebSocket | null>(null)

  // Fetch all discussions for team
  const fetchDiscussions = async () => {
    if (!teamId) return
    const token = getAuthToken()
    const projectId = getProjectId()
    if (!token) {
      console.warn("DiscussionsTab: No auth token found in localStorage")
      setLoadingDiscussions(false)
      return
    }

    try {
      setLoadingDiscussions(true)
      const res = await fetch(`${apiUrl}/projects/${projectId}/teams/${teamId}/discussions`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        setDiscussions([])
        return
      }

      const data = await res.json()
      const list: DiscussionItem[] = data.discussions || []
      setDiscussions(list)

      // Set active discussion if none selected
      if (list.length > 0) {
        setActiveDiscussionId((prev) => {
          if (prev && list.some((d) => d.id === prev)) return prev
          return list[0].id
        })
      } else {
        setActiveDiscussionId(null)
      }
    } catch (err) {
      console.error("Failed to load team discussions:", err)
    } finally {
      setLoadingDiscussions(false)
    }
  }

  // Fetch detailed info for active discussion
  const fetchDiscussionDetails = async (discId: number) => {
    if (!teamId) return
    const token = getAuthToken()
    const projectId = getProjectId()
    if (!token) return

    try {
      const res = await fetch(`${apiUrl}/projects/${projectId}/teams/${teamId}/discussions/${discId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        const data = await res.json()
        setSingleDetails(data)
      }
    } catch (err) {
      console.error("Failed to fetch discussion details:", err)
    }
  }

  useEffect(() => {
    fetchDiscussions()
  }, [teamId])

  useEffect(() => {
    if (activeDiscussionId) {
      fetchDiscussionDetails(activeDiscussionId)
    } else {
      setSingleDetails(null)
    }
  }, [activeDiscussionId])

  // Create discussion handler
  const handleCreateDiscussion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createName.trim() || !teamId) return
    const token = getAuthToken()
    const projectId = getProjectId()
    if (!token) return

    setCreating(true)
    setCreateError("")

    try {
      const res = await fetch(`${apiUrl}/projects/${projectId}/teams/${teamId}/discussions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || "Failed to create discussion")
      }

      setIsCreateOpen(false)
      setCreateName("")
      setCreateDescription("")
      await fetchDiscussions()
      if (data.discussion?.id) {
        setActiveDiscussionId(data.discussion.id)
      }
    } catch (err: any) {
      setCreateError(err.message || "Failed to create discussion")
    } finally {
      setCreating(false)
    }
  }

  // Save inline edit in Panel 3
  const handleSaveDetails = async () => {
    if (!activeDiscussionId || !teamId) return
    const token = getAuthToken()
    const projectId = getProjectId()
    if (!token) return

    setSavingDetails(true)
    setEditError("")

    try {
      const res = await fetch(`${apiUrl}/projects/${projectId}/teams/${teamId}/discussions/${activeDiscussionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || "Failed to update discussion")
      }

      setIsEditingDetails(false)
      await fetchDiscussions()
      await fetchDiscussionDetails(activeDiscussionId)
    } catch (err: any) {
      setEditError(err.message || "Failed to update discussion")
    } finally {
      setSavingDetails(false)
    }
  }

  // Pin / Unpin handler
  const handleTogglePin = async () => {
    const target = singleDetails || activeDiscussion
    if (!target || !teamId) return
    const token = getAuthToken()
    const projectId = getProjectId()
    if (!token) return

    setTogglingPin(true)
    try {
      const res = await fetch(`${apiUrl}/projects/${projectId}/teams/${teamId}/discussions/${target.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          is_pinned: !target.is_pinned,
        }),
      })

      if (res.ok) {
        await fetchDiscussions()
        await fetchDiscussionDetails(target.id)
      }
    } catch (err) {
      console.error("Failed to pin/unpin discussion:", err)
    } finally {
      setTogglingPin(false)
    }
  }

  // Delete discussion handler
  const handleDeleteDiscussion = async () => {
    if (!activeDiscussionId || !teamId) return
    const token = getAuthToken()
    const projectId = getProjectId()
    if (!token) return

    setDeleting(true)
    try {
      const res = await fetch(`${apiUrl}/projects/${projectId}/teams/${teamId}/discussions/${activeDiscussionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        setIsDeleteOpen(false)
        setShowDetailsPanel(false)
        setActiveDiscussionId(null)
        await fetchDiscussions()
      }
    } catch (err) {
      console.error("Failed to delete discussion:", err)
    } finally {
      setDeleting(false)
    }
  }

  const activeDiscussion = discussions.find((d) => d.id === activeDiscussionId) || null

  return (
    <div className={cn("flex h-full min-h-0 overflow-hidden", isDark ? "bg-[#0b0d0f] text-white" : "bg-[#fbfcfd] text-slate-900")}>
      {/* PANEL 1: SIDEBAR */}
      <DiscussionSidebar
        isDark={isDark}
        isAdmin={isAdmin}
        discussions={discussions}
        loading={loadingDiscussions}
        activeDiscussionId={activeDiscussionId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectDiscussion={setActiveDiscussionId}
        onCreateOpen={() => {
          setCreateError("")
          setIsCreateOpen(true)
        }}
      />

      {/* PANEL 2: CHAT AREA */}
      <DiscussionChat
        isDark={isDark}
        teamId={teamId}
        userRole={userRole}
        currentUserId={user?.user_id}
        activeDiscussion={activeDiscussion}
        showDetailsPanel={showDetailsPanel}
        onToggleDetailsPanel={() => setShowDetailsPanel((prev) => !prev)}
        onOpenMemberDetails={onOpenMemberDetails}
      />

      {/* PANEL 3: DETAILS DRAWER (WHATSAPP STYLE) */}
      {showDetailsPanel && activeDiscussion && (
        <DiscussionInfoPanel
          isDark={isDark}
          isAdmin={isAdmin}
          activeDiscussion={activeDiscussion}
          singleDetails={singleDetails}
          onClose={() => setShowDetailsPanel(false)}
          isEditingDetails={isEditingDetails}
          editName={editName}
          editDescription={editDescription}
          savingDetails={savingDetails}
          editError={editError}
          onStartEditing={() => {
            setEditName(activeDiscussion.name)
            setEditDescription(activeDiscussion.description || "")
            setIsEditingDetails(true)
          }}
          onCancelEditing={() => setIsEditingDetails(false)}
          onNameChange={setEditName}
          onDescriptionChange={setEditDescription}
          onSaveDetails={handleSaveDetails}
          togglingPin={togglingPin}
          onTogglePin={handleTogglePin}
          onOpenDelete={() => setIsDeleteOpen(true)}
        />
      )}

      {/* MODAL: CREATE DISCUSSION */}
      <CreateDiscussionDialog
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        isDark={isDark}
        name={createName}
        description={createDescription}
        onNameChange={setCreateName}
        onDescriptionChange={setCreateDescription}
        onSubmit={handleCreateDiscussion}
        creating={creating}
        error={createError}
      />

      {/* MODAL: DELETE CONFIRMATION */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className={cn("sm:max-w-[400px]", isDark ? "border-zinc-800 bg-[#121518] text-white" : "bg-white text-slate-900")}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-500 flex items-center gap-2">
              <Trash2 className="size-5" /> Delete Discussion?
            </DialogTitle>
            <DialogDescription className={cn("text-xs leading-relaxed pt-1", isDark ? "text-zinc-400" : "text-slate-500")}>
              Are you sure you want to delete <strong>#{activeDiscussion?.name}</strong>? This action cannot be undone and will permanently remove all associated channel data.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 pt-3">
            <Button type="button" variant="ghost" onClick={() => setIsDeleteOpen(false)} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={handleDeleteDiscussion}
              className="rounded-xl text-xs font-semibold"
            >
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : "Delete Discussion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
