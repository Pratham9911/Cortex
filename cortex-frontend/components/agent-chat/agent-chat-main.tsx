"use client"

import { Settings, Share2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ActivityItem, HITLPermissionState, Message, PromptCard, ThinkingEvent } from "./types"
import { AgentChatComposer } from "./agent-chat-composer"
import { AgentChatThread } from "./agent-chat-thread"
import { AgentWelcomeView } from "./agent-welcome"

import type { ProjectDocumentItem } from "@/lib/ai-agent"

type AgentChatMainProps = {
  messages: Message[]
  prompts: PromptCard[]
  thinkingEvents: ThinkingEvent[]
  input: string
  onInputChange: (value: string) => void
  onSend: (text?: string, isAgentMode?: boolean) => void
  onNewChat: () => void
  isThinking: boolean
  isDark: boolean
  userInitials: string
  activeChatTitle?: string
  activeChatId?: string | null
  onSourceAccessChanged?: () => void
  isAgentMode?: boolean
  setIsAgentMode?: (active: boolean) => void
  agentActivities?: ActivityItem[]
  elapsedSeconds?: number
  hitlPermission?: HITLPermissionState | null
  onHITLResponse?: (decision: "yes" | "no" | "tell_agent", feedback?: string) => void
  isMessagesLoading?: boolean
  onStop?: () => void
  projectId?: number
  selectedDocs?: ProjectDocumentItem[]
  onSelectDocs?: (docs: ProjectDocumentItem[]) => void
  onRemoveDoc?: (docId: number) => void
}

function ThreadSkeleton({ isDark }: { isDark: boolean }) {
  const pulse = isDark ? "bg-zinc-800" : "bg-slate-200"

  return (
    <div className="min-h-0 flex-1 overflow-hidden px-8 pt-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 animate-pulse">
        <div className="flex w-full justify-end">
          <div className={cn("h-10 w-64 rounded-[20px]", pulse)} />
        </div>
        <div className="flex w-full justify-start">
          <div className="w-full space-y-3 py-1">
            <div className={cn("h-4 w-3/4 rounded-md", pulse)} />
            <div className={cn("h-4 w-5/6 rounded-md", pulse)} />
            <div className={cn("h-4 w-1/2 rounded-md", pulse)} />
          </div>
        </div>
        <div className="flex w-full justify-end">
          <div className={cn("h-10 w-48 rounded-[20px]", pulse)} />
        </div>
        <div className="flex w-full justify-start">
          <div className="w-full space-y-3 py-1">
            <div className={cn("h-4 w-4/5 rounded-md", pulse)} />
            <div className={cn("h-4 w-2/3 rounded-md", pulse)} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function AgentChatMain({
  messages,
  prompts,
  thinkingEvents,
  input,
  onInputChange,
  onSend,
  onNewChat,
  isThinking,
  isDark,
  userInitials,
  activeChatTitle,
  activeChatId,
  onSourceAccessChanged,
  isAgentMode = false,
  setIsAgentMode,
  agentActivities = [],
  elapsedSeconds = 0,
  hitlPermission = null,
  onHITLResponse,
  isMessagesLoading = false,
  onStop,
  projectId = 1,
  selectedDocs = [],
  onSelectDocs,
  onRemoveDoc,
}: AgentChatMainProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col",
        isDark ? "bg-[#0A0A0A]" : "bg-white"
      )}
    >
      <header
        className={cn(
          "flex shrink-0 items-center justify-between border-b px-6 py-3",
          isDark ? "border-zinc-800" : "border-slate-200"
        )}
      >
        <div className="flex items-center gap-2">
          <h1 className={cn("text-sm font-bold", isDark ? "text-white" : "text-[#090D1A]")}>
            Cortex AI
          </h1>
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
              isDark
                ? "border-zinc-800 text-zinc-400 bg-zinc-900"
                : "border-slate-200 text-slate-500 bg-slate-50"
            )}
          >
            Plus
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors",
              isDark
                ? "border-zinc-800 bg-[#161618] text-zinc-300 hover:bg-zinc-800"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            <Settings className="size-3.5 text-slate-500 dark:text-zinc-400" />
            <span>Configuration</span>
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors",
              isDark
                ? "border-zinc-800 bg-[#161618] text-zinc-300 hover:bg-zinc-800"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            <Share2 className="size-3.5 text-slate-500 dark:text-zinc-400" />
            <span>Share</span>
          </button>
          <button
            type="button"
            onClick={onNewChat}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all shadow-sm",
              isDark
                ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                : "bg-[#090D1A] text-white hover:bg-[#131b31]"
            )}
          >
            <span>New Chat</span>
            <Sparkles className="size-3.5 text-indigo-305 dark:text-indigo-400" />
          </button>
        </div>
      </header>

      {isMessagesLoading ? (
        <ThreadSkeleton isDark={isDark} />
      ) : messages.length === 0 ? (
        <AgentWelcomeView
          prompts={prompts}
          onSend={(text) => onSend(text, isAgentMode)}
          disabled={isThinking}
          isDark={isDark}
        />
      ) : (
        <AgentChatThread
          messages={messages}
          isThinking={isThinking}
          thinkingEvents={thinkingEvents}
          isDark={isDark}
          userInitials={userInitials}
          onSourceAccessChanged={onSourceAccessChanged}
          agentActivities={agentActivities}
          elapsedSeconds={elapsedSeconds}
          isAgentMode={isAgentMode}
          hitlPermission={hitlPermission}
          onHITLResponse={onHITLResponse}
          activeChatId={activeChatId}
        />
      )}

      <AgentChatComposer
        value={input}
        onChange={onInputChange}
        onSend={(isAgent) => onSend(undefined, isAgent ?? isAgentMode)}
        onStop={onStop}
        disabled={isThinking}
        isDark={isDark}
        isAgentMode={isAgentMode}
        setIsAgentMode={setIsAgentMode}
        projectId={projectId}
        selectedDocs={selectedDocs}
        onSelectDocs={onSelectDocs}
        onRemoveDoc={onRemoveDoc}
      />
    </div>
  )
}

