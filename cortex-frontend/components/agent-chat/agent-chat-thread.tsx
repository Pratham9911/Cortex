"use client"

import React, { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Download, ExternalLink, FileText, Globe, Copy, Check, RotateCw, MoreHorizontal } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
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

const CopyButton = ({ text, isDark }: { text: string; isDark: boolean }) => {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch (e) {}
      }}
      className={cn(
        "absolute right-2 top-2 p-1.5 rounded-md border text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer backdrop-blur-xs shadow-xs z-10",
        copied
          ? "border-green-500 bg-green-500/10 text-green-400 opacity-100"
          : isDark
            ? "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:bg-zinc-850 hover:text-white"
            : "border-slate-200 bg-white/90 text-slate-650 hover:bg-slate-50 hover:text-slate-900"
      )}
      aria-label="Copy block content"
    >
      {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
    </button>
  )
}

function AssistantMessageContent({ content, isDark }: { content: string; isDark: boolean }) {
  return (
    <div className={cn(
      "prose prose-sm max-w-none text-[13.5px] leading-relaxed break-words",
      isDark ? "prose-invert text-zinc-200" : "text-slate-800"
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-base font-bold mt-4 mb-2 first:mt-0 text-zinc-900 dark:text-white">{children}</h1>,
          h2: ({ children }) => <h2 className="text-[15px] font-semibold mt-3.5 mb-1.5 first:mt-0 text-zinc-900 dark:text-zinc-100">{children}</h2>,
          h3: ({ children }) => <h3 className="text-[14px] font-semibold mt-3 mb-1 first:mt-0 text-zinc-900 dark:text-zinc-200">{children}</h3>,
          p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-2.5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2.5 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ href, children }) => {
            let faviconUrl = ""
            if (href && href.startsWith("http")) {
              try {
                const parsed = new URL(href)
                faviconUrl = `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`
              } catch (e) {}
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border font-semibold transition-all shadow-2xs hover:scale-[1.01] hover:no-underline",
                  isDark
                    ? "bg-zinc-900/40 border-zinc-800 text-indigo-400 hover:bg-zinc-850 hover:text-indigo-350"
                    : "bg-slate-50 border-slate-200/80 text-indigo-650 hover:bg-slate-100 hover:text-indigo-600"
                )}
              >
                {faviconUrl && (
                  <img src={faviconUrl} className="size-3.5 object-contain rounded-xs shrink-0" alt="" />
                )}
                <span>{children}</span>
              </a>
            )
          },
          strong: ({ children }) => <strong className="font-semibold text-zinc-900 dark:text-white">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          pre: ({ children }) => {
            let codeText = ""
            try {
              const codeElement = React.Children.only(children) as React.ReactElement<any>
              codeText = codeElement.props.children as string
            } catch (e) {
              codeText = String(children)
            }
            return (
              <div className="relative group my-3">
                <pre className={cn(
                  "p-3 rounded-lg font-mono text-[12px] overflow-x-auto border",
                  isDark ? "bg-zinc-950 border-zinc-800 text-zinc-250" : "bg-slate-50 border-slate-200 text-slate-800"
                )}>
                  {children}
                </pre>
                <CopyButton text={codeText} isDark={isDark} />
              </div>
            )
          },
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || "");
            const inline = !match;
            return inline ? (
              <code className={cn(
                "px-1.5 py-0.5 rounded-md font-mono text-[12px]",
                isDark ? "bg-zinc-800 text-zinc-200" : "bg-slate-100 text-slate-800"
              )} {...props}>
                {children}
              </code>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className={cn(
              "pl-4 border-l-2 my-3 italic",
              isDark ? "border-zinc-700 text-zinc-400" : "border-slate-300 text-slate-600"
            )}>
              {children}
            </blockquote>
          ),
          table: ({ children }) => {
            let tableText = ""
            try {
              const extractText = (node: React.ReactNode): string => {
                if (!node) return ""
                if (typeof node === "string" || typeof node === "number") return String(node)
                if (Array.isArray(node)) return node.map(extractText).join("")
                if (React.isValidElement<any>(node)) {
                  const type = node.type as any
                  const isCell = type === "td" || type === "th"
                  const isRow = type === "tr"
                  const cellContent = extractText((node as any).props.children)
                  if (isCell) return cellContent + "\t"
                  if (isRow) return cellContent.trimEnd() + "\n"
                  return cellContent
                }
                return ""
              }
              tableText = extractText(children).trim()
            } catch (e) {}

            return (
              <div className="relative group my-3.5">
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-850">
                  <table className="w-full text-left border-collapse text-[12.5px]">
                    {children}
                  </table>
                </div>
                <CopyButton text={tableText} isDark={isDark} />
              </div>
            )
          },
          thead: ({ children }) => (
            <thead className={cn(
              "border-b font-semibold",
              isDark ? "bg-[#0B0B0C] border-zinc-800 text-white" : "bg-slate-200 border-slate-300 text-slate-900"
            )}>
              {children}
            </thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className={cn(
              "border-b last:border-b-0 transition-colors",
              isDark ? "border-zinc-850/60 hover:bg-zinc-900/60" : "border-slate-100 hover:bg-slate-100/60"
            )}>
              {children}
            </tr>
          ),
          th: ({ children }) => <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider">{children}</th>,
          td: ({ children }) => <td className="px-4 py-2.5 transition-colors">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type AggregatedDocumentSource = {
  document_id: number
  document_title?: string | null
  file_name?: string | null
  version_number?: number | null
  can_download?: boolean
  pages: number[]
}

function getSourceIcon(fileName?: string | null) {
  if (!fileName) return <FileText className="size-4.5 text-indigo-500" />
  const lower = fileName.toLowerCase()
  if (lower.endsWith(".pdf")) {
    return <img src="/icons/pdf.svg" className="size-4.5 object-contain shrink-0" alt="PDF" />
  }
  if (lower.endsWith(".txt")) {
    return <img src="/icons/txt.svg" className="size-4.5 object-contain shrink-0" alt="TXT" />
  }
  return <FileText className="size-4.5 text-indigo-500" />
}

function formatPages(pages: number[], fileName?: string | null) {
  if (pages.length === 0) return ""
  if (pages.length === 1 && pages[0] === 1 && fileName?.toLowerCase().endsWith(".txt")) {
    return ""
  }
  if (pages.length === 1) return `page ${pages[0]}`
  return `pages ${pages.join(", ")}`
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
  const [copied, setCopied] = useState(false)
  const webSources = message.sources?.web ?? []
  const documentSources = (message.sources?.documents ?? []).filter(
    (source) => typeof source.can_download === "boolean" || source.document_id !== undefined
  )

  if (webSources.length === 0 && documentSources.length === 0) {
    return null
  }

  const aggregatedDocs: Record<number, AggregatedDocumentSource> = {}
  for (const source of documentSources) {
    const docId = source.document_id
    if (!aggregatedDocs[docId]) {
      aggregatedDocs[docId] = {
        document_id: docId,
        document_title: source.document_title,
        file_name: source.file_name,
        version_number: source.version_number,
        can_download: source.can_download,
        pages: []
      }
    }
    if (source.page_number !== undefined && source.page_number !== null) {
      if (!aggregatedDocs[docId].pages.includes(source.page_number)) {
        aggregatedDocs[docId].pages.push(source.page_number)
      }
    }
  }

  const documentGroups = Object.values(aggregatedDocs)
  documentGroups.forEach((group) => {
    group.pages.sort((a, b) => a - b)
  })

  const allIconSources = [
    ...documentGroups.map(d => ({ type: "document" as const, title: d.document_title || d.file_name || "", favicon: null as string | null | undefined })),
    ...webSources.map(w => {
      let favicon = w.favicon
      if (!favicon && w.url) {
        try {
          const parsed = new URL(w.url)
          favicon = `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`
        } catch (e) {}
      }
      return { type: "web" as const, favicon, title: w.title, url: w.url }
    })
  ]

  const totalSourcesCount = documentGroups.length + webSources.length

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {}
  }

  const sourcesPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none",
            isDark
              ? "border-zinc-700/60 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          )}
        >
          <div className="flex -space-x-1.5">
            {allIconSources.slice(0, 3).map((src, i) => {
              const isPdf = src.title.toLowerCase().endsWith(".pdf")
              const isTxt = src.title.toLowerCase().endsWith(".txt")
              return (
                <div
                  key={i}
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full shrink-0 overflow-hidden ring-2",
                    isDark ? "ring-[#111112] bg-zinc-800" : "ring-white bg-slate-100"
                  )}
                >
                  {src.type === "web" ? (
                    src.favicon ? (
                      <img src={src.favicon} className="size-3.5 object-contain" alt="" />
                    ) : (
                      <Globe className="size-3 text-sky-500" />
                    )
                  ) : isPdf ? (
                    <img src="/icons/pdf.svg" className="size-3.5 object-contain" alt="" />
                  ) : isTxt ? (
                    <img src="/icons/txt.svg" className="size-3.5 object-contain" alt="" />
                  ) : (
                    <FileText className="size-3 text-indigo-500" />
                  )}
                </div>
              )
            })}
          </div>
          <span>
            {totalSourcesCount} {totalSourcesCount === 1 ? "source" : "sources"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "w-[340px] sm:w-[400px] rounded-xl border p-4 shadow-2xl",
          isDark
            ? "bg-zinc-900 border-zinc-700/50 text-zinc-200"
            : "bg-white border-slate-200 text-slate-800"
        )}
        align="start"
        side="bottom"
        sideOffset={8}
      >
        <div className="font-semibold text-sm mb-3 pb-2 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <span>Sources</span>
          <span className="text-[11px] font-normal text-slate-400 dark:text-zinc-500">
            {totalSourcesCount} total references
          </span>
        </div>

        <div className="max-h-72 overflow-y-auto pr-1 space-y-2 scrollbar-thin">
          {documentGroups.map((group) => {
            const pagesStr = formatPages(group.pages, group.file_name)
            const titleStr = group.document_title || group.file_name || `Document ${group.document_id}`
            const displayTitle = pagesStr ? `${pagesStr} of ${titleStr}` : titleStr

            return (
              <div
                key={group.document_id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-2.5 text-xs transition-colors",
                  isDark
                    ? "border-zinc-700/40 bg-zinc-800/40 text-zinc-200 hover:bg-zinc-800/70"
                    : "border-slate-100 bg-slate-50/50 text-slate-800 hover:bg-slate-100/60"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center size-8 rounded-lg shrink-0 overflow-hidden",
                  isDark ? "bg-zinc-700/50" : "bg-slate-100"
                )}>
                  {getSourceIcon(group.file_name)}
                </div>

                <div className="min-w-0 flex-1 flex flex-col justify-center">
                  <div className="font-semibold leading-snug line-clamp-2">
                    {displayTitle}
                  </div>
                  {group.file_name && (
                    <span className={cn("truncate text-[10px] mt-0.5", isDark ? "text-zinc-500" : "text-slate-500")}>
                      {group.file_name}
                    </span>
                  )}
                </div>

                {group.can_download ? (
                  <button
                    type="button"
                    onClick={() => {
                      void downloadDocument(group.document_id).catch((error) => {
                        onSourceAccessChanged?.()
                        window.alert(
                          error instanceof Error
                            ? error.message
                            : "You no longer have permission to download this document."
                        )
                      })
                    }}
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-md transition-colors",
                      isDark ? "hover:bg-zinc-800" : "hover:bg-slate-200"
                    )}
                    aria-label="Download document"
                  >
                    <Download className="size-3.5" />
                  </button>
                ) : null}
              </div>
            )
          })}

          {webSources
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .map((source, index) => {
              let hostname = source.url
              let favicon = source.favicon
              try {
                const parsed = new URL(source.url)
                hostname = parsed.hostname.replace(/^www\./, "")
                if (!favicon) {
                  favicon = `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`
                }
              } catch (e) {}

              return (
                <a
                  key={`${source.url}-${index}`}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-2.5 text-xs transition-colors",
                    isDark
                      ? "border-zinc-700/40 bg-zinc-800/40 text-zinc-200 hover:bg-zinc-800/70"
                      : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                  )}
                >
                  <div className={cn(
                    "flex items-center justify-center size-8 rounded-lg shrink-0 overflow-hidden",
                    isDark ? "bg-zinc-700/50" : "bg-slate-100"
                  )}>
                    {favicon ? (
                      <img src={favicon} alt="" className="size-5 object-contain rounded-sm" />
                    ) : (
                      <Globe className="size-4 text-sky-500" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <div className="font-semibold leading-snug line-clamp-2">
                      {source.title || hostname}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                      <span className={cn("truncate", isDark ? "text-zinc-500" : "text-slate-500")}>
                        {hostname}
                      </span>
                      {source.score !== undefined && source.score !== null && source.score > 0 && (
                        <>
                          <span className={isDark ? "text-zinc-700" : "text-slate-350"}>•</span>
                          <span
                            className={cn(
                              "font-medium shrink-0",
                              isDark ? "text-sky-400" : "text-sky-600"
                            )}
                          >
                            {(source.score * 100).toFixed(0)}% match
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-md",
                      isDark ? "text-zinc-500" : "text-slate-400"
                    )}
                  >
                    <ExternalLink className="size-3.5" />
                  </div>
                </a>
              )
            })}
        </div>
      </PopoverContent>
    </Popover>
  )

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      {/* Plain action icon buttons — no border wrapper */}
      <button
        type="button"
        onClick={handleCopyText}
        className={cn(
          "p-1.5 rounded-md transition-all duration-150 active:scale-95 cursor-pointer relative group",
          copied
            ? "text-green-500"
            : isDark
              ? "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
              : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        )}
        aria-label="Copy response to clipboard"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap shadow-md z-20">
          {copied ? "Copied!" : "Copy"}
        </span>
      </button>

      <button
        type="button"
        className={cn(
          "p-1.5 rounded-md transition-colors relative group cursor-pointer active:scale-95",
          isDark
            ? "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
            : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        )}
        aria-label="Regenerate"
      >
        <RotateCw className="size-3.5" />
        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap shadow-md z-20">
          Regenerate
        </span>
      </button>

      <button
        type="button"
        className={cn(
          "p-1.5 rounded-md transition-colors relative group cursor-pointer active:scale-95",
          isDark
            ? "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
            : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        )}
        aria-label="More options"
      >
        <MoreHorizontal className="size-3.5" />
        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap shadow-md z-20">
          More
        </span>
      </button>

      {/* Thin divider */}
      <div className={cn("w-px h-4 shrink-0", isDark ? "bg-zinc-700" : "bg-slate-200")} />

      {/* Grouped sources button trigger popover */}
      {sourcesPopover}

      {message.latencyMs ? (
        <div className={cn("text-[11px] ml-1.5", isDark ? "text-zinc-500" : "text-slate-550")}>
          Answered in {(message.latencyMs / 1000).toFixed(1)}s
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
                  "text-[13.5px] leading-relaxed",
                  isUser
                    ? isDark
                      ? "max-w-[80%] rounded-[20px] px-4.5 py-2.5 bg-[#1C1C1E] text-zinc-105 shadow-sm whitespace-pre-wrap"
                      : "max-w-[80%] rounded-[20px] px-4.5 py-2.5 bg-[#F4F4F5] text-slate-800 shadow-sm whitespace-pre-wrap"
                    : "w-full bg-transparent text-slate-800 dark:text-zinc-200 py-1"
                )}
              >
                {isUser ? (
                  message.content
                ) : (
                  <AssistantMessageContent content={message.content} isDark={isDark} />
                )}
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
