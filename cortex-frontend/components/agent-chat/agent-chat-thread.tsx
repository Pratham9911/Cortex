"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { Download, ExternalLink, FileText, Globe } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { downloadDocument } from "@/lib/ai-agent"
import { cn } from "@/lib/utils"
import type { Message, ThinkingEvent } from "./types"
import { AgentThinkingIndicator } from "./agent-thinking-indicator"

type AgentChatThreadProps = {
  messages: Message[]
  isThinking: boolean
  thinkingEvents: ThinkingEvent[]
  isDark: boolean
  userInitials: string
  onSourceAccessChanged?: () => void
}

function MessageSources({
  message,
  isDark,
  onSourceAccessChanged,
}: {
  message: Message
  isDark: boolean
  onSourceAccessChanged?: () => void
}) {
  const webSources = message.sources?.web ?? []
  const documentSources = (message.sources?.documents ?? []).filter(
    (source) => typeof source.can_download === "boolean"
  )

  if (webSources.length === 0 && documentSources.length === 0 && !message.latencyMs) {
    return null
  }

  return (
    <div className="mt-4 space-y-3">
      {message.latencyMs ? (
        <div className={cn("text-[11px]", isDark ? "text-zinc-500" : "text-slate-500")}>
          Answered in {(message.latencyMs / 1000).toFixed(1)}s
        </div>
      ) : null}

      {documentSources.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {documentSources.map((source, index) => (
            <div
              key={`${source.document_id}-${source.version_number}-${source.page_number}-${index}`}
              className={cn(
                "flex max-w-[280px] items-center gap-2 rounded-md border px-3 py-2 text-xs",
                isDark
                  ? "border-zinc-800 bg-zinc-900/60 text-zinc-250"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              )}
            >
              <FileText className="size-4 shrink-0 text-indigo-500" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">
                  {source.document_title || source.file_name || `Document ${source.document_id}`}
                </div>
                <div className={cn("truncate", isDark ? "text-zinc-500" : "text-slate-500")}>
                  {source.file_name}
                  {source.page_number ? ` - page ${source.page_number}` : ""}
                </div>
              </div>
              {source.can_download ? (
                <button
                  type="button"
                  onClick={() => {
                    void downloadDocument(source.document_id).catch((error) => {
                      onSourceAccessChanged?.()
                      window.alert(
                        error instanceof Error
                          ? error.message
                          : "You no longer have permission to download this document."
                      )
                    })
                  }}
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-md",
                    isDark ? "hover:bg-zinc-800" : "hover:bg-slate-200"
                  )}
                  aria-label="Download document"
                >
                  <Download className="size-3.5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {webSources.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {webSources.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "flex max-w-[280px] items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors",
                isDark
                  ? "border-zinc-800 bg-zinc-900/60 text-zinc-250 hover:bg-zinc-850"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              )}
            >
              {source.favicon ? (
                <img src={source.favicon} alt="" className="size-4 shrink-0 rounded-sm" />
              ) : (
                <Globe className="size-4 shrink-0 text-sky-500" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{source.title || source.url}</div>
                {source.snippet ? (
                  <div className={cn("truncate", isDark ? "text-zinc-500" : "text-slate-500")}>
                    {source.snippet}
                  </div>
                ) : null}
              </div>
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function AgentChatThread({
  messages,
  isThinking,
  thinkingEvents,
  isDark,
  onSourceAccessChanged,
}: AgentChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldStickToBottomRef = useRef(true)
  const previousMessageCountRef = useRef(messages.length)

  const getViewport = () => {
    return scrollRef.current?.querySelector<HTMLDivElement>("[data-slot=scroll-area-viewport]")
  }

  useEffect(() => {
    const viewport = getViewport()
    if (!viewport) return

    const updateStickiness = () => {
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      shouldStickToBottomRef.current = distanceFromBottom < 96
    }

    updateStickiness()
    viewport.addEventListener("scroll", updateStickiness, { passive: true })

    return () => viewport.removeEventListener("scroll", updateStickiness)
  }, [])

  useLayoutEffect(() => {
    const viewport = getViewport()
    if (!viewport) return

    const messageWasAppended = messages.length > previousMessageCountRef.current
    previousMessageCountRef.current = messages.length

    if (!shouldStickToBottomRef.current && !messageWasAppended) {
      return
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: messageWasAppended ? "smooth" : "auto",
    })
  }, [messages.length, isThinking])

  return (
    <ScrollArea ref={scrollRef} className="min-h-0 flex-1">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-8 py-8">
        {messages.map((message) => {
          const isUser = message.role === "user"
          return (
            <div
              key={message.id}
              className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "text-[13.5px] leading-relaxed whitespace-pre-wrap",
                  isUser
                    ? isDark
                      ? "max-w-[80%] rounded-[20px] px-4.5 py-2.5 bg-[#1C1C1E] text-zinc-105 shadow-sm"
                      : "max-w-[80%] rounded-[20px] px-4.5 py-2.5 bg-[#F4F4F5] text-slate-800 shadow-sm"
                    : "w-full bg-transparent text-slate-800 dark:text-zinc-200 py-1.5"
                )}
              >
                {message.content}
                {!isUser ? (
                  <MessageSources
                    message={message}
                    isDark={isDark}
                    onSourceAccessChanged={onSourceAccessChanged}
                  />
                ) : null}
              </div>
            </div>
          )
        })}
        {isThinking && (
          <div className="flex w-full justify-start">
            <AgentThinkingIndicator events={thinkingEvents} isDark={isDark} />
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
