"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import {
  Folder as FolderIcon,
  Search,
  MoreVertical,
  Plus,
  Upload,
  Lock,
  Info,
  Trash2,
  Edit2,
  Download,
  X,
  CheckSquare,
  Square,
  Eye,
  ChevronDown,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/protected-route"

// ─── Types ───────────────────────────────────────────────────────────────────

type FolderItem = {
  folder_id: number
  name: string
  document_count: number
  created_by: number
  created_at: string
  last_modified: string
  modified_by: number
  allowed_team_ids?: number[]
  is_locked_for_user?: boolean
}

type DocumentItem = {
  document_id: number
  title: string
  description?: string
  folder_id?: number
  folder_name?: string
  created_at: string
  last_modified: string
  modified_by: number
  owner_id: number
  active_version: number
  file_name: string
  file_size: number
  download_access_level?: "member" | "admin" | "none"
  search_access_level?: "member" | "admin" | "none"
  allowed_team_ids?: number[]
  allowed_team_names?: string[]
  tags?: string[]
}

type UserInfo = { name: string; avatar_url?: string }
type TeamItem = { team_id: number; name: string }

// ─── File icon helper (uses public/icons assets) ─────────────────────────────

function FileIcon({ fileName, size = "sm" }: { fileName?: string; size?: "sm" | "lg" }) {
  const ext = fileName?.split(".").pop()?.toLowerCase()
  const dim = size === "lg" ? "w-16 h-16" : "w-4 h-4"
  if (ext === "pdf") return <img src="/icons/pdf.svg" className={cn(dim, "object-contain")} alt="PDF" />
  if (ext === "txt") return <img src="/icons/txt.svg" className={cn(dim, "object-contain")} alt="TXT" />
  if (ext === "md")  return <img src="/icons/md.png"  className={cn(dim, "object-contain")} alt="MD" />
  return (
    <div className={cn("flex items-center justify-center rounded", size === "lg" ? "w-16 h-16 bg-zinc-200 dark:bg-zinc-700" : "")}>
      <svg className={cn(dim, "text-zinc-400")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const isDark = mounted && theme === "dark"
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  // ── Core data ───────────────────────────────────────────────────────────────
  const [folders, setFolders]               = useState<FolderItem[]>([])
  const [documents, setDocuments]           = useState<DocumentItem[]>([])
  const [loading, setLoading]               = useState(true)
  const [query, setQuery]                   = useState("")
  const [userMap, setUserMap]               = useState<Record<number, UserInfo>>({})
  const [avatars, setAvatars]               = useState<Record<string, string | null>>({})
  const [currentUserRole, setCurrentUserRole] = useState<"admin" | "member">("member")

  // ── Selection & panel ───────────────────────────────────────────────────────
  const [selectedType, setSelectedType]     = useState<"folder" | "document" | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<FolderItem | null>(null)
  const [selectedDoc, setSelectedDoc]       = useState<DocumentItem | null>(null)
  const [panelTab, setPanelTab]             = useState<"dashboard" | "versions" | "settings">("dashboard")

  // ── Version history states ──────────────────────────────────────────────────
  const [docVersions, setDocVersions]                   = useState<any[]>([])
  const [fetchingVersions, setFetchingVersions]         = useState(false)
  const [uploadVersionOpen, setUploadVersionOpen]       = useState(false)
  const [uploadVerFile, setUploadVerFile]               = useState<File | null>(null)
  const [uploadVerLoading, setUploadVerLoading]         = useState(false)
  const [uploadVerError, setUploadVerError]             = useState("")
  const [permDeleteOpen, setPermDeleteOpen]             = useState(false)
  const [permDeleteVersion, setPermDeleteVersion]       = useState<number | null>(null)
  const [permDeleteLoading, setPermDeleteLoading]       = useState(false)
  const verFileInputRef = useRef<HTMLInputElement>(null)

  // ── Lock modal ──────────────────────────────────────────────────────────────
  const [showLockInfo, setShowLockInfo]         = useState(false)
  const [lockModalOpen, setLockModalOpen]       = useState(false)
  const [lockedFolderInfo, setLockedFolderInfo] = useState<FolderItem | null>(null)

  // ── Folder CRUD ─────────────────────────────────────────────────────────────
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName]       = useState("")
  const [newFolderTeams, setNewFolderTeams]     = useState<Record<number, boolean>>({})
  const [folderError, setFolderError]           = useState("")
  const [renameFolderOpen, setRenameFolderOpen] = useState(false)
  const [folderToRename, setFolderToRename]     = useState<FolderItem | null>(null)
  const [renameName, setRenameName]             = useState("")
  const [deleteFolderOpen, setDeleteFolderOpen] = useState(false)
  const [folderToDelete, setFolderToDelete]     = useState<FolderItem | null>(null)
  const [deleteDocsInFolder, setDeleteDocsInFolder] = useState(false)

  // ── Document CRUD ───────────────────────────────────────────────────────────
  const [deleteDocOpen, setDeleteDocOpen]   = useState(false)
  const [docToDelete, setDocToDelete]       = useState<DocumentItem | null>(null)
  const [deleteDocLoading, setDeleteDocLoading] = useState(false)

  // ── Upload modal ─────────────────────────────────────────────────────────────
  const [uploadOpen, setUploadOpen]                     = useState(false)
  const [uploadFile, setUploadFile]                     = useState<File | null>(null)
  const [uploadTitle, setUploadTitle]                   = useState("")
  const [uploadDescription, setUploadDescription]       = useState("")
  const [uploadTags, setUploadTags]                     = useState("")
  const [uploadDownloadAccess, setUploadDownloadAccess] = useState<"member" | "admin" | "none">("member")
  const [uploadSearchAccess, setUploadSearchAccess]     = useState<"member" | "admin" | "none">("member")
  const [projectTeams, setProjectTeams]                 = useState<TeamItem[]>([])
  const [selectedTeams, setSelectedTeams]               = useState<Record<number, boolean>>({})
  const [isDragOver, setIsDragOver]                     = useState(false)
  const [uploadLoading, setUploadLoading]               = useState(false)
  const [uploadError, setUploadError]                   = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Settings panel (doc) ────────────────────────────────────────────────────
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsTitle, setSettingsTitle] = useState("")
  const [settingsDescription, setSettingsDescription] = useState("")
  const [settingsTags, setSettingsTags] = useState("")
  const [settingsDownload, setSettingsDownload] = useState<"member" | "admin" | "none">("member")
  const [settingsSearch, setSettingsSearch]     = useState<"member" | "admin" | "none">("member")
  const [settingsTeams, setSettingsTeams]       = useState<Record<number, boolean>>({})
  const [folderSettingsTeams, setFolderSettingsTeams] = useState<Record<number, boolean>>({})
  const [settingsError, setSettingsError]       = useState("")

  // ─── Fetch everything ─────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      if (!token || !projectId) return

      // Role
      try {
        const r = await fetch(`${apiUrl}/getprojects`, { headers: { Authorization: `Bearer ${token}` } })
        if (r.ok) {
          const d = await r.json()
          const p = Array.isArray(d) ? d.find((x: any) => x.project_id === Number(projectId)) : null
          if (p?.current_user_role) setCurrentUserRole(p.current_user_role)
        }
      } catch {}

      // Teams for upload modal
      try {
        const tr = await fetch(`${apiUrl}/projects/${projectId}/teams`, { headers: { Authorization: `Bearer ${token}` } })
        if (tr.ok) { const td = await tr.json(); setProjectTeams(Array.isArray(td) ? td : []) }
      } catch {}

      const [fRes, dRes] = await Promise.all([
        fetch(`${apiUrl}/projects/${projectId}/folders`,   { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/projects/${projectId}/documents`, { headers: { Authorization: `Bearer ${token}` } }),
      ])

      const fList: FolderItem[]   = fRes.ok ? (await fRes.json()) : []
      const rawDocs: DocumentItem[] = dRes.ok ? await dRes.json() : []
      const dList = rawDocs.filter((d) => d.folder_id == null)

      setFolders(fList)
      setDocuments(dList)

      // Avatars + names
      const ids = new Set<number>()
      fList.forEach(f => { ids.add(f.created_by); if (f.modified_by) ids.add(f.modified_by) })
      dList.forEach(d => { ids.add(d.owner_id); if (d.modified_by) ids.add(d.modified_by) })
      const uniqueIds = Array.from(ids).filter(Boolean)
      if (uniqueIds.length > 0) {
        const q = uniqueIds.map(id => `user_ids=${id}`).join("&")
        const aRes = await fetch(`${apiUrl}/users/avatars?force_refresh=false&${q}`, { headers: { Authorization: `Bearer ${token}` } })
        if (aRes.ok) {
          const aData = await aRes.json()
          setAvatars(aData.avatars || {})
          const nm: Record<number, UserInfo> = {}
          if (aData.names) {
            Object.entries(aData.names).forEach(([k, v]) => {
              const uid = parseInt(k)
              nm[uid] = { name: v as string, avatar_url: (aData.avatars || {})[k] }
            })
          }
          setUserMap(nm)
        }
      }
    } finally { setLoading(false) }
  }, [apiUrl])

  useEffect(() => { fetchAll() }, [fetchAll])

  const fetchDocVersions = useCallback(async (docId: number) => {
    setFetchingVersions(true)
    try {
      const token = localStorage.getItem("access_token")
      const incDel = currentUserRole === "admin"
      const res = await fetch(`${apiUrl}/documents/${docId}/versions?include_deleted=${incDel}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setDocVersions(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      console.error("Failed to fetch versions:", err)
    } finally {
      setFetchingVersions(false)
    }
  }, [apiUrl, currentUserRole])

  useEffect(() => {
    if (selectedDoc) {
      fetchDocVersions(selectedDoc.document_id)
    } else {
      setDocVersions([])
    }
  }, [selectedDoc, fetchDocVersions])

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const formatSize = (b: number) => {
    if (!b) return "--"
    const k = 1024, s = ["B","KB","MB","GB"]
    const i = Math.floor(Math.log(b) / Math.log(k))
    return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i]
  }
  const formatDate = (s?: string) => {
    if (!s) return "--"
    const d = new Date(s)
    return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getFullYear()).slice(2)}`
  }
  const getUserName = (id?: number) => {
    if (!id) return "—"
    if (id === user?.user_id) return user?.name || `User ${id}`
    return userMap[id]?.name || `User ${id}`
  }

  // ─── Selection helpers ────────────────────────────────────────────────────
  const isSelFolder = (f: FolderItem) => selectedType === "folder" && selectedFolder?.folder_id === f.folder_id
  const isSelDoc    = (d: DocumentItem) => selectedType === "document" && selectedDoc?.document_id === d.document_id

  const selectFolder = (f: FolderItem) => {
    if (isSelFolder(f)) { setSelectedType(null); setSelectedFolder(null) }
    else {
      setSelectedType("folder"); setSelectedFolder(f); setSelectedDoc(null); setPanelTab("dashboard")
      const t: Record<number, boolean> = {}
      ;(f.allowed_team_ids || []).forEach(id => { t[id] = true })
      setFolderSettingsTeams(t)
    }
  }
  const selectDoc = (d: DocumentItem) => {
    if (isSelDoc(d)) { setSelectedType(null); setSelectedDoc(null) }
    else {
      setSelectedType("document"); setSelectedDoc(d); setSelectedFolder(null); setPanelTab("dashboard")
      setSettingsTitle(d.title || "")
      setSettingsDescription(d.description || "")
      setSettingsTags((d.tags || []).join(", "))
      setSettingsDownload(d.download_access_level || "member")
      setSettingsSearch(d.search_access_level || "member")
      const t: Record<number, boolean> = {}
      ;(d.allowed_team_ids || []).forEach(id => { t[id] = true })
      setSettingsTeams(t)
    }
  }

  const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(query.toLowerCase()))
  const filteredDocs    = documents.filter(d => (d.title || d.file_name).toLowerCase().includes(query.toLowerCase()))

  // ─── Folder CRUD ──────────────────────────────────────────────────────────
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    setFolderError("")
    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      const selectedTeamIds = Object.entries(newFolderTeams).filter(([,v])=>v).map(([k])=>Number(k))
      const res = await fetch(`${apiUrl}/projects/${projectId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newFolderName.trim(), allowed_team_ids: selectedTeamIds })
      })
      if (!res.ok) { const e = await res.json(); setFolderError(e.detail || "Failed"); return }
      setCreateFolderOpen(false); setNewFolderName(""); setNewFolderTeams({}); fetchAll()
    } catch { setFolderError("Something went wrong") }
  }

  const handleSaveFolderTeams = async () => {
    if (!selectedFolder) return
    try {
      const token = localStorage.getItem("access_token")
      const selectedTeamIds = Object.entries(folderSettingsTeams).filter(([,v])=>v).map(([k])=>Number(k))
      const res = await fetch(`${apiUrl}/folders/${selectedFolder.folder_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ allowed_team_ids: selectedTeamIds })
      })
      if (!res.ok) return
      setSelectedFolder(p => p ? { ...p, allowed_team_ids: selectedTeamIds } : p)
      setFolders(p => p.map(f => f.folder_id === selectedFolder.folder_id ? { ...f, allowed_team_ids: selectedTeamIds } : f))
      fetchAll()
    } catch {}
  }

  const handleRenameFolder = async () => {
    if (!folderToRename || !renameName.trim()) return
    try {
      const token = localStorage.getItem("access_token")
      await fetch(`${apiUrl}/folders/${folderToRename.folder_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: renameName.trim() })
      })
      setRenameFolderOpen(false)
      if (selectedFolder?.folder_id === folderToRename.folder_id)
        setSelectedFolder(p => p ? { ...p, name: renameName.trim() } : p)
      fetchAll()
    } catch {}
  }

  const handleDeleteFolder = async () => {
    if (!folderToDelete) return
    try {
      const token = localStorage.getItem("access_token")
      await fetch(`${apiUrl}/folders/${folderToDelete.folder_id}?delete_documents=${deleteDocsInFolder}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` }
      })
      setDeleteFolderOpen(false)
      if (selectedFolder?.folder_id === folderToDelete.folder_id) { setSelectedFolder(null); setSelectedType(null) }
      fetchAll()
    } catch {}
  }

  // ─── Document soft-delete ─────────────────────────────────────────────────
  const handleDeleteDoc = async () => {
    if (!docToDelete) return
    setDeleteDocLoading(true)
    try {
      const token = localStorage.getItem("access_token")
      await fetch(`${apiUrl}/documents/${docToDelete.document_id}/versions/${docToDelete.active_version}/delete`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` }
      })
      setDeleteDocOpen(false)
      if (selectedDoc?.document_id === docToDelete.document_id) { setSelectedDoc(null); setSelectedType(null) }
      fetchAll()
    } catch {} finally { setDeleteDocLoading(false) }
  }

  // ─── Download ─────────────────────────────────────────────────────────────
  const handleDownload = async (doc: DocumentItem) => {
    try {
      const token = localStorage.getItem("access_token")
      const res = await fetch(`${apiUrl}/documents/${doc.document_id}/download`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      if (data.download_url) {
        const a = document.createElement("a"); a.href = data.download_url; a.download = data.file_name || doc.file_name; a.click()
      }
    } catch {}
  }

  const canDownload = (doc: DocumentItem) => {
    const lvl = doc.download_access_level || "member"
    if (lvl === "none") return false
    if (lvl === "admin") return currentUserRole === "admin"
    return true
  }

  const canViewDocContent = (doc: DocumentItem) => {
    const search = doc.search_access_level || "member"
    if (search === "none") return doc.owner_id === user?.user_id
    if (search === "admin") return currentUserRole === "admin"
    return true
  }

  // ─── Save doc settings ────────────────────────────────────────────────────
  const handleSaveSettings = async () => {
    if (!selectedDoc) return
    if (!settingsTitle.trim()) {
      setSettingsError("Title is required.")
      return
    }
    const selectedTeamIds = Object.entries(settingsTeams).filter(([,v])=>v).map(([k])=>k)
    if (selectedTeamIds.length === 0) {
      setSettingsError("Select at least one allowed team before saving.")
      return
    }
    setSettingsError("")
    setSettingsSaving(true)
    try {
      const token = localStorage.getItem("access_token")
      const form = new FormData()
      form.append("title", settingsTitle.trim())
      form.append("description", settingsDescription)
      form.append("tags", settingsTags)
      form.append("download_access_level", settingsDownload)
      form.append("search_access_level", settingsSearch)
      form.append("allowed_team_ids", selectedTeamIds.join(","))
      const res = await fetch(`${apiUrl}/documents/${selectedDoc.document_id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: form
      })
      if (!res.ok) {
        const e = await res.json()
        setSettingsError(e.detail || "Failed to save settings.")
        return
      }
      fetchAll()
    } catch {
      setSettingsError("Something went wrong while saving settings.")
    } finally { setSettingsSaving(false) }
  }

  const handleUploadVersionSubmit = async () => {
    if (!selectedDoc || !uploadVerFile) return
    setUploadVerLoading(true)
    setUploadVerError("")
    try {
      const token = localStorage.getItem("access_token")
      const form = new FormData()
      form.append("file", uploadVerFile)
      const res = await fetch(`${apiUrl}/documents/${selectedDoc.document_id}/versions/upload`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form
      })
      if (!res.ok) {
        const e = await res.json()
        setUploadVerError(e.detail || "Upload failed")
        return
      }
      setUploadVersionOpen(false)
      setUploadVerFile(null)
      fetchDocVersions(selectedDoc.document_id)
      fetchAll()
    } catch {
      setUploadVerError("Something went wrong")
    } finally {
      setUploadVerLoading(false)
    }
  }

  const handlePermDeleteSubmit = async () => {
    if (!selectedDoc || permDeleteVersion == null) return
    setPermDeleteLoading(true)
    try {
      const token = localStorage.getItem("access_token")
      const res = await fetch(`${apiUrl}/documents/${selectedDoc.document_id}/versions/${permDeleteVersion}/permanent`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setPermDeleteOpen(false)
        setPermDeleteVersion(null)
        fetchDocVersions(selectedDoc.document_id)
        fetchAll()
      }
    } catch {} finally {
      setPermDeleteLoading(false)
    }
  }

  // ─── Upload ───────────────────────────────────────────────────────────────
  const resetUpload = () => {
    setUploadFile(null); setUploadTitle(""); setUploadDescription(""); setUploadTags("")
    setUploadDownloadAccess("member"); setUploadSearchAccess("member")
    setSelectedTeams({}); setUploadError("")
  }
  const openUpload = () => { resetUpload(); setUploadOpen(true) }

  const handleFileSelect = (f: File) => {
    if (f.size > 5 * 1024 * 1024) { setUploadError("File exceeds 5MB limit."); return }
    const ext = f.name.split(".").pop()?.toLowerCase()
    if (!["pdf","txt","md"].includes(ext||"")) { setUploadError("Only PDF, TXT, MD files are supported."); return }
    setUploadError("")
    setUploadFile(f)
    if (!uploadTitle) setUploadTitle(f.name.replace(/\.[^.]+$/, ""))
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f)
  }, [uploadTitle])

  const handleUploadSubmit = async () => {
    if (!uploadFile || !uploadTitle.trim()) return
    const chosenTeams = Object.entries(selectedTeams).filter(([,v])=>v).map(([k])=>k)
    if (chosenTeams.length === 0) { setUploadError("Select at least one team."); return }
    setUploadLoading(true); setUploadError("")
    try {
      const token = localStorage.getItem("access_token")
      const projectId = localStorage.getItem("selected_project_id")
      const form = new FormData()
      form.append("title", uploadTitle.trim())
      form.append("description", uploadDescription)
      form.append("tags", uploadTags)
      form.append("download_access_level", uploadDownloadAccess)
      form.append("search_access_level", uploadSearchAccess)
      form.append("allowed_team_ids", chosenTeams.join(","))
      form.append("file", uploadFile)
      const res = await fetch(`${apiUrl}/projects/${projectId}/documents/upload`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form
      })
      if (!res.ok) { const e = await res.json(); setUploadError(e.detail || "Upload failed"); return }
      setUploadOpen(false); resetUpload(); fetchAll()
    } catch { setUploadError("Something went wrong") } finally { setUploadLoading(false) }
  }

  // ─── Row / column styles ──────────────────────────────────────────────────
  const rowBase     = "flex items-center h-10 text-sm border-b cursor-pointer select-none transition-colors"
  const rowIdle     = isDark ? "border-zinc-800 hover:bg-zinc-800/60" : "border-slate-100 hover:bg-slate-50"
  const rowSelected = isDark ? "bg-zinc-800 border-zinc-700" : "bg-slate-100 border-slate-200"
  const colDate  = "w-20 text-center text-xs tabular-nums"
  const colSize  = "w-20 text-center text-xs tabular-nums"
  const colUser  = "w-10 flex justify-center"
  const colMenu  = "w-10 flex justify-center"
  const colCheck = "w-9 flex justify-center"

  // ─── Mini avatar ──────────────────────────────────────────────────────────
  const UserAvatarSmall = ({ userId }: { userId?: number }) => {
    if (!userId) return null
    const url  = avatars[String(userId)]
    const name = getUserName(userId)
    const init = name.split(" ").filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase() || "?"
    return (
      <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center shrink-0 bg-zinc-300 dark:bg-zinc-700 text-[10px] font-bold text-zinc-700 dark:text-zinc-200">
        {url ? <img src={url} alt={name} className="w-full h-full object-cover" onError={e=>{e.currentTarget.style.display="none"}} /> : init}
      </div>
    )
  }

  // ─── Access select component ──────────────────────────────────────────────
  const AccessSelect = ({ value, onChange, label }: { value: string; onChange: (v: any)=>void; label: string }) => (
    <div className="flex items-center justify-between">
      <span className={cn("text-xs font-medium", isDark ? "text-zinc-300" : "text-slate-700")}>{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className={cn(
            "appearance-none text-xs h-7 pl-2 pr-6 rounded-md border outline-none cursor-pointer",
            isDark ? "bg-zinc-800 border-zinc-700 text-zinc-200" : "bg-white border-slate-300 text-slate-700"
          )}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          <option value="none">None</option>
        </select>
        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none text-zinc-400" />
      </div>
    </div>
  )

  // ─── Panel item ───────────────────────────────────────────────────────────
  const panelItem     = selectedType === "folder" ? selectedFolder : selectedDoc
  const panelIsFolder = selectedType === "folder"

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex -mx-6 -mt-8 -mb-8 h-[calc(100vh-64px)]">

      {/* ── MAIN LIST ──────────────────────────────────────────────── */}
      <div className={cn("flex flex-col flex-1 min-w-0 overflow-hidden border-r", isDark ? "bg-[#0d0f14] border-zinc-800" : "bg-white border-slate-200")}>

        {/* Top bar */}
        <div className={cn("flex items-center gap-2 px-4 h-12 border-b shrink-0", isDark ? "border-zinc-800 bg-[#0d0f14]" : "border-slate-200 bg-white")}>
          <h1 className={cn("text-base font-bold mr-2 whitespace-nowrap", isDark ? "text-white" : "text-slate-900")}>Documents</h1>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search..."
              className={cn("w-full h-8 pl-8 pr-3 text-sm rounded-md border outline-none",
                isDark ? "bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-500" : "bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400"
              )}
            />
          </div>
          {currentUserRole === "admin" && (
            <>
              <button onClick={()=>{setCreateFolderOpen(true);setFolderError("");setNewFolderName("");setNewFolderTeams({})}}
                className="flex items-center gap-1 h-8 px-3 rounded-md text-sm font-semibold whitespace-nowrap bg-violet-600 hover:bg-violet-700 text-white transition-colors">
                <Plus className="w-3.5 h-3.5" /> Folder
              </button>
              <button onClick={openUpload}
                className="flex items-center gap-1 h-8 px-3 rounded-md text-sm font-semibold whitespace-nowrap bg-violet-600 hover:bg-violet-700 text-white transition-colors">
                <Upload className="w-3.5 h-3.5" /> Upload
              </button>
            </>
          )}
        </div>

        {/* Column headers */}
        <div className={cn("flex items-center h-8 px-0 text-[11px] font-semibold uppercase tracking-wider shrink-0 border-b",
          isDark ? "text-zinc-500 border-zinc-800 bg-[#0d0f14]" : "text-slate-400 border-slate-100 bg-white")}>
          <div className={colCheck} />
          <div className="flex-1 pl-1">Name</div>
          <div className={colDate}>Modified</div>
          <div className={colSize}>Size</div>
          <div className={colUser}>By</div>
          <div className={colMenu} />
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Folders ── */}
          {filteredFolders.map(folder => (
            <div key={`f-${folder.folder_id}`}
              className={cn(rowBase, isSelFolder(folder) ? rowSelected : rowIdle)}
              onClick={() => selectFolder(folder)}
              onDoubleClick={() => {
                if (folder.is_locked_for_user) {
                  setLockedFolderInfo(folder); setLockModalOpen(true); return
                }
                router.push(`/documents/${folder.folder_id}`)
              }}
            >
              <div className={colCheck}>
                {folder.is_locked_for_user
                  ? <button onClick={e=>{e.stopPropagation();setLockedFolderInfo(folder);setLockModalOpen(true)}}
                      className="flex items-center justify-center hover:scale-110 active:scale-95 transition-transform">
                      <Lock className="h-3.5 w-3.5 text-red-500" />
                    </button>
                  : null}
              </div>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <FolderIcon className="w-4 h-4 text-amber-400 shrink-0" fill="currentColor" strokeWidth={0} />
                <span className={cn("truncate text-sm", isDark ? "text-zinc-200" : "text-slate-800")}>{folder.name}</span>
              </div>
              <div className={cn(colDate, isDark ? "text-zinc-500" : "text-slate-400")}>{formatDate(folder.last_modified || folder.created_at)}</div>
              <div className={cn(colSize, isDark ? "text-zinc-500" : "text-slate-400")}>--</div>
              <div className={colUser}><UserAvatarSmall userId={folder.modified_by || folder.created_by} /></div>
              <div className={colMenu} onClick={e=>e.stopPropagation()}>
                {currentUserRole === "admin" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className={cn("w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors", isDark ? "text-zinc-400" : "text-slate-400")}>
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className={cn("w-40 text-sm", isDark ? "bg-[#1a1c23] border-zinc-800 text-zinc-200" : "")}>
                      <DropdownMenuItem className="text-xs" onClick={()=>{setFolderToRename(folder);setRenameName(folder.name);setRenameFolderOpen(true)}}>
                        <Edit2 className="w-3.5 h-3.5 mr-2" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs text-red-500" onClick={()=>{setFolderToDelete(folder);setDeleteFolderOpen(true);setDeleteDocsInFolder(false)}}>
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}

          {/* ── Documents ── */}
          {filteredDocs.map(doc => (
            <div key={`d-${doc.document_id}`}
              className={cn(rowBase, isSelDoc(doc) ? rowSelected : rowIdle)}
              onClick={() => selectDoc(doc)}
            >
              <div className={colCheck}>
                {!canViewDocContent(doc) ? (
                  <Lock className="h-3.5 w-3.5 text-red-500" />
                ) : (
                  <Checkbox checked={isSelDoc(doc)} className="h-3.5 w-3.5"
                    onCheckedChange={()=>selectDoc(doc)} onClick={e=>e.stopPropagation()} />
                )}
              </div>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <FileIcon fileName={doc.file_name} />
                <span className={cn("truncate text-sm", isDark ? "text-zinc-200" : "text-slate-800")}>{doc.title}</span>
              </div>
              <div className={cn(colDate, isDark ? "text-zinc-500" : "text-slate-400")}>{formatDate(doc.last_modified || doc.created_at)}</div>
              <div className={cn(colSize, isDark ? "text-zinc-500" : "text-slate-400")}>{formatSize(doc.file_size)}</div>
              <div className={colUser}><UserAvatarSmall userId={doc.modified_by || doc.owner_id} /></div>
              <div className={colMenu} onClick={e=>e.stopPropagation()}>
                {currentUserRole === "admin" && canViewDocContent(doc) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className={cn("w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors", isDark ? "text-zinc-400" : "text-slate-400")}>
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className={cn("w-40 text-sm", isDark ? "bg-[#1a1c23] border-zinc-800 text-zinc-200" : "")}>
                      {canDownload(doc) && (
                        <DropdownMenuItem className="text-xs" onClick={()=>handleDownload(doc)}>
                          <Download className="w-3.5 h-3.5 mr-2" /> Download
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="text-xs text-red-500" onClick={()=>{setDocToDelete(doc);setDeleteDocOpen(true)}}>
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}

          {/* Empty */}
          {!loading && filteredFolders.length === 0 && filteredDocs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-sm text-zinc-400">
              <FolderIcon className="w-10 h-10 mb-3 opacity-20" strokeWidth={1} />
              No files or folders yet.
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ──────────────────────────────────────────────── */}
      <div className={cn("w-72 shrink-0 flex flex-col overflow-hidden", isDark ? "bg-[#0f111a] border-l border-zinc-800" : "bg-[#fafafa] border-l border-slate-200")}>
        {!panelItem ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <FolderIcon className="w-12 h-12 mb-3 opacity-10" strokeWidth={1} />
            <p className="text-xs text-zinc-400">Select a file or folder<br />to see its info</p>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-y-auto">

            {/* Tabs */}
            <div className={cn("flex border-b shrink-0", isDark ? "border-zinc-800" : "border-slate-200")}>
              {(["dashboard", "versions", "settings"] as const).map(tab => (
                (tab === "settings" && (
                  panelIsFolder
                    ? currentUserRole !== "admin"
                    : (currentUserRole !== "admin" || !canViewDocContent(panelItem as DocumentItem))
                )) ? null :
                (tab === "versions" && (panelIsFolder || !canViewDocContent(panelItem as DocumentItem))) ? null :
                <button key={tab} onClick={()=>setPanelTab(tab)}
                  className={cn("flex-1 py-2.5 text-xs font-semibold capitalize tracking-wide transition-colors",
                    panelTab === tab
                      ? isDark ? "border-b-2 border-violet-500 text-violet-400" : "border-b-2 border-violet-600 text-violet-600"
                      : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"
                  )}>
                  {tab}
                </button>
              ))}
            </div>

            {/* ── DASHBOARD TAB ── */}
            {panelTab === "dashboard" && (
              <>
                {/* Icon + name */}
                <div className="flex flex-col items-center pt-6 pb-4 px-4">
                  {panelIsFolder
                    ? <FolderIcon className="w-16 h-16 text-amber-400 drop-shadow" fill="currentColor" strokeWidth={0.3} />
                    : <div className={cn("w-20 h-20 rounded-2xl flex items-center justify-center shadow-inner", isDark ? "bg-zinc-800/80" : "bg-slate-100")}>
                        <FileIcon fileName={(panelItem as DocumentItem).file_name} size="lg" />
                      </div>
                  }
                  <p className={cn("mt-3 text-sm font-bold text-center break-all leading-tight", isDark ? "text-white" : "text-slate-900")}>
                    {panelIsFolder ? (panelItem as FolderItem).name : (panelItem as DocumentItem).title}
                  </p>
                </div>

                <div className={cn("mx-4 border-t", isDark ? "border-zinc-800" : "border-slate-200")} />

                {/* Document: access check */}
                {!panelIsFolder && !canViewDocContent(panelItem as DocumentItem) && (
                  <div className="px-4 pt-5">
                    <div className={cn("rounded-xl p-4 flex flex-col items-center text-center gap-2 border", isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-slate-50 border-slate-200")}>
                      <p className={cn("font-bold text-sm mt-1", isDark ? "text-zinc-200" : "text-slate-800")}>You Don't Have Access.</p>
                      <p className={cn("text-xs leading-relaxed", isDark ? "text-zinc-500" : "text-slate-400")}>
                        You do not have the permission to view sharing or editing information for this item.
                      </p>
                    </div>
                  </div>
                )}

                {/* File details */}
                {(panelIsFolder || canViewDocContent(panelItem as DocumentItem)) && (
                <div className="px-4 pt-4 pb-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3">Details</p>
                  <div className="space-y-2.5 text-xs">
                    {!panelIsFolder && (
                      <>
                        <div className="flex justify-between gap-3">
                          <span className="text-zinc-500 font-medium">Description</span>
                          <span className={cn("truncate ml-4 text-right", isDark ? "text-zinc-300" : "text-slate-700")}>
                            {(panelItem as DocumentItem).description?.trim() || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="flex items-center gap-1.5 text-zinc-500 font-medium"><Eye className="w-3.5 h-3.5" /> Views</span>
                          <span className={isDark ? "text-zinc-300" : "text-slate-700"}>—</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="flex items-center gap-1.5 text-zinc-500 font-medium">
                            <FileIcon fileName={(panelItem as DocumentItem).file_name} />
                            Type
                          </span>
                          <span className={isDark ? "text-zinc-300" : "text-slate-700"}>
                            .{(panelItem as DocumentItem).file_name?.split(".").pop()?.toLowerCase() || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500 font-medium">File Size</span>
                          <span className={isDark ? "text-zinc-300" : "text-slate-700"}>{formatSize((panelItem as DocumentItem).file_size)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-500 font-medium">Storage Used</span>
                          <span className={isDark ? "text-zinc-300" : "text-slate-700"}>{formatSize((panelItem as DocumentItem).file_size)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between">
                      <span className="text-zinc-500 font-medium">Location</span>
                      <span className={cn("truncate ml-4 text-right", isDark ? "text-zinc-300" : "text-slate-700")}>
                        {!panelIsFolder && (panelItem as DocumentItem).folder_name
                          ? <span className="text-violet-500">{(panelItem as DocumentItem).folder_name}</span>
                          : "Root"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500 font-medium">Owner</span>
                      <span className={cn("truncate ml-4 text-right", isDark ? "text-zinc-300" : "text-slate-700")}>
                        {getUserName(panelIsFolder ? (panelItem as FolderItem).created_by : (panelItem as DocumentItem).owner_id)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500 font-medium">Modified</span>
                      <span className={isDark ? "text-zinc-300" : "text-slate-700"}>{formatDate(panelItem.last_modified || panelItem.created_at)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500 font-medium">Created</span>
                      <span className={isDark ? "text-zinc-300" : "text-slate-700"}>{formatDate(panelItem.created_at)}</span>
                    </div>
                    {!panelIsFolder && (
                      <div className="flex justify-between">
                        <span className="text-zinc-500 font-medium">Category</span>
                        <span className={isDark ? "text-zinc-300" : "text-slate-700"}>
                          {((panelItem as DocumentItem).tags || []).length > 0
                            ? (panelItem as DocumentItem).tags!.join(", ")
                            : "—"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                )}

                {/* Download button (if permitted) */}
                {!panelIsFolder && canViewDocContent(panelItem as DocumentItem) && canDownload(panelItem as DocumentItem) && (
                  <div className="px-4 pb-4">
                    <button onClick={()=>handleDownload(panelItem as DocumentItem)}
                      className="w-full h-8 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white transition-colors shadow-sm active:scale-95">
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ── VERSIONS TAB ── */}
            {panelTab === "versions" && !panelIsFolder && (
              <div className="px-4 pt-4 pb-6 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Version History</p>
                  {currentUserRole === "admin" && (
                    <button onClick={() => setUploadVersionOpen(true)}
                      className="h-6 px-2.5 rounded bg-violet-600 hover:bg-violet-700 text-white font-semibold text-[10px] transition-colors active:scale-95 flex items-center gap-1">
                      <Plus className="w-3 h-3" /> New
                    </button>
                  )}
                </div>

                {fetchingVersions ? (
                  <p className="text-center text-xs text-zinc-500 py-8">Fetching versions...</p>
                ) : docVersions.length === 0 ? (
                  <p className="text-center text-xs text-zinc-500 py-8">No versions found.</p>
                ) : (
                  <div className="space-y-3">
                    {docVersions.map(v => (
                      <div key={v.version_id} className={cn("p-3 rounded-lg border flex flex-col gap-1.5 text-xs relative",
                        isDark
                          ? v.is_active ? "bg-violet-500/5 border-violet-500/30" : v.is_deleted ? "bg-red-500/5 border-red-500/20 opacity-70" : "bg-zinc-900 border-zinc-800"
                          : v.is_active ? "bg-violet-50 border-violet-200" : v.is_deleted ? "bg-red-50 border-red-100 opacity-70" : "bg-white border-slate-200"
                      )}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold">v{v.version_number}</span>
                          {v.is_active && (
                            <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                              isDark ? "bg-violet-500/20 text-violet-400" : "bg-violet-100 text-violet-700"
                            )}>
                              Active
                            </span>
                          )}
                          {v.is_deleted && (
                            <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400")}>
                              Trash
                            </span>
                          )}
                        </div>
                        
                        <p className="text-[10px] font-medium text-zinc-500 truncate" title={v.file_name}>{v.file_name}</p>
                        
                        <div className="flex flex-col gap-0.5 text-[10px] text-zinc-400 mt-1">
                          <span>Uploaded by {v.uploaded_by_name}</span>
                          <span>{formatDate(v.uploaded_at)}</span>
                        </div>

                        {/* Actions for Admin */}
                        {currentUserRole === "admin" && (
                          <div className="flex items-center gap-1.5 mt-2 border-t pt-2 border-zinc-200 dark:border-zinc-800/60 justify-end">
                            {!v.is_deleted && !v.is_active && (
                              <>
                                <button
                                  onClick={async () => {
                                    try {
                                      const token = localStorage.getItem("access_token")
                                      const res = await fetch(`${apiUrl}/documents/${selectedDoc.document_id}/activate/${v.version_number}`, {
                                        method: "POST", headers: { Authorization: `Bearer ${token}` }
                                      })
                                      if (res.ok) fetchDocVersions(selectedDoc.document_id)
                                    } catch {}
                                  }}
                                  className="h-6 px-2.5 rounded bg-violet-600 hover:bg-violet-700 text-white font-semibold text-[10px] transition-colors shadow-sm active:scale-95"
                                >
                                  Activate
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      const token = localStorage.getItem("access_token")
                                      const res = await fetch(`${apiUrl}/documents/${selectedDoc.document_id}/versions/${v.version_number}/delete`, {
                                        method: "PATCH", headers: { Authorization: `Bearer ${token}` }
                                      })
                                      if (res.ok) fetchDocVersions(selectedDoc.document_id)
                                    } catch {}
                                  }}
                                  className="h-6 px-2.5 rounded bg-red-600/10 hover:bg-red-600/20 text-red-500 font-semibold text-[10px] transition-colors"
                                >
                                  Trash
                                </button>
                              </>
                            )}
                            {v.is_deleted && (
                              <>
                                <button
                                  onClick={async () => {
                                    try {
                                      const token = localStorage.getItem("access_token")
                                      const res = await fetch(`${apiUrl}/documents/${selectedDoc.document_id}/versions/${v.version_number}/restore`, {
                                        method: "PATCH", headers: { Authorization: `Bearer ${token}` }
                                      })
                                      if (res.ok) fetchDocVersions(selectedDoc.document_id)
                                    } catch {}
                                  }}
                                  className="h-6 px-2.5 rounded bg-green-600/10 hover:bg-green-600/20 text-green-500 font-semibold text-[10px] transition-colors"
                                >
                                  Restore
                                </button>
                                <button
                                  onClick={() => {
                                    setPermDeleteVersion(v.version_number)
                                    setPermDeleteOpen(true)
                                  }}
                                  className="h-6 px-2.5 rounded bg-red-600 hover:bg-red-700 text-white font-semibold text-[10px] transition-colors active:scale-95"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── SETTINGS TAB ── */}
            {panelTab === "settings" && currentUserRole === "admin" && (
              <div className="px-4 pt-4 pb-6 space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Settings</p>

                {panelIsFolder ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-zinc-400" />
                      <span className={cn("text-xs font-medium", isDark ? "text-zinc-300" : "text-slate-700")}>Allowed Teams</span>
                      <div onMouseEnter={()=>setShowLockInfo(true)} onMouseLeave={()=>setShowLockInfo(false)}
                        onClick={()=>setShowLockInfo(!showLockInfo)}
                        className="cursor-pointer text-zinc-500 hover:text-zinc-300 transition-colors relative">
                        <Info className="w-3.5 h-3.5" />
                        {showLockInfo && (
                          <div className={cn("absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-52 p-2.5 rounded-lg border shadow-xl z-50 text-[10px] leading-normal font-normal",
                            isDark ? "bg-[#181b24] border-zinc-700 text-zinc-300 shadow-black/80" : "bg-white border-slate-200 text-slate-600")}>
                            <div className="font-semibold mb-1 text-zinc-400 uppercase tracking-widest text-[8px]">Folder Access</div>
                            Users can open this folder only if their team intersects the selected teams. Admins always bypass.
                            <div className={cn("absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4",
                              isDark ? "border-t-[#181b24]" : "border-t-white")} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={cn("rounded-lg border divide-y max-h-40 overflow-y-auto",
                      isDark ? "border-zinc-700 divide-zinc-800" : "border-slate-200 divide-slate-100")}>
                      {projectTeams.length === 0
                        ? <p className="p-2 text-xs text-zinc-400">No teams in this project</p>
                        : projectTeams.map(t => (
                          <div key={t.team_id}
                            onClick={() => setFolderSettingsTeams(p=>({...p,[t.team_id]:!p[t.team_id]}))}
                            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-zinc-800/40 select-none">
                            <div className="shrink-0">
                              {folderSettingsTeams[t.team_id]
                                ? <CheckSquare className="w-3.5 h-3.5 text-violet-500" />
                                : <Square className={cn("w-3.5 h-3.5", isDark ? "text-zinc-600" : "text-slate-300")} />
                              }
                            </div>
                            <span className={cn("text-xs truncate", isDark ? "text-zinc-300" : "text-slate-700")}>{t.name}</span>
                          </div>
                        ))}
                    </div>
                    <button onClick={handleSaveFolderTeams}
                      className="w-full h-8 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors active:scale-95">
                      Save Folder Access
                    </button>
                  </div>
                ) : (
                  /* Document settings */
                  <div className="space-y-4">
                    <div>
                      <p className={cn("text-xs font-medium mb-1.5", isDark ? "text-zinc-300" : "text-slate-700")}>Title</p>
                      <input
                        value={settingsTitle}
                        onChange={e => setSettingsTitle(e.target.value)}
                        className={cn("w-full h-8 px-2.5 text-xs rounded-md border outline-none",
                          isDark ? "bg-zinc-800 border-zinc-700 text-zinc-200" : "bg-white border-slate-300 text-slate-700")}
                        placeholder="Document title"
                      />
                    </div>
                    <div>
                      <p className={cn("text-xs font-medium mb-1.5", isDark ? "text-zinc-300" : "text-slate-700")}>Description</p>
                      <textarea
                        value={settingsDescription}
                        onChange={e => setSettingsDescription(e.target.value)}
                        rows={2}
                        className={cn("w-full px-2.5 py-1.5 text-xs rounded-md border outline-none resize-none",
                          isDark ? "bg-zinc-800 border-zinc-700 text-zinc-200" : "bg-white border-slate-300 text-slate-700")}
                        placeholder="Description"
                      />
                    </div>
                    <div>
                      <p className={cn("text-xs font-medium mb-1.5", isDark ? "text-zinc-300" : "text-slate-700")}>Tags</p>
                      <input
                        value={settingsTags}
                        onChange={e => setSettingsTags(e.target.value)}
                        className={cn("w-full h-8 px-2.5 text-xs rounded-md border outline-none",
                          isDark ? "bg-zinc-800 border-zinc-700 text-zinc-200" : "bg-white border-slate-300 text-slate-700")}
                        placeholder="tag1, tag2"
                      />
                    </div>
                    <AccessSelect label="Download Access" value={settingsDownload} onChange={setSettingsDownload} />
                    <AccessSelect label="Search Access" value={settingsSearch} onChange={setSettingsSearch} />

                    <div>
                      <p className={cn("text-xs font-medium mb-2", isDark ? "text-zinc-300" : "text-slate-700")}>Allowed Teams</p>
                      <div className={cn("rounded-lg border divide-y max-h-36 overflow-y-auto",
                        isDark ? "border-zinc-700 divide-zinc-800" : "border-slate-200 divide-slate-100")}>
                        {projectTeams.length === 0
                          ? <p className="p-2 text-xs text-zinc-400">No teams in this project</p>
                          : projectTeams.map(t => (
                            <div key={t.team_id}
                              onClick={() => setSettingsTeams(p=>({...p,[t.team_id]:!p[t.team_id]}))}
                              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-zinc-800/40 select-none">
                              <div className="shrink-0">
                                {settingsTeams[t.team_id]
                                  ? <CheckSquare className="w-3.5 h-3.5 text-violet-500" />
                                  : <Square className={cn("w-3.5 h-3.5", isDark ? "text-zinc-600" : "text-slate-300")} />
                                }
                              </div>
                              <span className={cn("text-xs truncate", isDark ? "text-zinc-300" : "text-slate-700")}>{t.name}</span>
                            </div>
                          ))}
                      </div>
                    </div>

                    {settingsError && <p className="text-xs text-red-400">{settingsError}</p>}

                    <button onClick={handleSaveSettings} disabled={settingsSaving}
                      className="w-full h-8 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors active:scale-95 disabled:opacity-50">
                      {settingsSaving ? "Saving…" : "Save Changes"}
                    </button>

                    {/* Version info */}
                    <div className={cn("pt-3 border-t space-y-1", isDark ? "border-zinc-800" : "border-slate-200")}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Version</p>
                      <p className={cn("text-xs font-medium", isDark ? "text-zinc-300" : "text-slate-700")}>
                        v{(panelItem as DocumentItem).active_version}
                      </p>
                      <p className="text-[10px] text-zinc-500 truncate">{(panelItem as DocumentItem).file_name}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════ MODALS ═══════════════════════════════ */}

      {/* Create folder */}
      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent className={cn("sm:max-w-sm", isDark ? "bg-[#181b24] border-zinc-800 text-white" : "")}>
          <DialogHeader><DialogTitle className="text-sm">New folder</DialogTitle></DialogHeader>
          <input value={newFolderName} onChange={e=>setNewFolderName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleCreateFolder()} placeholder="Folder name"
            className={cn("w-full h-9 px-3 text-sm rounded-md border outline-none mt-1",
              isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" : "border-slate-300")} />
          <div>
            <p className={cn("text-xs font-medium mb-2 mt-2", isDark ? "text-zinc-300" : "text-slate-700")}>Allowed Teams</p>
            <div className={cn("rounded-lg border divide-y max-h-36 overflow-y-auto",
              isDark ? "border-zinc-700 divide-zinc-800" : "border-slate-200 divide-slate-100")}>
              {projectTeams.length === 0
                ? <p className="p-2 text-xs text-zinc-400">No teams in this project</p>
                : projectTeams.map(t => (
                  <div key={t.team_id}
                    onClick={() => setNewFolderTeams(p=>({...p,[t.team_id]:!p[t.team_id]}))}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-zinc-800/40 select-none">
                    <div className="shrink-0">
                      {newFolderTeams[t.team_id]
                        ? <CheckSquare className="w-3.5 h-3.5 text-violet-500" />
                        : <Square className={cn("w-3.5 h-3.5", isDark ? "text-zinc-600" : "text-slate-300")} />
                      }
                    </div>
                    <span className={cn("text-xs truncate", isDark ? "text-zinc-300" : "text-slate-700")}>{t.name}</span>
                  </div>
                ))}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">No team selected means admin-only access.</p>
          </div>
          {folderError && <p className="text-xs text-red-400 mt-1">{folderError}</p>}
          <DialogFooter className="mt-2">
            <button onClick={()=>setCreateFolderOpen(false)} className="h-8 px-4 rounded-md text-sm border border-zinc-300 dark:border-zinc-700">Cancel</button>
            <button onClick={handleCreateFolder} className="h-8 px-4 rounded-md text-sm bg-violet-600 hover:bg-violet-700 text-white font-semibold">Create</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename folder */}
      <Dialog open={renameFolderOpen} onOpenChange={setRenameFolderOpen}>
        <DialogContent className={cn("sm:max-w-sm", isDark ? "bg-[#181b24] border-zinc-800 text-white" : "")}>
          <DialogHeader><DialogTitle className="text-sm">Rename folder</DialogTitle></DialogHeader>
          <input value={renameName} onChange={e=>setRenameName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleRenameFolder()} placeholder="New name"
            className={cn("w-full h-9 px-3 text-sm rounded-md border outline-none mt-1",
              isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" : "border-slate-300")} />
          <DialogFooter className="mt-2">
            <button onClick={()=>setRenameFolderOpen(false)} className="h-8 px-4 rounded-md text-sm border border-zinc-300 dark:border-zinc-700">Cancel</button>
            <button onClick={handleRenameFolder} className="h-8 px-4 rounded-md text-sm bg-violet-600 hover:bg-violet-700 text-white font-semibold">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete folder */}
      <Dialog open={deleteFolderOpen} onOpenChange={setDeleteFolderOpen}>
        <DialogContent className={cn("sm:max-w-sm", isDark ? "bg-[#181b24] border-zinc-800 text-white" : "")}>
          <DialogHeader>
            <DialogTitle className="text-sm">Delete folder</DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 mt-1">Delete <strong>"{folderToDelete?.name}"</strong>?</DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-xs mt-1 cursor-pointer">
            <Checkbox checked={deleteDocsInFolder} onCheckedChange={c=>setDeleteDocsInFolder(!!c)} className="h-3.5 w-3.5" />
            Also move all documents inside to trash
          </label>
          <DialogFooter className="mt-3">
            <button onClick={()=>setDeleteFolderOpen(false)} className="h-8 px-4 rounded-md text-sm border border-zinc-300 dark:border-zinc-700">Cancel</button>
            <button onClick={handleDeleteFolder} className="h-8 px-4 rounded-md text-sm bg-red-600 hover:bg-red-700 text-white font-semibold">Delete</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete document */}
      <Dialog open={deleteDocOpen} onOpenChange={setDeleteDocOpen}>
        <DialogContent className={cn("sm:max-w-sm", isDark ? "bg-[#181b24] border-zinc-800 text-white" : "")}>
          <DialogHeader>
            <DialogTitle className="text-sm">Move to trash</DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 mt-1">
              Move <strong>"{docToDelete?.title}"</strong> to trash? You can restore it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-3">
            <button onClick={()=>setDeleteDocOpen(false)} className="h-8 px-4 rounded-md text-sm border border-zinc-300 dark:border-zinc-700">Cancel</button>
            <button onClick={handleDeleteDoc} disabled={deleteDocLoading}
              className="h-8 px-4 rounded-md text-sm bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50">
              {deleteDocLoading ? "Deleting…" : "Move to Trash"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Locked folder info */}
      <Dialog open={lockModalOpen} onOpenChange={setLockModalOpen}>
        <DialogContent className={cn("sm:max-w-md p-6 rounded-xl border backdrop-blur-md",
          isDark ? "bg-[#12141a]/95 border-zinc-800 text-white shadow-2xl shadow-black/80" : "bg-white/95 border-slate-200 text-slate-900 shadow-2xl shadow-slate-200")}>
          <DialogHeader className="flex flex-col items-center text-center">
            <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mb-3 border",
              isDark ? "bg-red-500/10 border-red-500/30 text-red-500" : "bg-red-50 border-red-200 text-red-600")}>
              <Lock className="w-6 h-6 animate-pulse" />
            </div>
            <DialogTitle className="text-lg font-bold tracking-tight">Folder is Locked</DialogTitle>
            <DialogDescription className={cn("text-xs mt-1 max-w-sm", isDark ? "text-zinc-400" : "text-slate-500")}>
              You are not in the allowed teams for folder <strong className={isDark ? "text-zinc-200" : "text-slate-800"}>"{lockedFolderInfo?.name}"</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className={cn("my-4 p-4 rounded-lg border text-xs leading-relaxed space-y-2.5",
            isDark ? "bg-zinc-900/60 border-zinc-800 text-zinc-300" : "bg-slate-50 border-slate-100 text-slate-600")}>
            <div className="flex gap-2">
              <span className="font-semibold text-red-500 shrink-0">Access Rule:</span>
              <span>Users can open this folder only when at least one of their teams matches the folder allowed teams.</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-violet-500 shrink-0">Admin Access:</span>
              <span>Project admins always bypass team restrictions for folder access and management.</span>
            </div>
          </div>
          <DialogFooter className="flex sm:justify-center">
            <button onClick={()=>setLockModalOpen(false)}
              className="h-9 px-6 rounded-md text-xs font-semibold tracking-wide transition-all shadow-md active:scale-95 hover:brightness-110 bg-violet-600 text-white">
              Acknowledge
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════ UPLOAD MODAL ══════════════════════════════════ */}
      <Dialog open={uploadOpen} onOpenChange={v=>{if(!v)resetUpload();setUploadOpen(v)}}>
        <DialogContent className={cn(
          "sm:max-w-lg w-full p-0 overflow-hidden rounded-2xl border",
          isDark ? "bg-[#12141a] border-zinc-800 text-white" : "bg-white border-slate-200 text-slate-900"
        )}>
          {/* Header */}
          <div className={cn("flex items-center justify-between px-5 py-4 border-b", isDark ? "border-zinc-800" : "border-slate-200")}>
            <div>
              <h2 className="text-sm font-bold">Upload Document</h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">Fill in details, select teams, then upload your file.</p>
            </div>
          </div>

          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">

            {/* Drop zone */}
            <div
              onDragOver={e=>{e.preventDefault();setIsDragOver(true)}}
              onDragLeave={()=>setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={()=>fileInputRef.current?.click()}
              className={cn(
                "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-7 cursor-pointer transition-all",
                isDragOver
                  ? "border-violet-500 bg-violet-500/10 scale-[1.01]"
                  : uploadFile
                    ? isDark ? "border-green-600/60 bg-green-900/10" : "border-green-500/60 bg-green-50"
                    : isDark ? "border-zinc-700 hover:border-zinc-500 bg-zinc-900/40" : "border-slate-200 hover:border-slate-300 bg-slate-50"
              )}
            >
              <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md" className="hidden"
                onChange={e=>{ const f=e.target.files?.[0]; if(f) handleFileSelect(f) }} />
              {uploadFile ? (
                <>
                  <FileIcon fileName={uploadFile.name} size="lg" />
                  <p className={cn("text-xs font-semibold mt-1", isDark ? "text-zinc-200" : "text-slate-700")}>{uploadFile.name}</p>
                  <p className="text-[10px] text-zinc-400">{formatSize(uploadFile.size)}</p>
                  <button onClick={e=>{e.stopPropagation();setUploadFile(null);setUploadTitle("")}}
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </>
              ) : (
                <>
                  <Upload className={cn("w-7 h-7", isDark ? "text-zinc-500" : "text-slate-300")} />
                  <div className="text-center">
                    <p className={cn("text-xs font-semibold", isDark ? "text-zinc-300" : "text-slate-600")}>
                      Click here to upload your file or drag.
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-1">Supported Format: pdf, txt, md (upto 5mb each)</p>
                  </div>
                </>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Title *</label>
              <input value={uploadTitle} onChange={e=>setUploadTitle(e.target.value)} placeholder="Document title"
                className={cn("w-full h-9 px-3 text-sm rounded-lg border outline-none mt-1.5",
                  isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400")} />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Description</label>
              <textarea value={uploadDescription} onChange={e=>setUploadDescription(e.target.value)} placeholder="Optional description" rows={2}
                className={cn("w-full px-3 py-2 text-sm rounded-lg border outline-none mt-1.5 resize-none",
                  isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400")} />
            </div>

            {/* Tags */}
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Tags</label>
              <input value={uploadTags} onChange={e=>setUploadTags(e.target.value)} placeholder="e.g. report, finance (comma separated)"
                className={cn("w-full h-9 px-3 text-sm rounded-lg border outline-none mt-1.5",
                  isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-400")} />
            </div>

            {/* Access levels row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Download Access</label>
                <div className="relative mt-1.5">
                  <select value={uploadDownloadAccess} onChange={e=>setUploadDownloadAccess(e.target.value as any)}
                    className={cn("w-full appearance-none h-9 pl-3 pr-7 text-sm rounded-lg border outline-none cursor-pointer",
                      isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100" : "bg-white border-slate-300 text-slate-900")}>
                    <option value="member">Member</option>
                    <option value="admin">Admin Only</option>
                    <option value="none">None</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-zinc-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Search Access</label>
                <div className="relative mt-1.5">
                  <select value={uploadSearchAccess} onChange={e=>setUploadSearchAccess(e.target.value as any)}
                    className={cn("w-full appearance-none h-9 pl-3 pr-7 text-sm rounded-lg border outline-none cursor-pointer",
                      isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100" : "bg-white border-slate-300 text-slate-900")}>
                    <option value="member">Member</option>
                    <option value="admin">Admin Only</option>
                    <option value="none">None</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-zinc-400" />
                </div>
              </div>
            </div>

            {/* Teams */}
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Allowed Teams * <span className="normal-case font-normal text-zinc-500">(select at least one)</span>
              </label>
              <div className={cn("mt-1.5 rounded-xl border divide-y overflow-hidden",
                isDark ? "border-zinc-700 divide-zinc-800" : "border-slate-200 divide-slate-100")}>
                {projectTeams.length === 0 ? (
                  <p className="p-3 text-xs text-zinc-400">No teams found in this project.</p>
                ) : projectTeams.map(team => (
                  <div key={team.team_id}
                    onClick={() => setSelectedTeams(p=>({...p,[team.team_id]:!p[team.team_id]}))}
                    className={cn("flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors select-none",
                      selectedTeams[team.team_id]
                        ? isDark ? "bg-violet-600/10" : "bg-violet-50"
                        : isDark ? "hover:bg-zinc-800/60" : "hover:bg-slate-50"
                    )}>
                    <div className="shrink-0">
                      {selectedTeams[team.team_id]
                        ? <CheckSquare className="w-4 h-4 text-violet-500" />
                        : <Square className={cn("w-4 h-4", isDark ? "text-zinc-600" : "text-slate-300")} />
                      }
                    </div>
                    <span className={cn("text-sm truncate", isDark ? "text-zinc-200" : "text-slate-700")}>{team.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {uploadError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <X className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {uploadError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={cn("flex items-center justify-between px-5 py-4 border-t gap-3", isDark ? "border-zinc-800 bg-[#0e1016]" : "border-slate-200 bg-slate-50")}>
            <button onClick={()=>{resetUpload();setUploadOpen(false)}}
              className={cn("h-9 px-5 rounded-lg text-sm font-medium border transition-colors",
                isDark ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800" : "border-slate-300 text-slate-600 hover:bg-slate-100")}>
              Cancel
            </button>
            <button
              onClick={handleUploadSubmit}
              disabled={!uploadFile || !uploadTitle.trim() || Object.values(selectedTeams).every(v=>!v) || uploadLoading}
              className="h-9 px-6 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-md">
              {uploadLoading ? "Uploading…" : "Upload File"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Version Dialog */}
      <Dialog open={uploadVersionOpen} onOpenChange={v=>{if(!v){setUploadVerFile(null);setUploadVerError("")};setUploadVersionOpen(v)}}>
        <DialogContent className={cn("sm:max-w-sm", isDark ? "bg-[#181b24] border-zinc-800 text-white" : "")}>
          <DialogHeader>
            <DialogTitle className="text-sm">Upload New Version</DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Select a new PDF, TXT, or MD file to upload as the latest version of this document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div
              onClick={() => verFileInputRef.current?.click()}
              className={cn("border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center",
                uploadVerFile
                  ? isDark ? "border-green-600/60 bg-green-900/10" : "border-green-500/60 bg-green-50"
                  : isDark ? "border-zinc-700 bg-zinc-900/40 hover:border-zinc-500" : "border-slate-200 bg-slate-50 hover:border-slate-300"
              )}
            >
              <input
                ref={verFileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) {
                    if (f.size > 5 * 1024 * 1024) { setUploadVerError("File exceeds 5MB limit."); return }
                    const ext = f.name.split(".").pop()?.toLowerCase()
                    if (!["pdf","txt","md"].includes(ext||"")) { setUploadVerError("Supported formats: PDF, TXT, MD"); return }
                    setUploadVerError("")
                    setUploadVerFile(f)
                  }
                }}
              />
              <Upload className="w-5 h-5 text-zinc-400" />
              <span className="text-xs font-semibold">{uploadVerFile ? uploadVerFile.name : "Select file"}</span>
              {uploadVerFile && <span className="text-[10px] text-zinc-400">{formatSize(uploadVerFile.size)}</span>}
            </div>

            {uploadVerError && <p className="text-xs text-red-400">{uploadVerError}</p>}
          </div>
          <DialogFooter className="mt-4">
            <button onClick={() => setUploadVersionOpen(false)} className="h-8 px-4 rounded-md text-sm border border-zinc-300 dark:border-zinc-700">Cancel</button>
            <button onClick={handleUploadVersionSubmit} disabled={!uploadVerFile || uploadVerLoading}
              className="h-8 px-4 rounded-md text-sm bg-violet-600 hover:bg-violet-700 text-white font-semibold disabled:opacity-50">
              {uploadVerLoading ? "Uploading..." : "Upload"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete Version Dialog */}
      <Dialog open={permDeleteOpen} onOpenChange={setPermDeleteOpen}>
        <DialogContent className={cn("sm:max-w-sm", isDark ? "bg-[#181b24] border-zinc-800 text-white" : "")}>
          <DialogHeader>
            <DialogTitle className="text-sm">Delete Version Permanently</DialogTitle>
            <DialogDescription className="text-xs text-zinc-400 mt-1">
              Are you sure you want to permanently delete version <strong>v{permDeleteVersion}</strong> of this document? This action is irreversible and the file will be removed from storage.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-3">
            <button onClick={() => setPermDeleteOpen(false)} className="h-8 px-4 rounded-md text-sm border border-zinc-300 dark:border-zinc-700">Cancel</button>
            <button onClick={handlePermDeleteSubmit} disabled={permDeleteLoading}
              className="h-8 px-4 rounded-md text-sm bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50">
              {permDeleteLoading ? "Deleting..." : "Delete Permanently"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
