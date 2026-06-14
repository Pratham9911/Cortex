"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AgentChatShell } from "@/components/agent-chat/agent-chat-shell"

export default function AiAgentPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const selectedProjectId = localStorage.getItem("selected_project_id")
    if (!selectedProjectId) {
      router.push("/workspace")
      return
    }
    setReady(true)
  }, [router])

  if (!ready) return null

  return <AgentChatShell />
}
