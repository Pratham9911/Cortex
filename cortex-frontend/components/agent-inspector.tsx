"use client"

import React, { useEffect, useRef, useState } from "react"
import {
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  Globe,
  Github,
  Mail,
  MessageSquare,
  Mic,
  Plus,
  ShieldAlert,
  Wrench,
  XCircle,
} from "lucide-react"

interface StreamEvent {
  type: string
  agent?: string
  thread_id?: string
  content?: string
  tool?: string
  args?: any
  risk?: string
  description?: string
  action?: string
  preview_title?: string
  preview?: string
  from?: string
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  body?: string
  message_id?: string
  draft?: { to?: string; subject?: string; body?: string }
  decision?: string
  feedback?: string
  message?: string
  answer?: string
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

interface ActivityItem {
  id: string
  agent: string
  kind: "thought" | "tool" | "status"
  label?: string
  content: string
}

interface HITLPermissionState {
  thread_id: string
  agent: string
  action: string
  tool?: string
  args?: any
  risk?: string
  description?: string
  preview_title?: string
  preview?: string
  from?: string
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  body?: string
  message_id?: string
  draft?: { to?: string; subject?: string; body?: string }
}

const AGENT_TOOLS = new Set(["web_agent", "retrieval_agent", "github_agent", "gmail_agent"])

function activityId() {
  return `activity-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function agentName(agent: string) {
  if (agent === "web_agent") return "Web"
  if (agent === "retrieval_agent") return "Project"
  if (agent === "github_agent") return "GitHub"
  if (agent === "gmail_agent") return "Gmail"
  return "Main"
}

function AgentIcon({ agent, className = "h-3.5 w-3.5" }: { agent: string; className?: string }) {
  if (agent === "web_agent") return <Globe className={`${className} text-sky-300`} />
  if (agent === "retrieval_agent") return <Database className={`${className} text-emerald-300`} />
  if (agent === "github_agent") return <Github className={`${className} text-violet-300`} />
  if (agent === "gmail_agent") return <Mail className={`${className} text-rose-300`} />
  return <Wrench className={`${className} text-slate-400`} />
}

export function AgentInspector() {
  const [projectId, setProjectId] = useState("1")
  const [question, setQuestion] = useState("")
  const [userQuery, setUserQuery] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [statusText, setStatusText] = useState("Ready")
  const [threadId, setThreadId] = useState("")
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [activityCollapsed, setActivityCollapsed] = useState(false)
  const [startedAt, setStartedAt] = useState(Date.now())
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [hitlPermission, setHitlPermission] = useState<HITLPermissionState | null>(null)
  const [hitlFeedback, setHitlFeedback] = useState("")
  const [hitlDecision, setHitlDecision] = useState<string | null>(null)
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false)
  const [approvalConfirmOpen, setApprovalConfirmOpen] = useState(false)
  const [finalResult, setFinalResult] = useState<StreamEvent | null>(null)
  const activityPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const savedProject = localStorage.getItem("selected_project_id")
    if (savedProject) setProjectId(savedProject)
  }, [])

  useEffect(() => {
    if (!isStreaming) return
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isStreaming, startedAt])

  useEffect(() => {
    const panel = activityPanelRef.current
    if (panel && isStreaming && !activityCollapsed) panel.scrollTop = panel.scrollHeight
  }, [activities, activityCollapsed, isStreaming])

  const addActivity = (item: Omit<ActivityItem, "id">) => {
    if (!item.content.trim()) return
    setActivities((prev) => [...prev, { ...item, id: activityId() }])
  }

  const handleEvent = (evt: StreamEvent) => {
    const agent = evt.agent || "main"

    if (evt.type === "agent_started") {
      if (evt.thread_id) setThreadId(evt.thread_id)
      setStatusText("Thinking")
      addActivity({ agent, kind: "status", content: agent === "main" ? "Planning the request..." : `${agentName(agent)} agent started` })
    } else if (evt.type === "reasoning") {
      addActivity({ agent, kind: "thought", content: evt.content || "" })
    } else if (evt.type === "tool_started") {
      const tool = evt.tool || "unknown"
      const toolAgent = AGENT_TOOLS.has(tool) ? tool : agent
      const label = tool === "web_agent" ? "Searching web" : tool === "retrieval_agent" ? "Searching project" : tool === "github_agent" ? "Searching GitHub" : `Using ${tool}`
      addActivity({ agent: toolAgent, kind: "tool", label, content: AGENT_TOOLS.has(tool) ? label : `${label}${evt.args ? ` ${JSON.stringify(evt.args)}` : ""}` })
    } else if (evt.type === "tool_completed") {
      const tool = evt.tool || ""
      if (AGENT_TOOLS.has(tool)) addActivity({ agent: tool, kind: "status", content: `${agentName(tool)} search complete` })
    } else if (evt.type === "interrupt") {
      setStatusText("Waiting Authorization")
      setHitlDecision(null)
      setIsSubmittingDecision(false)
      setHitlFeedback("")
      setApprovalConfirmOpen(false)
      setHitlPermission({
        thread_id: evt.thread_id || threadId,
        agent: evt.agent || "main",
        action: evt.action || "tool_approval",
        tool: evt.tool,
        args: evt.args,
        risk: evt.risk,
        description: evt.description,
        preview_title: evt.preview_title,
        preview: evt.preview,
        from: evt.from,
        to: evt.to || evt.draft?.to,
        cc: evt.cc,
        bcc: evt.bcc,
        subject: evt.subject || evt.draft?.subject,
        body: evt.body || evt.draft?.body,
        message_id: evt.message_id,
        draft: evt.draft,
      })
      addActivity({ agent, kind: "status", content: "Waiting for your authorization" })
    } else if (evt.type === "agent_resumed") {
      setStatusText(`Resumed (${evt.decision})`)
      setHitlDecision(evt.decision || "processed")
      setHitlPermission(null)
      addActivity({ agent: "main", kind: "status", content: `Resuming after ${evt.decision === "yes" ? "approval" : evt.decision === "no" ? "rejection" : "your instruction"}` })
    } else if (evt.type === "error") {
      setStatusText("Agent error")
      addActivity({ agent: "main", kind: "status", content: evt.message || evt.content || evt.answer || "The agent could not complete this request." })
      setActivityCollapsed(true)
    } else if (evt.type === "agent_completed") {
      // Sub-agents also emit agent_completed while the main agent is still
      // synthesizing. Only the main workflow completion owns the final answer.
      if (evt.agent !== "main") {
        const finishedAgent = evt.agent || "main"
        addActivity({ agent: finishedAgent, kind: "status", content: `${agentName(finishedAgent)} agent finished` })
        return
      }
      setStatusText("Completed")
      setFinalResult(evt)
      setActivityCollapsed(true)
    }
  }

  const readStream = async (response: Response) => {
    if (!response.body) return
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split("\n\n")
      buffer = chunks.pop() || ""
      for (const chunk of chunks) {
        const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "))
        if (!dataLine) continue
        try { handleEvent(JSON.parse(dataLine.slice(6)) as StreamEvent) } catch (error) { console.error("Stream event parse error", error) }
      }
    }
  }

  const startStream = async () => {
    if (!question.trim() || isStreaming) return
    const queryText = question.trim()
    setUserQuery(queryText)
    setQuestion("")
    setIsStreaming(true)
    setStatusText("Initializing")
    setThreadId("")
    setActivities([])
    setActivityCollapsed(false)
    setStartedAt(Date.now())
    setElapsedSeconds(1)
    setHitlPermission(null)
    setHitlFeedback("")
    setHitlDecision(null)
    setIsSubmittingDecision(false)
    setApprovalConfirmOpen(false)
    setFinalResult(null)

    const token = localStorage.getItem("access_token")
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const url = `${apiUrl}/projects/${projectId}/agent?question=${encodeURIComponent(queryText)}`
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    try {
      const response = await fetch(url, { headers })
      if (!response.ok) { alert(`Error starting agent stream (${response.status}): ${await response.text()}`); return }
      await readStream(response)
    } catch (error: any) {
      console.error("Stream error:", error)
      alert(`Stream failed: ${error.message}`)
    } finally { setIsStreaming(false) }
  }

  const handleHITLResponse = async (decision: "yes" | "no" | "tell_agent") => {
    if (!hitlPermission || isSubmittingDecision) return
    setHitlDecision(decision)
    setIsSubmittingDecision(true)
    const token = localStorage.getItem("access_token")
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    let url = `${apiUrl}/projects/${projectId}/agent/${hitlPermission.thread_id}/resume?decision=${decision}`
    if (hitlFeedback.trim()) url += `&feedback=${encodeURIComponent(hitlFeedback.trim())}`
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    setIsStreaming(true)
    setStatusText(`Resuming (${decision})`)
    try {
      const response = await fetch(url, { method: "POST", headers })
      if (!response.ok) {
        setHitlDecision(null)
        alert(`Error resuming agent (${response.status}): ${await response.text()}`)
        return
      }
      await readStream(response)
    } catch (error: any) {
      setHitlDecision(null)
      console.error("Resume stream error:", error)
      alert(`Resume failed: ${error.message}`)
    } finally {
      setApprovalConfirmOpen(false)
      setIsSubmittingDecision(false)
      setIsStreaming(false)
    }
  }

  const requestApproval = () => {
    if (!hitlPermission || isSubmittingDecision) return
    setApprovalConfirmOpen(true)
  }

  const confirmApproval = () => {
    setApprovalConfirmOpen(false)
    void handleHITLResponse("yes")
  }

  const formatSeconds = (seconds: number) => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`

  return (
    <div className="min-h-screen bg-[#0b0c10] pb-48 font-sans text-slate-100">
      <style jsx global>{`
        .custom-dark-scroll::-webkit-scrollbar { width: 5px; }
        .custom-dark-scroll::-webkit-scrollbar-track { background: #090a0f; }
        .custom-dark-scroll::-webkit-scrollbar-thumb { background: #252a3d; border-radius: 3px; }
        @keyframes shimmerGlow { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .animate-glitter { background: linear-gradient(90deg, #94a3b8 0%, #ffffff 50%, #94a3b8 100%); background-size: 200% 100%; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: shimmerGlow 2s infinite linear; }
      `}</style>

      <main className="mx-auto max-w-3xl space-y-6 px-6 pt-10">
        {userQuery && <div className="flex justify-end"><div className="max-w-lg rounded-2xl border border-slate-800/80 bg-[#161822] px-5 py-3 text-sm shadow-sm">{userQuery}</div></div>}

        {activities.length > 0 && <section className="space-y-3">
          <button type="button" onClick={() => setActivityCollapsed((collapsed) => !collapsed)} className="flex items-center gap-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200" aria-expanded={!activityCollapsed}>
            <Clock className="h-3.5 w-3.5 opacity-70" />
            <span className={isStreaming ? "animate-glitter font-semibold" : ""}>{isStreaming ? `Working... (${formatSeconds(elapsedSeconds)})` : `Worked for ${formatSeconds(elapsedSeconds)}`}</span>
            {activityCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {!activityCollapsed && <div ref={activityPanelRef} className="custom-dark-scroll max-h-72 space-y-2 overflow-y-auto border-l border-slate-800/80 pl-4 pr-2 scroll-smooth" aria-live="polite">
            {activities.map((activity) => <div key={activity.id} className="flex items-start gap-2.5 text-xs leading-relaxed">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center"><AgentIcon agent={activity.agent} /></span>
              <div className={activity.kind === "tool" ? "font-medium text-slate-200" : "text-slate-400"}>
                {activity.label && <span className="mr-2 text-[10px] uppercase tracking-wider text-slate-500">{activity.label}</span>}<span>{activity.content}</span>
              </div>
            </div>)}
            {isStreaming && <div className="ml-6 h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />}
          </div>}
        </section>}

        {finalResult && <div className="space-y-4 border-t border-slate-800/60 pt-4 text-sm leading-relaxed">
          <div className="whitespace-pre-wrap">{finalResult.answer || "Task completed."}</div>
          <div className="flex flex-wrap gap-4 border-t border-slate-800/50 pt-3 font-mono text-xs text-slate-400">
            <span>Input Tokens: <b className="text-slate-200">{finalResult.input_tokens || 0}</b></span><span>Output Tokens: <b className="text-slate-200">{finalResult.output_tokens || 0}</b></span><span>Total Tokens: <b className="text-indigo-400">{finalResult.total_tokens || ((finalResult.input_tokens || 0) + (finalResult.output_tokens || 0))}</b></span>
          </div>
        </div>}
      </main>

      {approvalConfirmOpen && hitlPermission && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5" role="dialog" aria-modal="true" aria-labelledby="approval-confirm-title">
        <div className="w-full max-w-md space-y-5 rounded-2xl border border-black bg-white p-6 text-black shadow-2xl">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/45">Final confirmation</p><h2 id="approval-confirm-title" className="mt-1 text-lg font-semibold">Approve this action?</h2><p className="mt-2 text-xs leading-relaxed text-black/60">The agent will execute the action shown below. This cannot be undone automatically.</p></div>
          <div className="max-h-56 overflow-y-auto rounded-xl border border-black/10 bg-black/[0.04] p-3 text-xs">
            <p className="font-semibold text-black/50">{hitlPermission.preview_title || hitlPermission.tool || hitlPermission.action}</p>
            {hitlPermission.to || hitlPermission.subject || hitlPermission.body ? <div className="mt-3 space-y-1.5"><p><b>To:</b> {hitlPermission.to || "Not specified"}</p>{hitlPermission.cc && <p><b>Cc:</b> {hitlPermission.cc}</p>}<p><b>Subject:</b> {hitlPermission.subject || "Not specified"}</p><p className="whitespace-pre-wrap border-t border-black/10 pt-2">{hitlPermission.body || "No message body"}</p></div> : <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-[11px]">{JSON.stringify(hitlPermission.args || hitlPermission.preview || {}, null, 2)}</pre>}
          </div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setApprovalConfirmOpen(false)} className="rounded-lg border border-black/20 bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-black/[0.05]">Go back</button><button type="button" onClick={confirmApproval} className="rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white transition hover:bg-black/80">Approve and continue</button></div>
        </div>
      </div>}

      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-[#0b0c10] via-[#0b0c10]/95 to-transparent p-4"><div className="pointer-events-auto mx-auto max-w-2xl space-y-3">
        {hitlPermission && <section className="space-y-4 rounded-[22px] border border-black bg-white p-5 text-black shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-black/10 pb-4">
            <div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white">{hitlPermission.agent === "github_agent" || hitlPermission.tool?.includes("github") ? <Github className="h-4 w-4" /> : hitlPermission.agent === "gmail_agent" || hitlPermission.draft || hitlPermission.tool?.includes("gmail") ? <Mail className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}</div><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/45">Human approval required</p><h2 className="mt-1 text-sm font-semibold">{hitlPermission.agent === "github_agent" || hitlPermission.tool?.includes("github") ? "Review this GitHub action" : hitlPermission.agent === "gmail_agent" || hitlPermission.draft || hitlPermission.tool?.includes("gmail") ? "Review this Gmail action" : "Review this action"}</h2></div></div>
            {hitlPermission.risk && <span className="rounded-full border border-black/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-black/60">{hitlPermission.risk}</span>}
          </div>
          <div className="space-y-3 rounded-xl border border-black/10 bg-black/[0.03] p-4 text-xs"><div><span className="font-semibold text-black/50">ACTION</span><p className="mt-1 font-mono text-[11px]">{hitlPermission.tool || hitlPermission.action}</p></div>{hitlPermission.description && <p className="border-t border-black/10 pt-3 leading-relaxed text-black/65">{hitlPermission.description}</p>}{hitlPermission.to || hitlPermission.subject || hitlPermission.body ? <div className="space-y-2 border-t border-black/10 pt-3"><span className="font-semibold text-black/50">EMAIL CONTENT</span>{hitlPermission.from && <p><b>From:</b> {hitlPermission.from}</p>}<p><b>To:</b> {hitlPermission.to || "Not specified"}</p>{hitlPermission.cc && <p><b>Cc:</b> {hitlPermission.cc}</p>}{hitlPermission.bcc && <p><b>Bcc:</b> {hitlPermission.bcc}</p>}<p><b>Subject:</b> {hitlPermission.subject || "Not specified"}</p><div className="max-h-32 overflow-y-auto whitespace-pre-wrap border-t border-black/10 pt-2 text-black/75">{hitlPermission.body || "No message body"}</div></div> : hitlPermission.args ? <div className="border-t border-black/10 pt-3"><span className="font-semibold text-black/50">COMMAND PARAMETERS</span><pre className="custom-dark-scroll mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/[0.06] p-3 font-mono text-[11px] text-black">{JSON.stringify(hitlPermission.args, null, 2)}</pre></div> : hitlPermission.preview ? <div className="border-t border-black/10 pt-3"><span className="font-semibold text-black/50">REQUEST</span><pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/[0.06] p-3 font-mono text-[11px] text-black">{hitlPermission.preview}</pre></div> : null}</div>
          <div className="space-y-2"><label className="flex items-center gap-2 text-xs font-semibold"><MessageSquare className="h-3.5 w-3.5" />Instructions for the agent <span className="font-normal text-black/45">(optional)</span></label><textarea value={hitlFeedback} onChange={(event) => setHitlFeedback(event.target.value)} rows={2} placeholder="Add a change or tell the agent what to do instead..." className="w-full resize-none rounded-xl border border-black/15 bg-white p-3 text-xs text-black placeholder-black/35 outline-none transition focus:border-black focus:ring-2 focus:ring-black/10" /></div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4"><span className="text-[11px] text-black/45">{isSubmittingDecision ? "Sending your decision..." : hitlPermission.agent === "github_agent" || hitlPermission.tool?.includes("github") ? "This action will be sent to GitHub." : hitlPermission.agent === "gmail_agent" || hitlPermission.draft || hitlPermission.tool?.includes("gmail") ? "This action will be sent to Gmail." : "This action will be executed."}</span><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => handleHITLResponse("no")} disabled={isSubmittingDecision} className="flex items-center gap-1.5 rounded-lg border border-black/20 bg-white px-3.5 py-2 text-xs font-semibold text-black transition hover:bg-black/[0.05] disabled:cursor-not-allowed disabled:opacity-40"><XCircle className="h-3.5 w-3.5" />Reject</button><button type="button" onClick={() => handleHITLResponse("tell_agent")} disabled={isSubmittingDecision || !hitlFeedback.trim()} className="flex items-center gap-1.5 rounded-lg border border-black/15 bg-black/[0.06] px-3.5 py-2 text-xs font-semibold text-black transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-40"><MessageSquare className="h-3.5 w-3.5" />Send instruction</button><button type="button" onClick={requestApproval} disabled={isSubmittingDecision} className="flex items-center gap-1.5 rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="h-3.5 w-3.5" />Approve</button></div></div>
        </section>}
        <div className="flex items-center gap-3 rounded-full border border-black bg-white p-2 pl-4 shadow-2xl"><button type="button" aria-label="Add attachment" className="rounded-full p-1.5 text-black/55 transition-colors hover:bg-black/5 hover:text-black"><Plus className="h-5 w-5" /></button><input type="text" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void startStream() } }} placeholder="Ask anything..." className="flex-1 bg-transparent text-sm text-black placeholder-black/40 focus:outline-none" /><div className="flex items-center gap-2"><button type="button" aria-label="Voice input" className="rounded-full p-1.5 text-black/55 transition-colors hover:bg-black/5 hover:text-black"><Mic className="h-4 w-4" /></button><button type="button" onClick={() => void startStream()} disabled={isStreaming || !question.trim()} aria-label="Send question" className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white shadow-md transition hover:bg-black/80 disabled:opacity-35"><ArrowUp className="h-4 w-4" /></button></div></div>
      </div></div>
    </div>
  )
}
