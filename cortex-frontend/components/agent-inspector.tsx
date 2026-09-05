"use client"

import React, { useState, useRef, useEffect } from "react"
import {
  Bot,
  Sparkles,
  Globe,
  Database,
  Mail,
  Calculator,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Cpu,
  Play,
  RefreshCw,
  Send,
  MessageSquare,
} from "lucide-react"

interface StreamEvent {
  type: string
  agent?: string
  thread_id?: string
  content?: string
  tool?: string
  args?: any
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

interface StepWindow {
  id: string
  agent: string // "main", "web_agent", "retrieval_agent"
  title: string
  reasoning: string
  tools: Array<{ name: string; args: any }>
  isCompleted: boolean
  isCollapsed: boolean
}

export function AgentInspector() {
  const [projectId, setProjectId] = useState<string>("1")
  const [question, setQuestion] = useState<string>("")
  const [isStreaming, setIsStreaming] = useState<boolean>(false)
  const [statusText, setStatusText] = useState<string>("Ready")
  
  // Streaming state
  const [threadId, setThreadId] = useState<string>("")
  const [steps, setSteps] = useState<StepWindow[]>([])
  const [activeStepId, setActiveStepId] = useState<string | null>(null)

  // HITL State
  const [hitlDraft, setHitlDraft] = useState<{
    thread_id: string
    to: string
    subject: string
    body: string
  } | null>(null)
  const [hitlFeedback, setHitlFeedback] = useState<string>("")
  const [hitlDecision, setHitlDecision] = useState<string | null>(null)
  
  const [finalResult, setFinalResult] = useState<StreamEvent | null>(null)
  const streamEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const savedProject = localStorage.getItem("selected_project_id")
    if (savedProject) {
      setProjectId(savedProject)
    }
  }, [])

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [steps, hitlDraft, finalResult])

  const setPreset = (type: string) => {
    if (type === "email") {
      setQuestion(
        "Send an email to sarah@company.com with subject Project Review and body The agent pipeline with human approval is ready for demo."
      )
    } else if (type === "web") {
      setQuestion(
        "Research recent features of Next.js 15 and compare with Remix."
      )
    } else if (type === "retrieval") {
      setQuestion(
        "Search project documents for database schemas and security guidelines."
      )
    } else if (type === "basic") {
      setQuestion("Calculate 254 multiplied by 89.")
    }
  }

  const toggleStepCollapse = (stepId: string) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === stepId ? { ...step, isCollapsed: !step.isCollapsed } : step
      )
    )
  }

  // Create a new step window, auto-collapsing all previous steps (Antigravity-style)
  const createStepWindow = (agent: string, title?: string): string => {
    const newId = `step-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
    const defaultTitle =
      agent === "web_agent"
        ? "🌐 Web Agent Research"
        : agent === "retrieval_agent"
        ? "📁 Retrieval Agent Research"
        : "🧠 Main Agent Thinking"

    const newStep: StepWindow = {
      id: newId,
      agent,
      title: title || defaultTitle,
      reasoning: "",
      tools: [],
      isCompleted: false,
      isCollapsed: false, // active & expanded
    }

    setSteps((prev) => {
      // Auto-collapse all previous windows
      const collapsedPrev = prev.map((s) => ({ ...s, isCollapsed: true, isCompleted: true }))
      return [...collapsedPrev, newStep]
    })

    setActiveStepId(newId)
    return newId
  }

  const handleEvent = (evt: StreamEvent) => {
    const agent = evt.agent || "main"

    if (evt.type === "agent_started") {
      if (evt.thread_id) setThreadId(evt.thread_id)
      setStatusText("Main Agent Active")
      createStepWindow("main", "🧠 Main Agent Initial Planning")
    } else if (evt.type === "reasoning") {
      setSteps((prev) => {
        if (prev.length === 0) {
          // Fallback if no window exists
          const stepId = `step-${Date.now()}`
          return [
            {
              id: stepId,
              agent,
              title: agent === "main" ? "🧠 Main Agent Thinking" : `🔍 Sub-Agent: ${agent}`,
              reasoning: evt.content || "",
              tools: [],
              isCompleted: false,
              isCollapsed: false,
            },
          ]
        }

        // Check if last step matches current agent and is active
        const lastStep = prev[prev.length - 1]
        if (lastStep.agent === agent && !lastStep.isCompleted) {
          return prev.map((step, idx) =>
            idx === prev.length - 1
              ? { ...step, reasoning: step.reasoning + (evt.content || "") + "\n" }
              : step
          )
        } else {
          // Agent transitioned! Close previous step and open new step window
          const title =
            agent === "main"
              ? "🧠 Main Agent Reasoning"
              : agent === "web_agent"
              ? "🌐 Web Agent Research"
              : "📁 Retrieval Agent Research"

          const collapsedPrev = prev.map((s) => ({ ...s, isCollapsed: true, isCompleted: true }))
          const newStep: StepWindow = {
            id: `step-${Date.now()}`,
            agent,
            title,
            reasoning: (evt.content || "") + "\n",
            tools: [],
            isCompleted: false,
            isCollapsed: false,
          }
          return [...collapsedPrev, newStep]
        }
      })
    } else if (evt.type === "tool_started") {
      const toolName = evt.tool || "unknown"

      if (toolName === "web_agent" || toolName === "retrieval_agent") {
        // Main agent called subagent -> collapse main window & open subagent window
        setSteps((prev) => {
          const collapsedPrev = prev.map((s) => ({ ...s, isCollapsed: true, isCompleted: true }))
          const subTitle =
            toolName === "web_agent" ? "🌐 Web Agent Research" : "📁 Retrieval Agent Research"

          const newSubStep: StepWindow = {
            id: `step-${Date.now()}`,
            agent: toolName,
            title: subTitle,
            reasoning: "",
            tools: [],
            isCompleted: false,
            isCollapsed: false,
          }
          return [...collapsedPrev, newSubStep]
        })
      } else {
        // Basic tool call (e.g. calculator, send_email) inside current step
        setSteps((prev) => {
          if (prev.length === 0) return prev
          const lastIdx = prev.length - 1
          return prev.map((step, idx) =>
            idx === lastIdx
              ? { ...step, tools: [...step.tools, { name: toolName, args: evt.args }] }
              : step
          )
        })
      }
    } else if (evt.type === "tool_completed") {
      const toolName = evt.tool || ""
      if (toolName === "web_agent" || toolName === "retrieval_agent" || toolName === "sub_agent") {
        // Subagent finished -> collapse subagent window
        setSteps((prev) => {
          if (prev.length === 0) return prev
          return prev.map((step, idx) =>
            idx === prev.length - 1 ? { ...step, isCompleted: true, isCollapsed: true } : step
          )
        })
      }
    } else if (evt.type === "interrupt") {
      setStatusText("Waiting Human Approval")
      setHitlDraft({
        thread_id: evt.thread_id || threadId,
        to: evt.draft?.to || "",
        subject: evt.draft?.subject || "",
        body: evt.draft?.body || "",
      })
    } else if (evt.type === "agent_resumed") {
      setStatusText(`Resumed (${evt.decision})`)
      setHitlDecision(evt.decision || "processed")

      // Create new Main Agent window after resumption
      setSteps((prev) => {
        const collapsedPrev = prev.map((s) => ({ ...s, isCollapsed: true, isCompleted: true }))
        const resumeStep: StepWindow = {
          id: `step-${Date.now()}`,
          agent: "main",
          title: `🧠 Main Agent (Post-${evt.decision === "yes" ? "Approval" : "Rejection"} Processing)`,
          reasoning: `User response received: Decision=${evt.decision}` + (evt.feedback ? `, Feedback="${evt.feedback}"` : "") + "\n",
          tools: [],
          isCompleted: false,
          isCollapsed: false,
        }
        return [...collapsedPrev, resumeStep]
      })
    } else if (evt.type === "agent_completed") {
      setStatusText("Completed")
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

    setIsStreaming(true)
    setStatusText("Initializing Agent...")
    setThreadId("")
    setSteps([])
    setActiveStepId(null)
    setHitlDraft(null)
    setHitlFeedback("")
    setHitlDecision(null)
    setFinalResult(null)

    const token = localStorage.getItem("access_token")
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    const url = `${apiUrl}/projects/${projectId}/agent?question=${encodeURIComponent(question)}`

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

  const handleHITLResponse = async (decision: "yes" | "no") => {
    if (!hitlDraft) return
    setHitlDecision(decision)

    const token = localStorage.getItem("access_token")
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
    let url = `${apiUrl}/projects/${projectId}/agent/${hitlDraft.thread_id}/resume?decision=${decision}`
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
    <div className="max-w-6xl mx-auto p-6 space-y-6 text-slate-100 font-sans">
      {/* Control Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Cortex Agent Inspector & HITL Studio
              </h1>
              <p className="text-xs text-slate-400">
                Antigravity-style sequential thinking windows with human feedback & approval
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 text-xs font-semibold rounded-full border ${
                statusText.includes("Active") || statusText.includes("Resuming")
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse"
                  : statusText.includes("Waiting")
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                  : statusText.includes("Completed")
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}
            >
              {statusText}
            </span>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={() => setPreset("email")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-amber-300 transition-all"
          >
            <Mail className="w-3.5 h-3.5" /> 📧 Send Email HITL
          </button>
          <button
            onClick={() => setPreset("web")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-cyan-300 transition-all"
          >
            <Globe className="w-3.5 h-3.5" /> 🌐 Web Agent Research
          </button>
          <button
            onClick={() => setPreset("retrieval")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-emerald-300 transition-all"
          >
            <Database className="w-3.5 h-3.5" /> 📁 Retrieval Agent
          </button>
          <button
            onClick={() => setPreset("basic")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-purple-300 transition-all"
          >
            <Calculator className="w-3.5 h-3.5" /> 🧮 Calculator
          </button>
        </div>

        {/* Prompt input */}
        <div className="space-y-3">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            placeholder="Type your question or instruction for the Main Agent..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Project ID:</span>
              <input
                type="number"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-16 bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-xs text-slate-200"
              />
            </div>

            <button
              onClick={startStream}
              disabled={isStreaming || !question.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isStreaming ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Streaming...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" /> Run Agent Stream
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Sequential Thinking Windows (Antigravity Style) */}
      <div className="space-y-4">
        {steps.map((step) => {
          const isMain = step.agent === "main"
          const isWeb = step.agent === "web_agent"
          const isRetrieval = step.agent === "retrieval_agent"

          return (
            <div
              key={step.id}
              className={`rounded-xl overflow-hidden border transition-all shadow-md ${
                isMain
                  ? "bg-slate-900 border-l-4 border-l-indigo-500 border-slate-800"
                  : isWeb
                  ? "ml-6 bg-slate-900 border-l-4 border-l-cyan-500 border-slate-800"
                  : "ml-6 bg-slate-900 border-l-4 border-l-emerald-500 border-slate-800"
              }`}
            >
              {/* Window Header */}
              <div
                onClick={() => toggleStepCollapse(step.id)}
                className="bg-slate-950/80 px-4 py-3 border-b border-slate-800/60 flex items-center justify-between cursor-pointer hover:bg-slate-950 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  {isMain ? (
                    <Cpu className="w-4 h-4 text-indigo-400" />
                  ) : isWeb ? (
                    <Globe className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <Database className="w-4 h-4 text-emerald-400" />
                  )}

                  <span className="text-sm font-semibold text-slate-200">{step.title}</span>

                  <span
                    className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded-md border ${
                      !step.isCompleted
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse"
                        : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                    }`}
                  >
                    {!step.isCompleted
                      ? "Thinking..."
                      : step.isCollapsed
                      ? "Completed (Click to Expand)"
                      : "Completed"}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-slate-400">
                  {step.isCollapsed ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </div>

              {/* Window Body (collapsible) */}
              {!step.isCollapsed && (
                <div className="p-4 space-y-3 bg-slate-900/60">
                  <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800/80 font-mono text-xs text-slate-300 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                    {step.reasoning || "Processing..."}
                  </div>

                  {step.tools.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Tools Executed:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {step.tools.map((t, idx) => (
                          <div
                            key={idx}
                            className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-md text-xs font-mono text-amber-400 flex items-center gap-1.5"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>{t.name}</span>
                            <span className="text-slate-500 text-[10px]">
                              {JSON.stringify(t.args || {})}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* HITL Email Approval Card */}
        {hitlDraft && (
          <div className="bg-slate-900 border-2 border-amber-500 rounded-2xl p-5 shadow-2xl space-y-4 animate-pulse-subtle">
            <div className="flex items-center justify-between border-b border-amber-500/30 pb-3">
              <div className="flex items-center gap-2.5 text-amber-400 font-bold text-base">
                <Mail className="w-5 h-5" />
                <span>Human-in-the-Loop Approval Required: Email Draft</span>
              </div>
              <span className="px-2.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full text-xs font-semibold">
                Action Required
              </span>
            </div>

            {/* Email Form Preview */}
            <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-4 space-y-2.5 font-sans text-sm">
              <div className="flex gap-4">
                <span className="text-slate-400 font-semibold w-20">TO:</span>
                <span className="text-slate-100 font-medium">{hitlDraft.to || "Recipient"}</span>
              </div>
              <div className="flex gap-4">
                <span className="text-slate-400 font-semibold w-20">SUBJECT:</span>
                <span className="text-slate-100 font-medium">{hitlDraft.subject || "Subject"}</span>
              </div>
              <div className="pt-2 border-t border-slate-800 text-slate-200 whitespace-pre-wrap leading-relaxed">
                {hitlDraft.body || "No email body provided."}
              </div>
            </div>

            {/* User instructions / feedback box */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                <span>Instructions / Requested Changes for Agent (Optional):</span>
              </label>
              <textarea
                value={hitlFeedback}
                onChange={(e) => setHitlFeedback(e.target.value)}
                rows={2}
                placeholder="e.g. Change recipient to boss@corp.com, or add urgent tag to subject..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Approve / Reject buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => handleHITLResponse("no")}
                disabled={hitlDecision !== null}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-red-600/20 disabled:opacity-50 transition-all"
              >
                <XCircle className="w-4 h-4" /> Reject & Cancel Email
              </button>
              <button
                onClick={() => handleHITLResponse("yes")}
                disabled={hitlDecision !== null}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" /> Approve & Send Email
              </button>
            </div>
          </div>
        )}

        {/* Final Response Card */}
        {finalResult && (
          <div className="bg-gradient-to-br from-slate-900 to-emerald-950/30 border border-emerald-500/40 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-500/20 pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
                <CheckCircle2 className="w-5 h-5" />
                <span>Final Synthesis Response</span>
              </div>
              <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-semibold">
                Completed
              </span>
            </div>

            <div className="text-slate-100 text-sm leading-relaxed whitespace-pre-wrap">
              {finalResult.answer || "Agent completed successfully."}
            </div>

            <div className="flex flex-wrap gap-4 pt-3 border-t border-slate-800 text-xs text-slate-400 font-mono">
              <div>
                Input Tokens: <span className="text-slate-200">{finalResult.input_tokens || 0}</span>
              </div>
              <div>
                Output Tokens: <span className="text-slate-200">{finalResult.output_tokens || 0}</span>
              </div>
              <div>
                Total Tokens: <span className="text-indigo-300">{finalResult.total_tokens || 0}</span>
              </div>
              <div>
                Sources: <span className="text-slate-200">{(finalResult.sources || []).length}</span>
              </div>
            </div>
          </div>
        )}

        <div ref={streamEndRef} />
      </div>
    </div>
  )
}
