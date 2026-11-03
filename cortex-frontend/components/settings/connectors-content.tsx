"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { X, Check } from "lucide-react"

interface IntegrationStatus {
  id: number
  provider: string
  type: string
  connected: boolean
  account_email: string | null
  created_at: string | null
}

export default function ConnectorsSettingsContent({ onClose }: { onClose?: () => void }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [loadingIntegrations, setLoadingIntegrations] = useState(true)
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null)
  const [connectorFilter, setConnectorFilter] = useState<"all" | "connected" | "not_connected">("all")
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  const isDark = mounted && theme === "dark"

  const apiUrl = process.env.NEXT_PUBLIC_API_URL!
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null

  useEffect(() => {
    const success = searchParams.get("success")
    const error = searchParams.get("error")
    if (success === "gmail_connected") {
      setNoticeMessage("✓ Google Gmail account connected successfully!")
    } else if (success === "github_connected") {
      setNoticeMessage("✓ GitHub App connected successfully! Cortex can now access your selected repositories.")
    } else if (error) {
      setNoticeMessage(`⚠️ Connection error: ${error}`)
    }
  }, [searchParams])

  const fetchIntegrations = async () => {
    if (!token) return
    setLoadingIntegrations(true)
    try {
      const res = await fetch(`${apiUrl}/api/integrations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setIntegrations(data)
      }
    } catch (err) {
      console.error("Failed to fetch integrations:", err)
    } finally {
      setLoadingIntegrations(false)
    }
  }

  useEffect(() => {
    fetchIntegrations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleConnectGmail = () => {
    if (!token) {
      alert("Please log in first.")
      return
    }
    window.location.href = `${apiUrl}/api/integrations/google/connect?token=${encodeURIComponent(token)}`
  }

  const handleDisconnectGmail = async () => {
    if (!token) return
    if (!confirm("Are you sure you want to disconnect your Gmail account?")) return

    try {
      const res = await fetch(`${apiUrl}/api/integrations/google/gmail`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setNoticeMessage("Gmail integration disconnected.")
        await fetchIntegrations()
      } else {
        const err = await res.json()
        alert(`Error: ${err.detail || "Failed to disconnect"}`)
      }
    } catch (err: unknown) {
      alert(`Error disconnecting: ${err instanceof Error ? err.message : "Unknown error"}`)
    }
  }

  const handleConnectGitHub = () => {
    if (!token) {
      alert("Please log in first.")
      return
    }
    window.location.href = `${apiUrl}/api/integrations/github/connect?token=${encodeURIComponent(token)}`
  }

  const handleDisconnectGitHub = async () => {
    if (!token) return
    if (!confirm("Are you sure you want to disconnect your GitHub account?")) return

    try {
      const res = await fetch(`${apiUrl}/api/integrations/github`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setNoticeMessage("GitHub integration disconnected.")
        await fetchIntegrations()
      } else {
        const err = await res.json()
        alert(`Error: ${err.detail || "Failed to disconnect"}`)
      }
    } catch (err: unknown) {
      alert(`Error disconnecting: ${err instanceof Error ? err.message : "Unknown error"}`)
    }
  }

  const gmailIntegration = integrations.find(
    (i) => i.provider === "google" && i.type === "gmail" && i.connected
  )
  const isGmailConnected = !!gmailIntegration

  const githubIntegration = integrations.find(
    (i) => i.provider === "github" && i.connected
  )
  const isGitHubConnected = !!githubIntegration

  const allConnectorsList = [
    {
      id: "github",
      name: "GitHub Integration",
      description: "GitHub App — choose which repositories Cortex can access",
      icon: "/icons/github.svg",
      type: "Web",
      connected: isGitHubConnected,
      email: githubIntegration?.account_email || null,
    },
    {
      id: "gmail",
      name: "Google Gmail",
      icon: "/icons/gmail.svg",
      type: "Web",
      connected: isGmailConnected,
      email: gmailIntegration?.account_email || null,
    },
  ]

  const filteredConnectors = allConnectorsList.filter((c) => {
    if (connectorFilter === "connected") return c.connected
    if (connectorFilter === "not_connected") return !c.connected
    return true
  })

  return (
    <div className="space-y-6">
      {noticeMessage && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs">
          <span>{noticeMessage}</span>
          <button onClick={() => setNoticeMessage(null)} className="text-zinc-400 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between pb-4 border-b border-border/40">
        <h2 className={cn("text-xl font-bold", isDark ? "text-white" : "text-slate-900")}>Connectors</h2>
        <button
          onClick={onClose ?? (() => router.push("/settings"))}
          className={cn(
            "p-1.5 rounded-lg transition-colors",
            isDark ? "text-zinc-400 hover:text-white hover:bg-zinc-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          )}
          aria-label="Close connector settings"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <p className={cn("text-xs font-semibold uppercase tracking-wider", isDark ? "text-zinc-400" : "text-slate-500")}>Popular</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className={cn("border rounded-xl p-4 flex items-center justify-between shadow-xs", isDark ? "bg-[#181a24] border-zinc-800/80" : "bg-white border-slate-200")}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn("w-8 h-8 rounded-lg border flex items-center justify-center overflow-hidden shrink-0", isDark ? "bg-zinc-900 border-zinc-800" : "bg-slate-100 border-slate-200")}>
                <img src="/icons/github.svg" alt="GitHub" className={cn("w-5 h-5 object-contain", isDark && "invert")} />
              </div>
              <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>GitHub</p>
            </div>

            {isGitHubConnected && (
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-semibold flex items-center gap-1 shrink-0">
                <Check className="h-3 w-3" /> Connected
              </span>
            )}
          </div>

          <div className={cn("border rounded-xl p-4 flex items-center justify-between shadow-xs", isDark ? "bg-[#181a24] border-zinc-800/80" : "bg-white border-slate-200")}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn("w-8 h-8 rounded-lg border flex items-center justify-center overflow-hidden shrink-0", isDark ? "bg-zinc-900 border-zinc-800" : "bg-slate-100 border-slate-200")}>
                <img src="/icons/gmail.svg" alt="Gmail" className="w-5 h-5 object-contain" />
              </div>
              <p className={cn("text-sm font-semibold", isDark ? "text-white" : "text-slate-900")}>Email</p>
            </div>

            {isGmailConnected && (
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-semibold flex items-center gap-1 shrink-0">
                <Check className="h-3 w-3" /> Connected
              </span>
            )}
          </div>
        </div>
      </div>

      <div className={cn("flex items-center gap-4 border-b pb-2", isDark ? "border-zinc-800/80" : "border-slate-200")}>
        {[
          { id: "all", label: "All" },
          { id: "connected", label: "Connected" },
          { id: "not_connected", label: "Not connected" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setConnectorFilter(f.id as typeof connectorFilter)}
            className={cn(
              "text-xs font-semibold pb-2 border-b-2 transition-all cursor-pointer",
              connectorFilter === f.id
                ? isDark ? "border-white text-white" : "border-slate-900 text-slate-900 font-bold"
                : isDark ? "border-transparent text-zinc-500 hover:text-zinc-300" : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={cn("border rounded-xl overflow-hidden shadow-xs", isDark ? "border-zinc-800/80 bg-[#181a24]" : "border-slate-200 bg-white")}>
        <table className="w-full text-left text-xs">
          <thead className={cn("uppercase font-semibold border-b", isDark ? "bg-[#12141c] text-zinc-400 border-zinc-800/80" : "bg-slate-50 text-slate-500 border-slate-200")}>
            <tr>
              <th className="py-3 px-4">Connector</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className={cn("divide-y", isDark ? "divide-zinc-800/60" : "divide-slate-100")}>
            {loadingIntegrations ? (
              <tr>
                <td colSpan={3} className="py-8 px-4 text-center text-zinc-500">
                  Loading connectors...
                </td>
              </tr>
            ) : (
              filteredConnectors.map((c) => (
                <tr key={c.id} className={cn("transition-colors", isDark ? "hover:bg-zinc-800/30" : "hover:bg-slate-50")}>
                  <td className={cn("py-3.5 px-4 font-semibold", isDark ? "text-white" : "text-slate-900")}>
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded flex items-center justify-center overflow-hidden">
                        <img src={c.icon} alt={c.name} className={cn("w-4 h-4 object-contain", c.id === "github" && isDark && "invert")} />
                      </div>
                      <span>{c.name}</span>
                    </div>
                  </td>
                  <td className={cn("py-3.5 px-4", isDark ? "text-zinc-400" : "text-slate-500")}>
                    {c.type}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {c.id === "github" ? (
                      isGitHubConnected ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-emerald-500 font-semibold flex items-center gap-1">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <span className={cn("text-[10px] font-mono", isDark ? "text-zinc-400" : "text-slate-500")}>{c.email}</span>
                          <button
                            onClick={handleDisconnectGitHub}
                            className={cn(
                              "px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer",
                              isDark ? "bg-red-500/20 hover:bg-red-500/30 text-red-300" : "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
                            )}
                          >
                            Disconnect
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={handleConnectGitHub}
                          className={cn(
                            "px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer",
                            isDark ? "bg-zinc-800 hover:bg-zinc-700 text-white" : "bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
                          )}
                        >
                          Connect
                        </button>
                      )
                    ) : c.id === "gmail" ? (
                      isGmailConnected ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-emerald-500 font-semibold flex items-center gap-1">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <span className={cn("text-[10px] font-mono", isDark ? "text-zinc-400" : "text-slate-500")}>{c.email}</span>
                          <button
                            onClick={handleDisconnectGmail}
                            className={cn(
                              "px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer",
                              isDark ? "bg-red-500/20 hover:bg-red-500/30 text-red-300" : "bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
                            )}
                          >
                            Disconnect
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={handleConnectGmail}
                          className={cn(
                            "px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer",
                            isDark ? "bg-zinc-800 hover:bg-zinc-700 text-white" : "bg-slate-900 hover:bg-slate-800 text-white shadow-xs"
                          )}
                        >
                          Connect
                        </button>
                      )
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
