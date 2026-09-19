"use client"

import React, { useEffect, useLayoutEffect, useRef, useState } from "react"
import {
  Download,
  ExternalLink,
  FileText,
  Globe,
  Copy,
  Check,
  RotateCw,
  MoreHorizontal,
  Clock,
  ChevronDown,
  ChevronRight,
  Database,
  Github,
  Mail,
  Wrench,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  MessageSquare,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"
import { ScrollArea } from "@/components/ui/scroll-area"
import { downloadDocument } from "@/lib/ai-agent"
import { cn } from "@/lib/utils"
import type { ActivityItem, HITLPermissionState, Message, MessageSources, ThinkingEvent } from "./types"
import { AgentThinkingIndicator } from "./agent-thinking-indicator"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type AgentChatThreadProps = {
  messages: Message[]
  isThinking: boolean
  thinkingEvents: ThinkingEvent[]
  isDark: boolean
  userInitials: string
  onSourceAccessChanged?: () => void
  agentActivities?: ActivityItem[]
  elapsedSeconds?: number
  isAgentMode?: boolean
  hitlPermission?: HITLPermissionState | null
  onHITLResponse?: (decision: "yes" | "no" | "tell_agent", feedback?: string) => void
  activeChatId?: string | null
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

const BR_TAG_SPLIT = /<br\s*\/?>/gi
const BR_TAG_TEST = /<br\s*\/?>/i

function flattenMarkdownChildren(node: React.ReactNode): string {
  if (node == null || node === false) return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(flattenMarkdownChildren).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return flattenMarkdownChildren(node.props.children)
  }
  return ""
}

function containsBrTag(node: React.ReactNode): boolean {
  return BR_TAG_TEST.test(flattenMarkdownChildren(node))
}

function TableCellContent({ children }: { children: React.ReactNode }) {
  if (!containsBrTag(children)) return <>{children}</>

  const lines = flattenMarkdownChildren(children)
    .split(BR_TAG_SPLIT)
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <div className="space-y-1">
      {lines.map((line, index) => (
        <div key={index} className="leading-snug">{line}</div>
      ))}
    </div>
  )
}

function extractDocCitationInfo(
  href?: string,
  children?: React.ReactNode
): { docId: number; page?: number } | null {
  const childStr = flattenMarkdownChildren(children)
  const fullStr = `${href || ""} ${childStr}`
  const lowerStr = fullStr.toLowerCase()

  if (
    !lowerStr.includes("cortex.cite") &&
    !lowerStr.includes("cite") &&
    !lowerStr.includes("/doc/")
  ) {
    return null
  }

  let docId: number | undefined
  const docMatch =
    fullStr.match(/\/doc\/(\d+)/i) ||
    fullStr.match(/doc[_\-\s]*(\d+)/i) ||
    fullStr.match(/cite[_\-\s]*(\d+)/i)

  if (docMatch) {
    docId = parseInt(docMatch[1], 10)
  }

  let page: number | undefined
  const pageMatch =
    fullStr.match(/[?&]page=(\d+)/i) ||
    fullStr.match(/[:\s_]p(?:age)?\.?\s*(\d+)/i)

  if (pageMatch) {
    page = parseInt(pageMatch[1], 10)
  }

  if (docId !== undefined && !isNaN(docId)) {
    return { docId, page }
  }

  return null
}

function preprocessCitationTokens(content: string): string {
  if (!content) return ""

  let processed = content

  // 1. Remove trailing backslashes at line endings (e.g. `meeting.\` -> `meeting.`)
  processed = processed.replace(/\\\s*\n/g, "\n")

  // 2. Normalize citation tokens into markdown links without eating newlines (\s* -> [ \t]*)
  processed = processed.replace(
    /`?[ \t]*[\[【\(\{]cite[:：][ \t]*doc_?(\d+)(?:[:：]p?\.?[ \t]*(\d+))?[\]】\)\}][ \t]*`?/gi,
    (_, docId, page) => {
      return page ? ` [cite:doc-${docId}-p${page}](https://cortex.cite/doc/${docId}?page=${page}) ` : ` [cite:doc-${docId}](https://cortex.cite/doc/${docId}) `
    }
  )

  processed = processed.replace(
    /`?[ \t]*[\[【\(\{]cite[:：][ \t]*(\d+)(?:[:：]p?\.?[ \t]*(\d+))?[\]】\)\}][ \t]*`?/gi,
    (_, docId, page) => {
      return page ? ` [cite:doc-${docId}-p${page}](https://cortex.cite/doc/${docId}?page=${page}) ` : ` [cite:doc-${docId}](https://cortex.cite/doc/${docId}) `
    }
  )

  processed = processed.replace(
    /`?[ \t]*[\[【\(\{]doc[:：]?[ \t]*(\d+)(?:,[ \t]*page[:：]?[ \t]*(\d+))?[\]】\)\}][ \t]*`?/gi,
    (_, docId, page) => {
      return page ? ` [cite:doc-${docId}-p${page}](https://cortex.cite/doc/${docId}?page=${page}) ` : ` [cite:doc-${docId}](https://cortex.cite/doc/${docId}) `
    }
  )

  processed = processed.replace(/`?[ \t]*\{pg[ \t]*no\.?[ \t]*(\d+)[ \t]*of[ \t]*doc[ \t]*(\d+)\}[ \t]*`?/gi, (_, page, docId) => {
    return ` [cite:doc-${docId}-p${page}](https://cortex.cite/doc/${docId}?page=${page}) `
  })
  processed = processed.replace(/`?[ \t]*\{from[ \t]*doc[ \t]*(\d+)\}[ \t]*`?/gi, (_, docId) => {
    return ` [cite:doc-${docId}](https://cortex.cite/doc/${docId}) `
  })

  // 3. Normalize whitespace leading into headings (e.g. "   ### Heading" -> "### Heading")
  processed = processed.replace(/^[ \t]+(#{1,6}\s+)/gm, "$1")

  // 4. Ensure headings are separated from preceding text by a double newline
  processed = processed.replace(/([^\n])\n+(#{1,6}\s+)/g, "$1\n\n$2")
  processed = processed.replace(/([^\n#])\s+(#{1,6}\s+)/g, "$1\n\n$2")

  // 5. Unpack inline table rows concatenated on a single line (e.g. "| col1 | col2 | |---|---| | val1 | val2 |")
  processed = processed.replace(/\|[ \t]*\|/g, "|\n|")
  processed = processed.replace(/\|[ \t]*\r?\n[ \t]*\|/g, "|\n|")

  // 6. Ensure double newlines before table header row and after table end
  processed = processed.replace(/([^\n|])\n+(\|[^\n]+\|)/g, "$1\n\n$2")
  processed = processed.replace(/(\|[^\n]+\|)\n([^\n|#\s])/g, "$1\n\n$2")

  // 7. Ensure bullet/numbered lists starting after non-list text have a preceding blank line
  processed = processed.replace(/([^\n\-\*\d\s])\n([*\-] |\d+\. )/g, "$1\n\n$2")

  return processed
}


function getSourceIcon(fileName?: string | null) {
  if (!fileName) return <FileText className="size-4 text-indigo-500 shrink-0" />
  const lower = fileName.toLowerCase()
  if (lower.endsWith(".pdf")) {
    return <img src="/icons/pdf.svg" className="size-4 object-contain shrink-0" alt="PDF" />
  }
  if (lower.endsWith(".txt")) {
    return <img src="/icons/txt.svg" className="size-4 object-contain shrink-0" alt="TXT" />
  }
  if (lower.endsWith(".md")) {
    return <img src="/icons/md.png" className="size-4 object-contain shrink-0" alt="MD" />
  }
  if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
    return <img src="/icons/docx.png" className="size-4 object-contain shrink-0" alt="DOCX" />
  }
  if (lower.endsWith(".pptx") || lower.endsWith(".ppt")) {
    return <img src="/icons/pptx.png" className="size-4 object-contain shrink-0" alt="PPTX" />
  }
  return <FileText className="size-4 text-indigo-500 shrink-0" />
}

function InlineDocCitationBadge({
  docId,
  page,
  sources,
  isDark,
  onSourceAccessChanged,
}: {
  docId: number
  page?: number | null
  sources?: MessageSources | null
  isDark: boolean
  onSourceAccessChanged?: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setIsOpen(true)
  }

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setIsOpen(false)
    }, 150)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const docSource = (sources?.documents ?? []).find((d) => d.document_id === docId)

  const fileName = docSource?.file_name
  const rawTitle = docSource?.document_title || docSource?.file_name || `Doc #${docId}`
  const pageText = page ? `pg ${page}` : ""

  const displayTitle = rawTitle.length > 20 ? `${rawTitle.slice(0, 18)}...` : rawTitle

  const handleDownload = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (docSource?.can_download !== false) {
      void downloadDocument(docId).catch((error) => {
        onSourceAccessChanged?.()
        window.alert(
          error instanceof Error
            ? error.message
            : "You no longer have permission to download this document."
        )
      })
    }
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <span
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setIsOpen(!isOpen)
          }}
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 mx-1 rounded-full text-[11px] font-semibold border transition-all duration-150 shadow-2xs align-middle select-none cursor-pointer hover:scale-[1.04] active:scale-[0.96]",
            isDark
              ? "bg-indigo-950/70 border-indigo-700/60 text-indigo-300 hover:bg-indigo-900/80 hover:border-indigo-500/80"
              : "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300"
          )}
        >
          {/* 1. Document Format Icon */}
          <span className="shrink-0 flex items-center justify-center">
            {getSourceIcon(fileName)}
          </span>

          {/* 2. Page Number */}
          {pageText ? (
            <span
              className={cn(
                "text-[9.5px] font-semibold px-1 py-0.2 rounded-xs shrink-0",
                isDark ? "bg-indigo-900/80 text-indigo-200" : "bg-indigo-100 text-indigo-800"
              )}
            >
              {pageText}
            </span>
          ) : null}

          {/* 3. Document Title */}
          <span className="truncate max-w-[140px] font-medium">{displayTitle}</span>
        </span>
      </PopoverTrigger>

      <PopoverContent
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "w-[320px] rounded-xl border p-3.5 shadow-2xl z-50 pointer-events-auto",
          isDark
            ? "bg-zinc-900 border-zinc-700/60 text-zinc-200"
            : "bg-white border-slate-200 text-slate-800"
        )}
        align="start"
        side="top"
        sideOffset={6}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center justify-center size-9 rounded-lg shrink-0 overflow-hidden",
            isDark ? "bg-zinc-800" : "bg-slate-100"
          )}>
            {getSourceIcon(fileName)}
          </div>

          <div className="min-w-0 flex-1 flex flex-col justify-center">
            <div className="font-semibold text-xs leading-snug line-clamp-2">
              {rawTitle}
            </div>
            <div className="flex items-center gap-2 text-[10px] mt-0.5 text-slate-400 dark:text-zinc-500">
              {page ? <span className="font-medium text-indigo-400">Page {page}</span> : null}
              {fileName && fileName !== rawTitle ? <span className="truncate">{fileName}</span> : null}
            </div>
          </div>

          {docSource?.can_download !== false ? (
            <button
              type="button"
              onClick={handleDownload}
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-md transition-colors cursor-pointer",
                isDark ? "hover:bg-zinc-800 text-zinc-300" : "hover:bg-slate-100 text-slate-600"
              )}
              title="Download document"
              aria-label="Download document"
            >
              <Download className="size-3.5" />
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function AssistantMessageContent({
  content,
  isDark,
  sources,
  onSourceAccessChanged,
}: {
  content: string
  isDark: boolean
  sources?: MessageSources | null
  onSourceAccessChanged?: () => void
}) {
  const processedContent = React.useMemo(
    () => preprocessCitationTokens(content),
    [content]
  )

  const components = React.useMemo(
    () => ({
      h1: ({ children }: any) => <h1 className="text-base font-bold mt-4 mb-2 first:mt-0 text-zinc-900 dark:text-white">{children}</h1>,
      h2: ({ children }: any) => <h2 className="text-[15px] font-semibold mt-3.5 mb-1.5 first:mt-0 text-zinc-900 dark:text-zinc-100">{children}</h2>,
      h3: ({ children }: any) => <h3 className="text-[14px] font-semibold mt-3 mb-1 first:mt-0 text-zinc-900 dark:text-zinc-200">{children}</h3>,
      p: ({ children }: any) => <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>,
      ul: ({ children }: any) => <ul className="list-disc pl-5 mb-2.5 space-y-1">{children}</ul>,
      ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-2.5 space-y-1">{children}</ol>,
      li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
      a: ({ href, children }: any) => {
        const citation = extractDocCitationInfo(href, children)
        if (citation) {
          return (
            <InlineDocCitationBadge
              docId={citation.docId}
              page={citation.page}
              sources={sources}
              isDark={isDark}
              onSourceAccessChanged={onSourceAccessChanged}
            />
          )
        }

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
      strong: ({ children }: any) => <strong className="font-semibold text-zinc-900 dark:text-white">{children}</strong>,
      em: ({ children }: any) => <em className="italic">{children}</em>,
      pre: ({ children }: any) => {
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
      code: ({ className, children, ...props }: any) => {
        const match = /language-(\w+)/.exec(className || "");
        const inline = !match;
        if (inline) {
          const citation = extractDocCitationInfo(undefined, children)
          if (citation) {
            return (
              <InlineDocCitationBadge
                docId={citation.docId}
                page={citation.page}
                sources={sources}
                isDark={isDark}
                onSourceAccessChanged={onSourceAccessChanged}
              />
            )
          }
          return (
            <code className={cn(
              "px-1.5 py-0.5 rounded-md font-mono text-[12px]",
              isDark ? "bg-zinc-800 text-zinc-200" : "bg-slate-100 text-slate-800"
            )} {...props}>
              {children}
            </code>
          )
        }
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
      blockquote: ({ children }: any) => (
        <blockquote className={cn(
          "pl-4 border-l-2 my-3 italic",
          isDark ? "border-zinc-700 text-zinc-400" : "border-slate-300 text-slate-600"
        )}>
          {children}
        </blockquote>
      ),
      table: ({ children }: any) => {
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
            <div
              className={cn(
                "overflow-x-auto rounded-xl border shadow-sm",
                isDark
                  ? "border-zinc-700/70 bg-zinc-950/90 shadow-black/30 ring-1 ring-white/[0.04]"
                  : "border-slate-200"
              )}
            >
              <table className="w-full text-left border-collapse text-[12.5px]">
                {children}
              </table>
            </div>
            <CopyButton text={tableText} isDark={isDark} />
          </div>
        )
      },
      thead: ({ children }: any) => (
        <thead
          className={cn(
            "border-b font-semibold",
            isDark
              ? "bg-zinc-800/95 border-zinc-600/60 text-zinc-50"
              : "bg-slate-200 border-slate-300 text-slate-900"
          )}
        >
          {children}
        </thead>
      ),
      tbody: ({ children }: any) => (
        <tbody className={cn(isDark && "[&_tr:nth-child(even)]:bg-zinc-900/45")}>
          {children}
        </tbody>
      ),
      tr: ({ children }: any) => (
        <tr
          className={cn(
            "border-b last:border-b-0 transition-colors",
            isDark
              ? "border-zinc-800/90 bg-zinc-950/40 hover:bg-zinc-800/55"
              : "border-slate-100 hover:bg-slate-100/60"
          )}
        >
          {children}
        </tr>
      ),
      th: ({ children }: any) => (
        <th
          className={cn(
            "px-4 py-3 font-bold text-[11px] uppercase tracking-wider",
            isDark
              ? "text-zinc-100 border-r border-zinc-700/50 last:border-r-0 bg-zinc-800/95"
              : ""
          )}
        >
          <TableCellContent>{children}</TableCellContent>
        </th>
      ),
      td: ({ children }: any) => (
        <td
          className={cn(
            "px-4 py-2.5 transition-colors",
            isDark
              ? "text-zinc-300 border-r border-zinc-800/70 last:border-r-0"
              : ""
          )}
        >
          <TableCellContent>{children}</TableCellContent>
        </td>
      ),
    }),
    [isDark, sources, onSourceAccessChanged]
  )

  return (
    <div className={cn(
      "prose prose-sm max-w-none text-[13.5px] leading-relaxed break-words",
      isDark ? "prose-invert text-zinc-200" : "text-slate-800"
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        urlTransform={(url) => url}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}



type AggregatedDocumentSource = {
  document_id: number
  document_title?: string | null
  file_name?: string | null
  version_number?: number | null
  can_download?: boolean
  pages: number[]
}

function formatPages(pages: number[], fileName?: string | null) {
  if (pages.length === 0) return ""
  if (pages.length === 1 && pages[0] === 1 && fileName?.toLowerCase().endsWith(".txt")) {
    return ""
  }
  if (pages.length === 1) return `page ${pages[0]}`
  return `pages ${pages.join(", ")}`
}

export function MessageSources({
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

  const hasSources = webSources.length > 0 || documentSources.length > 0
  const hasTokens = message.inputTokens != null || message.outputTokens != null || message.totalTokens != null
  const hasLatency = message.latencyMs != null

  if (!hasSources && !hasTokens && !hasLatency) {
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

    const pages = source.page_numbers?.length
      ? source.page_numbers
      : source.page_number != null
        ? [source.page_number]
        : []

    for (const page of pages) {
      if (!aggregatedDocs[docId].pages.includes(page)) {
        aggregatedDocs[docId].pages.push(page)
      }
    }
  }

  const documentGroups = Object.values(aggregatedDocs)
  documentGroups.forEach((group) => {
    group.pages.sort((a: number, b: number) => a - b)
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
              const lower = src.title.toLowerCase()
              const isPdf = lower.endsWith(".pdf")
              const isTxt = lower.endsWith(".txt")
              const isMd = lower.endsWith(".md")
              const isDocx = lower.endsWith(".docx")
              const isPptx = lower.endsWith(".pptx")
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
                  ) : isMd ? (
                    <img src="/icons/md.png" className="size-3.5 object-contain" alt="" />
                  ) : isDocx ? (
                    <img src="/icons/docx.png" className="size-3.5 object-contain" alt="" />
                  ) : isPptx ? (
                    <img src="/icons/pptx.png" className="size-3.5 object-contain" alt="" />
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

      {hasSources && (
        <>
          <div className={cn("w-px h-4 shrink-0", isDark ? "bg-zinc-700" : "bg-slate-200")} />
          {sourcesPopover}
        </>
      )}

      {(hasLatency || hasTokens) && (
        <div className={cn("flex flex-wrap items-center gap-2 text-[11px] ml-1.5", isDark ? "text-zinc-500" : "text-slate-500")}>
          {hasLatency && (
            <span>Answered in {(message.latencyMs! / 1000).toFixed(1)}s</span>
          )}

          {hasTokens && (
            <div className={cn("flex items-center gap-2 font-mono text-[10.5px]", isDark ? "text-slate-400" : "text-slate-600")}>
              {hasLatency && <span className={isDark ? "text-zinc-700" : "text-slate-300"}>•</span>}
              {message.inputTokens != null && (
                <span>in: <b className={isDark ? "text-slate-300" : "text-slate-700"}>{message.inputTokens.toLocaleString()}</b></span>
              )}
              {message.outputTokens != null && (
                <span>out: <b className={isDark ? "text-slate-300" : "text-slate-700"}>{message.outputTokens.toLocaleString()}</b></span>
              )}
              {message.totalTokens != null && (
                <span>total: <b className={isDark ? "text-indigo-400" : "text-indigo-600"}>{message.totalTokens.toLocaleString()}</b></span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
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

function formatSeconds(seconds: number) {
  if (seconds < 60) return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)}s`
  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(0)
  return `${mins}m ${secs}s`
}

export function AgentReasoningPanel({
  activities,
  elapsedSeconds,
  isStreaming,
  isDark,
}: {
  activities: ActivityItem[]
  elapsedSeconds?: number
  isStreaming?: boolean
  isDark: boolean
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}) {
  const [collapsed, setCollapsed] = useState(!isStreaming)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isStreaming) {
      setCollapsed(true)
    } else {
      setCollapsed(false)
    }
  }, [isStreaming])

  useEffect(() => {
    if (isStreaming && !collapsed && panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight
    }
  }, [activities, collapsed, isStreaming])

  if (!activities || activities.length === 0) return null

  const displayTime = elapsedSeconds != null ? formatSeconds(elapsedSeconds) : ""

  return (
    <div className="mb-3 space-y-2">
      {/* Inject narrow dark-matching scrollbar styles once */}
      <style>{`
        .reasoning-scroll::-webkit-scrollbar { width: 5px; }
        .reasoning-scroll::-webkit-scrollbar-track { background: transparent; }
        .reasoning-scroll::-webkit-scrollbar-thumb { background: #252a3d; border-radius: 3px; }
        .reasoning-scroll-light::-webkit-scrollbar { width: 5px; }
        .reasoning-scroll-light::-webkit-scrollbar-track { background: transparent; }
        .reasoning-scroll-light::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        @keyframes shimmerGlow { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .animate-glitter { background: linear-gradient(90deg, #94a3b8 0%, #ffffff 50%, #94a3b8 100%); background-size: 200% 100%; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: shimmerGlow 2s infinite linear; }
      `}</style>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className={cn(
            "flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer select-none py-1",
            isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"
          )}
        >
          <Clock className="h-3.5 w-3.5 opacity-70" />
          <span className={isStreaming ? "animate-glitter font-semibold" : ""}>
            {isStreaming
              ? `Working... (${displayTime || "1s"})`
              : `Worked for ${displayTime || "1s"}`}
          </span>
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>


      {!collapsed && (
        <div
          ref={panelRef}
          className={cn(
            "max-h-72 space-y-2 overflow-y-auto border-l pl-4 pr-2 py-1 scroll-smooth text-xs",
            isDark
              ? "border-slate-800/80 text-slate-300 reasoning-scroll"
              : "border-slate-200 text-slate-700 reasoning-scroll-light"
          )}
          aria-live="polite"
        >
          {activities.map((act, idx) => (
            <div key={act.id || idx} className="flex items-start gap-2.5 leading-relaxed">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                <AgentIcon agent={act.agent} />
              </span>
              <div className={act.kind === "tool" ? "font-medium text-slate-200" : "text-slate-400"}>
                {act.label && (
                  <span className="mr-2 text-[10px] uppercase tracking-wider text-slate-500">
                    {act.label}
                  </span>
                )}
                <span>{act.content}</span>
              </div>
            </div>
          ))}
          {isStreaming && (
            <div className="ml-6 h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
          )}
        </div>
      )}
    </div>
  )
}

function ApprovalConfirmModal({
  open,
  onClose,
  onConfirm,
  hitlPermission,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  hitlPermission: HITLPermissionState
}) {
  if (!open) return null

  const isGithub = hitlPermission.agent === "github_agent" || hitlPermission.tool?.includes("github")
  const isGmail = hitlPermission.agent === "gmail_agent" || hitlPermission.draft || hitlPermission.tool?.includes("gmail")

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-confirm-title"
    >
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-black bg-white p-6 text-black shadow-2xl">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/45">
            Final confirmation
          </p>
          <h2 id="approval-confirm-title" className="mt-1 text-lg font-semibold">
            Approve this action?
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-black/60">
            The agent will execute the action shown below. This cannot be undone automatically.
          </p>
        </div>

        <div className="max-h-56 overflow-y-auto rounded-xl border border-black/10 bg-black/[0.04] p-3 text-xs">
          <p className="font-semibold text-black/50">
            {hitlPermission.preview_title || hitlPermission.tool || hitlPermission.action}
          </p>
          {hitlPermission.to || hitlPermission.subject || hitlPermission.body ? (
            <div className="mt-3 space-y-1.5">
              <p><b>To:</b> {hitlPermission.to || "Not specified"}</p>
              {hitlPermission.cc && <p><b>Cc:</b> {hitlPermission.cc}</p>}
              <p><b>Subject:</b> {hitlPermission.subject || "Not specified"}</p>
              <p className="whitespace-pre-wrap border-t border-black/10 pt-2">
                {hitlPermission.body || "No message body"}
              </p>
            </div>
          ) : (
            <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-[11px]">
              {JSON.stringify(hitlPermission.args || hitlPermission.preview || {}, null, 2)}
            </pre>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-black/20 bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-black/[0.05] cursor-pointer"
          >
            Go back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white transition hover:bg-black/80 cursor-pointer"
          >
            Approve and continue
          </button>
        </div>
      </div>
    </div>
  )
}

export function HITLPermissionCard({
  hitlPermission,
  onHITLResponse,
}: {
  hitlPermission: HITLPermissionState
  onHITLResponse?: (decision: "yes" | "no" | "tell_agent", feedback?: string) => void
  isDark?: boolean
}) {
  const [feedback, setFeedback] = useState("")
  const [approvalConfirmOpen, setApprovalConfirmOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isGithub = hitlPermission.agent === "github_agent" || hitlPermission.tool?.includes("github")
  const isGmail = hitlPermission.agent === "gmail_agent" || hitlPermission.draft || hitlPermission.tool?.includes("gmail")

  const handleAction = (decision: "yes" | "no" | "tell_agent") => {
    setIsSubmitting(true)
    onHITLResponse?.(decision, feedback)
  }

  return (
    <>
      <ApprovalConfirmModal
        open={approvalConfirmOpen}
        onClose={() => setApprovalConfirmOpen(false)}
        onConfirm={() => {
          setApprovalConfirmOpen(false)
          handleAction("yes")
        }}
        hitlPermission={hitlPermission}
      />

      <section className="my-4 space-y-4 rounded-[22px] border border-black bg-white p-5 text-black shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-black/10 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white shrink-0">
              {isGithub ? (
                <Github className="h-4 w-4" />
              ) : isGmail ? (
                <Mail className="h-4 w-4" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/45">
                Human approval required
              </p>
              <h2 className="mt-1 text-sm font-semibold">
                {isGithub
                  ? "Review this GitHub action"
                  : isGmail
                    ? "Review this Gmail action"
                    : "Review this action"}
              </h2>
            </div>
          </div>
          {hitlPermission.risk && (
            <span className="rounded-full border border-black/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-black/60 shrink-0">
              {hitlPermission.risk}
            </span>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-black/10 bg-black/[0.03] p-4 text-xs">
          <div>
            <span className="font-semibold text-black/50">ACTION</span>
            <p className="mt-1 font-mono text-[11px]">
              {hitlPermission.tool || hitlPermission.action}
            </p>
          </div>

          {hitlPermission.description && (
            <p className="border-t border-black/10 pt-3 leading-relaxed text-black/65">
              {hitlPermission.description}
            </p>
          )}

          {hitlPermission.to || hitlPermission.subject || hitlPermission.body ? (
            <div className="space-y-2 border-t border-black/10 pt-3">
              <span className="font-semibold text-black/50">EMAIL CONTENT</span>
              {hitlPermission.from && <p><b>From:</b> {hitlPermission.from}</p>}
              <p><b>To:</b> {hitlPermission.to || "Not specified"}</p>
              {hitlPermission.cc && <p><b>Cc:</b> {hitlPermission.cc}</p>}
              {hitlPermission.bcc && <p><b>Bcc:</b> {hitlPermission.bcc}</p>}
              <p><b>Subject:</b> {hitlPermission.subject || "Not specified"}</p>
              <div className="max-h-32 overflow-y-auto whitespace-pre-wrap border-t border-black/10 pt-2 text-black/75">
                {hitlPermission.body || "No message body"}
              </div>
            </div>
          ) : hitlPermission.args ? (
            <div className="border-t border-black/10 pt-3">
              <span className="font-semibold text-black/50">COMMAND PARAMETERS</span>
              <pre className="reasoning-scroll mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/[0.06] p-3 font-mono text-[11px] text-black">
                {JSON.stringify(hitlPermission.args, null, 2)}
              </pre>
            </div>
          ) : hitlPermission.preview ? (
            <div className="border-t border-black/10 pt-3">
              <span className="font-semibold text-black/50">REQUEST</span>
              <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/[0.06] p-3 font-mono text-[11px] text-black">
                {hitlPermission.preview}
              </pre>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs font-semibold">
            <MessageSquare className="h-3.5 w-3.5" />
            Instructions for the agent <span className="font-normal text-black/45">(optional)</span>
          </label>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={2}
            placeholder="Add a change or tell the agent what to do instead..."
            className="w-full resize-none rounded-xl border border-black/15 bg-white p-3 text-xs text-black placeholder-black/35 outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
          <span className="text-[11px] text-black/45">
            {isSubmitting
              ? "Sending your decision..."
              : isGithub
                ? "This action will be sent to GitHub."
                : isGmail
                  ? "This action will be sent to Gmail."
                  : "This action will be executed."}
          </span>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => handleAction("no")}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-lg border border-black/20 bg-white px-3.5 py-2 text-xs font-semibold text-black transition hover:bg-black/[0.05] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </button>

            <button
              type="button"
              onClick={() => handleAction("tell_agent")}
              disabled={isSubmitting || !feedback.trim()}
              className="flex items-center gap-1.5 rounded-lg border border-black/15 bg-black/[0.06] px-3.5 py-2 text-xs font-semibold text-black transition hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Send instruction
            </button>

            <button
              type="button"
              onClick={() => setApprovalConfirmOpen(true)}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approve
            </button>
          </div>
        </div>
      </section>
    </>
  )
}

export function AgentChatThread({
  messages,
  isThinking,
  thinkingEvents,
  isDark,
  onSourceAccessChanged,
  agentActivities = [],
  elapsedSeconds = 0,
  isAgentMode = false,
  hitlPermission = null,
  onHITLResponse,
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

    const prevCount = previousMessageCountRef.current
    const currentCount = messages.length
    previousMessageCountRef.current = currentCount

    if (prevCount === 0 && currentCount > 0) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: "auto",
      })
      return
    }

    if (shouldStickToBottomRef.current) {
      const userMessageNodes = viewport.querySelectorAll<HTMLElement>('[data-role="user"]')
      const lastUserNode = userMessageNodes[userMessageNodes.length - 1]

      if (isThinking && lastUserNode) {
        const viewportRect = viewport.getBoundingClientRect()
        const nodeRect = lastUserNode.getBoundingClientRect()
        const relativeTop = nodeRect.top - viewportRect.top + viewport.scrollTop
        const desiredScrollTop = Math.max(0, relativeTop - 32)
        const maxScrollTop = viewport.scrollHeight - viewport.clientHeight

        let targetScrollTop: number
        if (maxScrollTop < desiredScrollTop) {
          targetScrollTop = maxScrollTop
        } else {
          const contentBelowUser = viewport.scrollHeight - relativeTop
          if (contentBelowUser > viewport.clientHeight) {
            targetScrollTop = maxScrollTop
          } else {
            targetScrollTop = desiredScrollTop
          }
        }

        viewport.scrollTo({
          top: targetScrollTop,
          behavior: "smooth",
        })
        return
      }

      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: "smooth",
      })
    }
  }, [messages.length, isThinking, agentActivities.length, thinkingEvents.length])

  return (
    <ScrollArea ref={scrollRef} className="min-h-0 flex-1">
      <div className={cn("mx-auto flex max-w-4xl flex-col gap-6 px-8 pt-8 transition-all duration-300", isThinking ? "pb-32" : "pb-6")}>
        {messages.map((message, index) => {
          const isUser = message.role === "user"
          // Only show saved reasoning (from completed agent responses), never live activities inside messages
          const messageActivities = message.reasoning

          return (
            <div
              key={message.id}
              data-role={message.role}
              data-message-id={message.id}
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
                {!isUser && messageActivities && messageActivities.length > 0 && (
                  <AgentReasoningPanel
                    activities={messageActivities}
                    elapsedSeconds={message.latencyMs ? message.latencyMs / 1000 : elapsedSeconds}
                    isStreaming={false}
                    isDark={isDark}
                    inputTokens={message.inputTokens}
                    outputTokens={message.outputTokens}
                    totalTokens={message.totalTokens}
                  />
                )}

                {isUser ? (
                  message.content
                ) : (
                  <AssistantMessageContent
                    content={message.content}
                    isDark={isDark}
                    sources={message.sources}
                    onSourceAccessChanged={onSourceAccessChanged}
                  />
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
          <div className="flex w-full flex-col justify-start gap-3">
            {isAgentMode || agentActivities.length > 0 ? (
              <AgentReasoningPanel
                activities={agentActivities}
                elapsedSeconds={elapsedSeconds}
                isStreaming={true}
                isDark={isDark}
              />
            ) : (
              <AgentThinkingIndicator events={thinkingEvents} isDark={isDark} />
            )}
          </div>
        )}

        {hitlPermission && (
          <HITLPermissionCard
            hitlPermission={hitlPermission}
            onHITLResponse={onHITLResponse}
            isDark={isDark}
          />
        )}
      </div>
    </ScrollArea>
  )
}

