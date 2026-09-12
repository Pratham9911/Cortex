"use client"

import React, { useState, useRef, useEffect } from "react"
import {
  Globe,
  Database,
  Mail,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Plus,
  ArrowUp,
  MessageSquare,
  ShieldAlert,
  Clock,
  Mic,
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
  draft?: {
    to?: string
    subject?: string
    body?: string
  }
  decision?: string
  feedback?: string
  answer?: string
  sources?: any[]
  chunks?: any[]
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  iteration?: number
}

interface ReasoningLine {
  id: string
  agent: string
  type: "text" | "tool"
  content: string
}

interface StepWindow {
  id: string
  agent: string // "main", "web_agent", "retrieval_agent", "github_agent"
  title: string
  lines: ReasoningLine[]
  isCompleted: boolean
  isCollapsed: boolean
  startTime: number
  elapsedSeconds: number
}

interface HITLPermissionState {
  thread_id: string
  agent: string
  action: string
  tool?: string
  args?: any
  risk?: string
  description?: string
  draft?: {
    to?: string
    subject?: string
    body?: string
  }
}

export function AgentInspector() {
  const [projectId, setProjectId] = useState<string>("1")
  const [question, setQuestion] = useState<string>("")
  const [userQuery, setUserQuery] = useState<string>("")
  const [isStreaming, setIsStreaming] = useState<boolean>(false)
  const [statusText, setStatusText] = useState<string>("Ready")
  
  // Streaming state
  const [threadId, setThreadId] = useState<string>("")
  const [steps, setSteps] = useState<StepWindow[]>([])
  const [masterCollapsed, setMasterCollapsed] = useState<boolean>(false)
  const [totalStartTime, setTotalStartTime] = useState<number>(Date.now())
  const [totalElapsedSeconds, setTotalElapsedSeconds] = useState<number>(0)
  
  // HITL Permission State
  const [hitlPermission, setHitlPermission] = useState<HITLPermissionState | null>(null)
  const [hitlFeedback, setHitlFeedback] = useState<string>("")
  const [hitlDecision, setHitlDecision] = useState<string | null>(null)
  
  const [finalResult, setFinalResult] = useState<StreamEvent | null>(null)
  const streamEndRef = useRef<HTMLDivElement>(null)
  const activeStepScrollRef = useRef<HTMLDivElement>(null)
  const isUserScrollingRef = useRef<boolean>(false)

  useEffect(() => {
    const savedProject = localStorage.getItem("selected_project_id")
    if (savedProject) {
      setProjectId(savedProject)
    }

    const handleScroll = () => {
      const isNearBottom =
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 150
      isUserScrollingRef.current = !isNearBottom
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Timer interval for total workflow and active step
  useEffect(() => {
    if (!isStreaming) return
    const interval = setInterval(() => {
      const totalSec = Math.max(1, Math.floor((Date.now() - totalStartTime) / 1000))
      setTotalElapsedSeconds(totalSec)

      setSteps((prev) =>
        prev.map((step) =>
          !step.isCompleted
            ? { ...step, elapsedSeconds: Math.max(1, Math.floor((Date.now() - step.startTime) / 1000)) }
            : step
        )
      )
    }, 1000)
    return () => clearInterval(interval)
  }, [isStreaming, totalStartTime])

  // Auto-scroll the inner thought panel when new reasoning lines arrive
  useEffect(() => {
    if (activeStepScrollRef.current) {
      activeStepScrollRef.current.scrollTop = activeStepScrollRef.current.scrollHeight
    }
  }, [steps])

  // Soft auto-scroll page to end only if user is near bottom
  useEffect(() => {
    if (!isUserScrollingRef.current && streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [steps, hitlPermission, finalResult])

  const toggleStepCollapse = (stepId: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === stepId ? { ...step, isCollapsed: !step.isCollapsed } : step
      )
    )
  }

  const formatSeconds = (sec: number): string => {
    if (sec < 60) return `${sec}s`
    const mins = Math.floor(sec / 60)
    const remSec = sec % 60
    return remSec > 0 ? `${mins} min ${remSec}s` : `${mins} min`
  }

  const getAgentTitle = (agent: string) => {
    if (agent === "github_agent") return "GitHub Agent"
    if (agent === "gmail_agent") return "Gmail Agent"
    if (agent === "web_agent") return "Web Agent"
    if (agent === "retrieval_agent") return "Retrieval Agent"
    return "Main Agent"
  }

  const handleEvent = (evt: StreamEvent) => {
    const agent = evt.agent || "main"

    if (evt.type === "agent_started") {
      if (evt.thread_id) setThreadId(evt.thread_id)
      setStatusText("Thinking")

      setSteps((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].agent === agent) {
          return prev
        }
        const collapsedPrev = prev.map((s) => ({ ...s, isCollapsed: true, isCompleted: true }))
        return [
          ...collapsedPrev,
          {
            id: `step-${Date.now()}`,
            agent,
            title: getAgentTitle(agent),
            lines: [
              {
                id: `line-${Date.now()}`,
                agent,
                type: "text",
                content: agent === "main" ? "Analyzing prompt and planning task..." : `Initializing ${getAgentTitle(agent)}...`,
              },
            ],
            isCompleted: false,
            isCollapsed: false,
            startTime: Date.now(),
            elapsedSeconds: 1,
          },
        ]
      })
    } else if (evt.type === "reasoning") {
      const newContent = evt.content || ""
      if (!newContent.trim()) return

      setSteps((prev) => {
        if (prev.length === 0) {
          return [
            {
              id: `step-${Date.now()}`,
              agent,
              title: getAgentTitle(agent),
              lines: [{ id: `line-${Date.now()}`, agent, type: "text", content: newContent }],
              isCompleted: false,
              isCollapsed: false,
              startTime: Date.now(),
              elapsedSeconds: 1,
            },
          ]
        }

        const lastIdx = prev.length - 1
        const lastStep = prev[lastIdx]

        if (lastStep.agent === agent) {
          const updatedLines: ReasoningLine[] = [
            ...lastStep.lines,
            { id: `line-${Date.now()}-${Math.random()}`, agent, type: "text", content: newContent },
          ]
          return prev.map((step, idx) =>
            idx === lastIdx ? { ...step, lines: updatedLines, isCompleted: false } : step
          )
        } else {
          const collapsedPrev = prev.map((s) => ({ ...s, isCollapsed: true, isCompleted: true }))
          return [
            ...collapsedPrev,
            {
              id: `step-${Date.now()}`,
              agent,
              title: getAgentTitle(agent),
              lines: [{ id: `line-${Date.now()}`, agent, type: "text", content: newContent }],
              isCompleted: false,
              isCollapsed: false,
              startTime: Date.now(),
              elapsedSeconds: 1,
            },
          ]
        }
      })
    } else if (evt.type === "tool_started") {
      const toolName = evt.tool || "unknown"

      if (toolName === "web_agent" || toolName === "retrieval_agent" || toolName === "github_agent" || toolName === "gmail_agent") {
        setSteps((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].agent === toolName) {
            return prev
          }
          const collapsedPrev = prev.map((s) => ({ ...s, isCollapsed: true, isCompleted: true }))
          return [
            ...collapsedPrev,
            {
              id: `step-${Date.now()}`,
              agent: toolName,
              title: getAgentTitle(toolName),
              lines: [],
              isCompleted: false,
              isCollapsed: false,
              startTime: Date.now(),
              elapsedSeconds: 1,
            },
          ]
        })
      } else {
        const toolContent = `Tool Call: ${toolName} ${JSON.stringify(evt.args || {})}`
        setSteps((prev) => {
          if (prev.length === 0) return prev
          const lastIdx = prev.length - 1
          const lastStep = prev[lastIdx]

          const updatedLines: ReasoningLine[] = [
            ...lastStep.lines,
            { id: `tool-${Date.now()}`, agent: lastStep.agent, type: "tool", content: toolContent },
          ]
          return prev.map((step, idx) =>
            idx === lastIdx ? { ...step, lines: updatedLines } : step
          )
        })
      }
    } else if (evt.type === "tool_completed") {
      const toolName = evt.tool || ""
      if (
        toolName === "web_agent" ||
        toolName === "retrieval_agent" ||
        toolName === "github_agent" ||
        toolName === "gmail_agent" ||
        toolName === "sub_agent"
      ) {
        setSteps((prev) => {
          if (prev.length === 0) return prev
          return prev.map((step, idx) =>
            idx === prev.length - 1 ? { ...step, isCompleted: true, isCollapsed: true } : step
          )
        })
      }
    } else if (evt.type === "interrupt") {
      setStatusText("Waiting Authorization")
      setHitlPermission({
        thread_id: evt.thread_id || threadId,
        agent: evt.agent || "main",
        action: evt.action || "tool_approval",
        tool: evt.tool,
        args: evt.args,
        risk: evt.risk,
        description: evt.description,
        draft: evt.draft,
      })
    } else if (evt.type === "agent_resumed") {
      setStatusText(`Resumed (${evt.decision})`)
      setHitlDecision(evt.decision || "processed")
      setHitlPermission(null)

      setSteps((prev) => {
        const collapsedPrev = prev.map((s) => ({ ...s, isCollapsed: true, isCompleted: true }))
        return [
          ...collapsedPrev,
          {
            id: `step-${Date.now()}`,
            agent: "main",
            title: `Main Agent (Post-${evt.decision === "yes" ? "Approval" : evt.decision === "no" ? "Rejection" : "Instruction"})`,
            lines: [
              {
                id: `line-${Date.now()}`,
                agent: "main",
                type: "text",
                content: `User decision: ${evt.decision}` + (evt.feedback ? `, feedback: "${evt.feedback}"` : ""),
              },
            ],
            isCompleted: false,
            isCollapsed: false,
            startTime: Date.now(),
            elapsedSeconds: 1,
          },
        ]
      })
    } else if (evt.type === "agent_completed") {
      setStatusText("Completed")
      setMasterCollapsed(true)
      setSteps((prev) =>
        prev.map((step) => ({ ...step, isCompleted: true, isCollapsed: true }))
      )
      setFinalResult(evt)
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
        if (!chunk.trim()) continue
        const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "))
        if (dataLine) {
          try {
            const evt: StreamEvent = JSON.parse(dataLine.replace("data: ", ""))
            handleEvent(evt)
          } catch (e) {
            console.error("Parse error:", e, dataLine)
          }
        }
      }
    }
  }

  const startStream = async () => {
    if (!question.trim()) return

    const queryText = question.trim()
    setUserQuery(queryText)
    setQuestion("")
    setIsStreaming(true)
    setStatusText("Initializing...")
    setThreadId("")
    setSteps([])
    setMasterCollapsed(false)
    setTotalStartTime(Date.now())
    setTotalElapsedSeconds(1)
    setHitlPermission(null)
    setHitlFeedback("")
    setHitlDecision(null)
    setFinalResult(null)

    const token = localStorage.getItem("access_token")
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const url = `${apiUrl}/projects/${projectId}/agent?question=${encodeURIComponent(queryText)}`

    const headers: Record<string, string> = {}
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    try {
      const response = await fetch(url, { headers })
      if (!response.ok) {
        const errText = await response.text()
        alert(`Error starting agent stream (${response.status}): ${errText}`)
        setIsStreaming(false)
        return
      }
      await readStream(response)
    } catch (err: any) {
      console.error("Stream error:", err)
      alert(`Stream failed: ${err.message}`)
    } finally {
      setIsStreaming(false)
    }
  }

  const handleHITLResponse = async (decision: "yes" | "no" | "tell_agent") => {
    if (!hitlPermission) return
    setHitlDecision(decision)

    const token = localStorage.getItem("access_token")
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    let url = `${apiUrl}/projects/${projectId}/agent/${hitlPermission.thread_id}/resume?decision=${decision}`
    if (hitlFeedback.trim()) {
      url += `&feedback=${encodeURIComponent(hitlFeedback.trim())}`
    }

    const headers: Record<string, string> = {}
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    setIsStreaming(true)
    setStatusText(`Resuming (${decision})...`)

    try {
      const response = await fetch(url, { method: "POST", headers })
      if (!response.ok) {
        const errText = await response.text()
        alert(`Error resuming agent (${response.status}): ${errText}`)
        setIsStreaming(false)
        return
      }
      await readStream(response)
    } catch (err: any) {
      console.error("Resume stream error:", err)
      alert(`Resume failed: ${err.message}`)
    } finally {
      setIsStreaming(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0c10] text-slate-100 font-sans pb-48">
      {/* Custom Dark Scrollbar & Glitter Shimmer Animations */}
      <style jsx global>{`
        .custom-dark-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .custom-dark-scroll::-webkit-scrollbar-track {
          background: #090a0f;
        }
        .custom-dark-scroll::-webkit-scrollbar-thumb {
          background: #1e2235;
          border-radius: 3px;
        }
        .custom-dark-scroll::-webkit-scrollbar-thumb:hover {
          background: #2d334d;
        }

        @keyframes shimmerGlow {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }
        .animate-glitter {
          background: linear-gradient(90deg, #94a3b8 0%, #ffffff 50%, #94a3b8 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmerGlow 2s infinite linear;
        }
      `}</style>

      {/* Clean Minimalist Conversation Body */}
      <div className="max-w-3xl mx-auto p-6 space-y-6 pt-10">

        {/* User Query Bubble */}
        {userQuery && (
          <div className="flex justify-end">
            <div className="bg-[#161822] border border-slate-800/80 rounded-2xl px-5 py-3 text-sm text-slate-100 max-w-lg shadow-sm">
              {userQuery}
            </div>
          </div>
        )}

        {/* Master Thought Process Box (Worked for X seconds >) */}
        {steps.length > 0 && (
          <div className="space-y-3">
            {/* Master Header Pill */}
            <div
              onClick={() => setMasterCollapsed(!masterCollapsed)}
              className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200 cursor-pointer select-none py-1 transition-colors"
            >
              <Clock className="w-3.5 h-3.5 text-slate-400 opacity-70" />
              <span className={isStreaming ? "animate-glitter font-semibold" : ""}>
                {isStreaming
                  ? `Working... (${formatSeconds(totalElapsedSeconds)})`
                  : `Worked for ${formatSeconds(totalElapsedSeconds)}`}
              </span>

              {masterCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </div>

            {/* Master Body: All step thoughts arranged in chronological order */}
            {!masterCollapsed && (
              <div className="pl-4 border-l border-slate-800/80 space-y-3 font-sans">
                {steps.map((step, idx) => {
                  const isMain = step.agent === "main"
                  const isGitHub = step.agent === "github_agent"
                  const isGmail = step.agent === "gmail_agent"
                  const isWeb = step.agent === "web_agent"
                  const isRetrieval = step.agent === "retrieval_agent"
                  const isActive = !step.isCompleted

                  return (
                    <div key={step.id} className="space-y-1.5">
                      {/* Step Header */}
                      <div
                        onClick={() => toggleStepCollapse(step.id)}
                        className="flex items-center gap-2 text-xs cursor-pointer select-none"
                      >
                        {!isMain && (
                          <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                            {isGitHub ? (
                              <img src="/icons/github.svg" className="w-3 h-3 opacity-60 invert" alt="GitHub" />
                            ) : isGmail ? (
                              <img src="/icons/gmail.svg" className="w-3 h-3 object-contain" alt="Gmail" />
                            ) : isWeb ? (
                              <Globe className="w-3 h-3 text-slate-400 opacity-70" />
                            ) : isRetrieval ? (
                              <Database className="w-3 h-3 text-slate-400 opacity-70" />
                            ) : null}
                          </span>
                        )}

                        <span className={isActive ? "animate-glitter font-semibold" : "text-slate-400"}>
                          {isActive ? (
                            <>
                              {step.title}: Thinking
                              <span className="inline-block animate-bounce ml-0.5">.</span>
                              <span className="inline-block animate-bounce [animation-delay:0.2s]">.</span>
                              <span className="inline-block animate-bounce [animation-delay:0.4s]">.</span>
                            </>
                          ) : (
                            `${step.title}: Thought for ${formatSeconds(step.elapsedSeconds || 1)}`
                          )}
                        </span>

                        {step.isCollapsed ? (
                          <ChevronRight className="w-3 h-3 text-slate-500" />
                        ) : (
                          <ChevronDown className="w-3 h-3 text-slate-500" />
                        )}
                      </div>

                      {/* Step Lines (Auto-scrolls to bottom live + Sleek Dark Scrollbar) */}
                      {!step.isCollapsed && step.lines.length > 0 && (
                        <div
                          ref={idx === steps.length - 1 ? activeStepScrollRef : null}
                          className="pl-4 text-xs text-slate-400 leading-relaxed max-h-56 overflow-y-auto space-y-1 font-sans custom-dark-scroll pr-2 scroll-smooth"
                        >
                          {step.lines.map((line) => (
                            <div key={line.id} className={line.type === "tool" ? "text-amber-400/90 font-mono text-[11px]" : ""}>
                              {line.content}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Final Response Text Block + Token Usage Footer */}
        {finalResult && (
          <div className="pt-4 border-t border-slate-800/60 text-slate-100 text-sm leading-relaxed space-y-4">
            <div className="whitespace-pre-wrap">{finalResult.answer || "Task completed."}</div>

            {/* Token Counts Footer */}
            <div className="flex flex-wrap gap-4 text-xs text-slate-400 font-mono pt-3 border-t border-slate-800/50">
              <div>
                Input Tokens: <span className="text-slate-200">{finalResult.input_tokens || 0}</span>
              </div>
              <div>
                Output Tokens: <span className="text-slate-200">{finalResult.output_tokens || 0}</span>
              </div>
              <div>
                Total Tokens:{" "}
                <span className="text-indigo-400 font-semibold">
                  {finalResult.total_tokens || ((finalResult.input_tokens || 0) + (finalResult.output_tokens || 0))}
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={streamEndRef} />
      </div>

      {/* Floating Bottom HITL Authorization Card & Input Bar (Image 2) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-gradient-to-t from-[#0b0c10] via-[#0b0c10]/95 to-transparent pointer-events-none">
        <div className="max-w-2xl mx-auto space-y-3 pointer-events-auto">
          {/* Floating HITL Authorization Card */}
          {hitlPermission && (
            <div className="bg-[#12141d] border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5 text-slate-200 font-semibold text-sm">
                  {hitlPermission.agent === "github_agent" ||
                  (hitlPermission.tool && hitlPermission.tool.includes("github")) ? (
                    <img src="/icons/github.svg" className="w-4 h-4 opacity-80 invert" alt="GitHub" />
                  ) : hitlPermission.agent === "gmail_agent" || hitlPermission.draft || (hitlPermission.tool && hitlPermission.tool.includes("gmail")) ? (
                    <img src="/icons/gmail.svg" className="w-4 h-4 object-contain" alt="Gmail" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-slate-400" />
                  )}
                  <span>
                    Agent wants authorization for:{" "}
                    <span className="font-mono text-indigo-300">
                      {hitlPermission.tool || hitlPermission.action}
                    </span>
                  </span>
                </div>

                {hitlPermission.risk && (
                  <span className="px-2 py-0.5 bg-red-500/20 text-red-300 border border-red-500/30 rounded text-[10px] uppercase font-bold tracking-wider">
                    {hitlPermission.risk}
                  </span>
                )}
              </div>

              {/* Tool Parameters Preview */}
              <div className="bg-[#090a0f] border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
                {hitlPermission.description && (
                  <p className="text-slate-400 italic border-b border-slate-800 pb-2">
                    {hitlPermission.description}
                  </p>
                )}

                {hitlPermission.draft ? (
                  <div className="space-y-1 text-xs">
                    <div>
                      <span className="text-slate-400 font-semibold">TO:</span> {hitlPermission.draft.to}
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold">SUBJECT:</span> {hitlPermission.draft.subject}
                    </div>
                    <div className="pt-1 text-slate-200 whitespace-pre-wrap">{hitlPermission.draft.body}</div>
                  </div>
                ) : hitlPermission.args ? (
                  <div className="space-y-1">
                    <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider block">
                      Parameters:
                    </span>
                    <pre className="bg-[#12141d] p-2.5 rounded-lg text-indigo-300 font-mono text-[11px] overflow-x-auto custom-dark-scroll">
                      {JSON.stringify(hitlPermission.args, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>

              {/* Custom Instructions Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                  <span>Tell Agent What To Do / Custom Instructions (Optional):</span>
                </label>
                <textarea
                  value={hitlFeedback}
                  onChange={(e) => setHitlFeedback(e.target.value)}
                  rows={2}
                  placeholder="e.g. Modify title to 'Updated Title' or create file in repo Y instead..."
                  className="w-full bg-[#090a0f] border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-700"
                />
              </div>

              {/* 3 Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                <button
                  onClick={() => handleHITLResponse("no")}
                  disabled={hitlDecision !== null}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-600/90 hover:bg-red-500 text-white font-semibold text-xs rounded-xl shadow-md disabled:opacity-50 transition-all"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>

                <button
                  onClick={() => handleHITLResponse("tell_agent")}
                  disabled={hitlDecision !== null || !hitlFeedback.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-600/90 hover:bg-amber-500 text-white font-semibold text-xs rounded-xl shadow-md disabled:opacity-50 transition-all"
                >
                  <MessageSquare className="w-4 h-4" /> Tell Agent What To Do
                </button>

                <button
                  onClick={() => handleHITLResponse("yes")}
                  disabled={hitlDecision !== null}
                  className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-md disabled:opacity-50 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" /> Accept
                </button>
              </div>
            </div>
          )}

          {/* Floating Pill Input Bar (Matching Image 2) */}
          <div className="bg-[#12141d]/90 border border-slate-800 rounded-full p-2 pl-4 flex items-center gap-3 shadow-2xl backdrop-blur-xl">
            <button className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors">
              <Plus className="w-5 h-5" />
            </button>

            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !isStreaming && question.trim()) {
                  e.preventDefault()
                  startStream()
                }
              }}
              placeholder="Ask anything..."
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-400 focus:outline-none"
            />

            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors">
                High <ChevronDown className="w-3 h-3" />
              </button>

              <button className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors">
                <Mic className="w-4 h-4" />
              </button>

              <button
                onClick={startStream}
                disabled={isStreaming || !question.trim()}
                className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center disabled:opacity-40 transition-all shadow-md"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
