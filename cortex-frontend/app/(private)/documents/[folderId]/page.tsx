"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { useRouter, useParams } from "next/navigation"
import {
  File,
  Image as ImageIcon,
  FileText,
  Search,
  MoreVertical,
  Upload,
  ChevronRight,
  FolderOpen,
  Folder as FolderIcon
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/protected-route"

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
  version: number
  file_name: string
  file_size: number
}

type UserInfo = {
  name: string
  avatar_url?: string
}

export default function FolderPage() {
  const router = useRouter()
  const params = useParams()
  const { user } = useAuth()
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)

  const folderId = params.folderId as string

  useEffect(() => { setMounted(true) }, [])
  const isDark = mounted && theme === "dark"
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [folderName, setFolderName] = useState("")
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [avatars, setAvatars] = useState<Record<string, string | null>>({})
  const [userMap, setUserMap] = useState<Record<number, UserInfo>>({})
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null)

  const selectDoc = (d: DocumentItem) => {
    if (selectedDoc?.document_id === d.document_id) {
      setSelectedDoc(null)
    } else {
      setSelectedDoc(d)
    }
  }

  const fetchFolderData = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem("access_token")
      if (!token) return

      const res = await fetch(`${apiUrl}/folders/${folderId}/documents`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        if (res.status === 403) {
          alert("You do not have access to this folder.")
          router.push("/documents")
          return
        }
        throw new Error()
      }

      const data = await res.json()
      setFolderName(data.folder_name || "Folder")

      const docs: DocumentItem[] = Array.isArray(data.documents) ? data.documents : []
      setDocuments(docs)

      const ids = new Set<number>()
      docs.forEach(d => { ids.add(d.owner_id); if (d.modified_by) ids.add(d.modified_by) })

      const uniqueIds = Array.from(ids).filter(Boolean)
      if (uniqueIds.length > 0) {
        const q = uniqueIds.map(id => `user_ids=${id}`).join("&")
        const aRes = await fetch(`${apiUrl}/users/avatars?force_refresh=false&${q}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (aRes.ok) {
          const aData = await aRes.json()
          setAvatars(aData.avatars || {})
          
          const namesMap: Record<number, UserInfo> = {}
          if (aData.names) {
            Object.entries(aData.names).forEach(([uidStr, nameVal]) => {
              const uid = parseInt(uidStr)
              namesMap[uid] = { name: nameVal as string, avatar_url: (aData.avatars || {})[uidStr] }
            })
          }
          setUserMap(namesMap)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchFolderData() }, [folderId])

  const filteredDocs = documents.filter(d =>
    (d.title || d.file_name).toLowerCase().includes(query.toLowerCase())
  )

  const formatSize = (bytes: number) => {
    if (!bytes) return "--"
    const k = 1024, sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
  }

  const formatDate = (s: string) => {
    if (!s) return "--"
    const d = new Date(s)
    return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getFullYear()).slice(2)}`
  }

  const getUserName = (id?: number) => {
    if (!id) return "—"
    if (id === user?.user_id) return user?.name || `User ${id}`
    return userMap[id]?.name || `User ${id}`
  }

  const getFileIcon = (fileName?: string) => {
    if (!fileName) return <File className="w-4 h-4 text-zinc-400" />
    const ext = fileName.split(".").pop()?.toLowerCase()
    if (["jpg","png","jpeg","gif","webp"].includes(ext||"")) return <ImageIcon className="w-4 h-4 text-blue-400" />
    if (ext === "pdf") return <FileText className="w-4 h-4 text-red-400" />
    return <File className="w-4 h-4 text-zinc-400" />
  }

  const UserAvatarSmall = ({ userId }: { userId?: number }) => {
    if (!userId) return null
    const url = avatars[String(userId)]
    const name = getUserName(userId)
    const initials = name.split(" ").filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase() || "?"
    return (
      <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center shrink-0 bg-zinc-300 dark:bg-zinc-700 text-[10px] font-bold text-zinc-700 dark:text-zinc-200">
        {url
          ? <img src={url} alt={name} className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display="none" }} />
          : initials
        }
      </div>
    )
  }

  const rowBase = "flex items-center h-10 text-sm border-b cursor-pointer select-none transition-colors"
  const rowIdle = isDark
    ? "border-zinc-800 hover:bg-zinc-800/60"
    : "border-slate-100 hover:bg-slate-50"
  const rowSelected = isDark ? "bg-zinc-800 border-zinc-700" : "bg-slate-100 border-slate-200"

  const colDate = "w-20 text-center text-xs tabular-nums"
  const colSize = "w-20 text-center text-xs tabular-nums"
  const colUser = "w-10 flex justify-center"
  const colMenu = "w-10 flex justify-center"
  const colCheck = "w-9 flex justify-center"

  return (
    <div className="flex -mx-6 -mt-8 -mb-8 h-[calc(100vh-64px)]">
      {/* ── MAIN LIST ──────────────────────────────────────────── */}
      <div className={cn(
        "flex flex-col flex-1 min-w-0 overflow-hidden border-r",
        isDark ? "bg-[#0d0f14] border-zinc-800" : "bg-white border-slate-200"
      )}>
        {/* Top bar — two rows so path never shrinks the search */}
        <div className={cn(
          "flex flex-col border-b shrink-0",
          isDark ? "border-zinc-800 bg-[#0d0f14]" : "border-slate-200 bg-white"
        )}>
          {/* Row 1: breadcrumb path */}
          <div className="flex items-center gap-1 px-4 h-8 text-sm">
            <button
              onClick={() => router.push("/documents")}
              className={cn("font-semibold hover:underline transition-colors", isDark ? "text-zinc-400 hover:text-white" : "text-slate-500 hover:text-slate-900")}
            >
              Documents
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className={cn("font-bold truncate", isDark ? "text-white" : "text-slate-900")}>{folderName}</span>
          </div>

          {/* Row 2: search + upload */}
          <div className="flex items-center gap-2 px-4 pb-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search documents…"
                className={cn(
                  "w-full h-8 pl-8 pr-3 text-sm rounded-md border outline-none",
                  isDark
                    ? "bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-500"
                    : "bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400"
                )}
              />
            </div>
            <button className={cn(
              "flex items-center gap-1 h-8 px-3 rounded-md text-sm font-semibold whitespace-nowrap",
              "bg-violet-600 hover:bg-violet-700 text-white transition-colors"
            )}>
              <Upload className="w-3.5 h-3.5" /> Upload
            </button>
          </div>
        </div>

        {/* Column headers */}
        <div className={cn(
          "flex items-center h-8 text-[11px] font-semibold uppercase tracking-wider shrink-0 border-b",
          isDark ? "text-zinc-500 border-zinc-800 bg-[#0d0f14]" : "text-slate-400 border-slate-100 bg-white"
        )}>
          <div className="flex-1 pl-4">Name</div>
          <div className={colDate}>Modified</div>
          <div className={colSize}>Size</div>
          <div className={colUser}>By</div>
          <div className={colMenu}></div>
        </div>

        {/* Scrollable rows */}
        <div className="flex-1 overflow-y-auto">
          {filteredDocs.map(doc => (
            <div
              key={`d-${doc.document_id}`}
              className={cn(rowBase, selectedDoc?.document_id === doc.document_id ? rowSelected : rowIdle)}
              onClick={() => selectDoc(doc)}
            >
              <div className="flex-1 flex items-center gap-2 min-w-0 pl-4">
                {getFileIcon(doc.file_name)}
                <span className={cn("truncate text-sm", isDark ? "text-zinc-200" : "text-slate-800")}>{doc.title}</span>
              </div>
              <div className={cn(colDate, isDark ? "text-zinc-500" : "text-slate-400")}>{formatDate(doc.last_modified || doc.created_at)}</div>
              <div className={cn(colSize, isDark ? "text-zinc-500" : "text-slate-400")}>{formatSize(doc.file_size)}</div>
              <div className={colUser}><UserAvatarSmall userId={doc.modified_by || doc.owner_id} /></div>
              <div className={colMenu}>
                <button className={cn(
                  "w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors",
                  isDark ? "text-zinc-400" : "text-slate-400"
                )}>
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {!loading && filteredDocs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-sm text-zinc-400">
              <FolderOpen className="w-10 h-10 mb-3 opacity-20" strokeWidth={1} />
              This folder is empty.
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────── */}
      <div className={cn(
        "w-64 shrink-0 flex flex-col overflow-y-auto",
        isDark ? "bg-[#0f111a] border-l border-zinc-800" : "bg-[#fafafa] border-l border-slate-200"
      )}>
        {!selectedDoc ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <FolderIcon className="w-12 h-12 mb-3 opacity-10" strokeWidth={1} />
            <p className="text-xs text-zinc-400">Select a document<br />to see its info</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center pt-8 pb-4 px-4">
              <div className={cn("w-20 h-20 rounded-xl flex items-center justify-center", isDark ? "bg-zinc-800" : "bg-slate-100")}>
                {getFileIcon(selectedDoc.file_name)}
              </div>
              <p className={cn("mt-3 text-sm font-semibold text-center break-all", isDark ? "text-white" : "text-slate-900")}>
                {selectedDoc.title}
              </p>
            </div>

            <div className={cn("mx-4 border-t", isDark ? "border-zinc-800" : "border-slate-200")} />

            {/* INFO */}
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3">Info</p>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-medium">Type</span>
                  <span className={isDark ? "text-zinc-300" : "text-slate-700"}>Document</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-medium">Size</span>
                  <span className={isDark ? "text-zinc-300" : "text-slate-700"}>{formatSize(selectedDoc.file_size)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-medium">Owner</span>
                  <span className={isDark ? "text-zinc-300" : "text-slate-700"}>{getUserName(selectedDoc.owner_id)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-medium">Location</span>
                  <span className="text-violet-500">{folderName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-medium">Modified</span>
                  <span className={isDark ? "text-zinc-300" : "text-slate-700"}>{formatDate(selectedDoc.last_modified || selectedDoc.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-medium">By</span>
                  <span className={isDark ? "text-zinc-300" : "text-slate-700"}>{getUserName(selectedDoc.modified_by || selectedDoc.owner_id)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-medium">Created</span>
                  <span className={isDark ? "text-zinc-300" : "text-slate-700"}>{formatDate(selectedDoc.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-medium">Version</span>
                  <span className={isDark ? "text-zinc-300" : "text-slate-700"}>v{selectedDoc.version}</span>
                </div>
              </div>
            </div>

            <div className={cn("mx-4 mt-4 border-t", isDark ? "border-zinc-800" : "border-slate-200")} />

            {/* SETTINGS */}
            <div className="px-4 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-3">Settings</p>
              <div className="space-y-3">
                {["File Sharing", "Backup", "Sync"].map((label, i) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className={cn("text-xs font-medium", isDark ? "text-zinc-300" : "text-slate-700")}>{label}</span>
                    <div className={cn(
                      "w-8 h-4 rounded-full relative cursor-pointer transition-colors",
                      i === 0 ? "bg-violet-500" : (isDark ? "bg-zinc-700" : "bg-slate-200")
                    )}>
                      <div className={cn(
                        "absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all",
                        i === 0 ? "right-0.5" : "left-0.5"
                      )} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
