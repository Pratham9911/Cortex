"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { Search, Plus, X, Check, Zap } from "lucide-react"

interface IntegrationStatus {
  id: number
  provider: string
  type: string
  connected: boolean
  account_email: string | null
  created_at: string | null
}

export default function ConnectorsSettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [loadingIntegrations, setLoadingIntegrations] = useState(true)
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null)
  const [connectorFilter, setConnectorFilter] = useState<"all" | "connected" | "not_connected">("all")

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
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
      custom: false,
      connected: isGitHubConnected,
      email: githubIntegration?.account_email || null,
    },
    {
      id: "tinyfish",
      name: "TinyFish",
      icon: null,
      type: "Web",
      custom: true,
      connected: true,
      email: null,
    },
    {
      id: "gdrive",
      name: "Google Drive",
      icon: "/icons/google-drive.svg",
      type: "Web",
      custom: false,
      connected: false,
      email: null,
    },
    {
      id: "gmail",
      name: "Google Gmail",
      icon: "/icons/gmail.svg",
      type: "Web",
      custom: false,
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

      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
        <h2 className="text-xl font-bold text-white">Connectors</h2>
        <div className="flex items-center gap-2">
          <button className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800">
            <Search className="h-4 w-4" />
          </button>
          <button className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium rounded-lg flex items-center gap-1.5">
            Add <Plus className="h-3 w-3" />
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Popular</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-[#181a24] border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                <img src="/icons/github.svg" alt="GitHub" className="w-5 h-5 object-contain invert" />
              </div>
              <p className="text-sm font-semibold text-white">GitHub</p>
            </div>

            {isGitHubConnected && (
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-[10px] font-semibold flex items-center gap-1 shrink-0">
                <Check className="h-3 w-3" /> Connected
              </span>
            )}
          </div>

          <div className="bg-[#181a24] border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                <img src="/icons/gmail.svg" alt="Gmail" className="w-5 h-5 object-contain" />
              </div>
              <p className="text-sm font-semibold text-white">Email</p>
            </div>

            {isGmailConnected && (
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-[10px] font-semibold flex items-center gap-1 shrink-0">
                <Check className="h-3 w-3" /> Connected
              </span>
            )}
          </div>

          <div className="bg-[#181a24] border border-zinc-800/80 rounded-xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
                <img src="/icons/google-drive.svg" alt="Google Drive" className="w-5 h-5 object-contain" />
              </div>
              <p className="text-sm font-semibold text-white">Google Drive</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 border-b border-zinc-800/80 pb-2">
        {[
          { id: "all", label: "All" },
          { id: "connected", label: "Connected" },
          { id: "not_connected", label: "Not connected" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setConnectorFilter(f.id as typeof connectorFilter)}
            className={cn(
              "text-xs font-semibold pb-2 border-b-2 transition-all",
              connectorFilter === f.id
                ? "border-white text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-[#181a24]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#12141c] text-zinc-400 uppercase font-semibold border-b border-zinc-800/80">
            <tr>
              <th className="py-3 px-4">Connector</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {loadingIntegrations ? (
              <tr>
                <td colSpan={3} className="py-8 px-4 text-center text-zinc-500">
                  Loading connectors...
                </td>
              </tr>
            ) : (
              filteredConnectors.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-semibold text-white">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded flex items-center justify-center overflow-hidden">
                        {c.icon ? (
                          <img src={c.icon} alt={c.name} className="w-4 h-4 object-contain" />
                        ) : (
                          <Zap className="w-4 h-4 text-amber-400" />
                        )}
                      </div>
                      <span>{c.name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-zinc-400">
                    {c.type}{" "}
                    {c.custom && (
                      <span className="ml-1.5 px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[10px]">
                        Custom
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {c.id === "github" ? (
                      isGitHubConnected ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">{c.email}</span>
                          <button
                            onClick={handleDisconnectGitHub}
                            className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-[10px]"
                          >
                            Disconnect
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={handleConnectGitHub}
                          className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-xs font-medium"
                        >
                          Connect
                        </button>
                      )
                    ) : c.id === "gmail" ? (
                      isGmailConnected ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">{c.email}</span>
                          <button
                            onClick={handleDisconnectGmail}
                            className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-[10px]"
                          >
                            Disconnect
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={handleConnectGmail}
                          className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-xs font-medium"
                        >
                          Connect
                        </button>
                      )
                    ) : c.connected ? (
                      <span className="text-emerald-400 font-semibold">✓</span>
                    ) : (
                      <button className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-xs font-medium">
                        Connect
                      </button>
                    )}
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
