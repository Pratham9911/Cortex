"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUp, Brain, Mic, Paperclip, Plus, Settings, Sparkles, Square, X } from "lucide-react"
import { cn } from "@/lib/utils"

function CortexAgentIcon({
  className = "size-4",
  invert = false,
  pulse = false,
}: {
  className?: string
  invert?: boolean
  pulse?: boolean
}) {
  const [imgSrc, setImgSrc] = useState<string>(invert ? "/cortex-iconb.png" : "/cortex_icon.png")
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgSrc(invert ? "/cortex-iconb.png" : "/cortex_icon.png")
    setImgError(false)
  }, [invert])

  const handleError = () => {
    if (imgSrc === "/cortex-iconb.png") {
      // Fallback to cortex_icon.png with invert filter if cortex-iconb fails
      setImgSrc("/cortex_icon.png")
    } else {
      setImgError(true)
    }
  }

  if (imgError) {
    return <Brain className={cn(className, "shrink-0", pulse && "animate-pulse text-indigo-400")} />
  }

  return (
    <img
      src={imgSrc}
      alt="Cortex Agent"
      onError={handleError}
      className={cn(
        className,
        "object-contain shrink-0 transition-all",
        invert && imgSrc === "/cortex_icon.png" && "invert brightness-0",
        pulse && "animate-pulse drop-shadow-[0_0_8px_rgba(99,102,241,0.85)] scale-105"
      )}
    />
  )
}

type AgentChatComposerProps = {
  value: string
  onChange: (value: string) => void
  onSend: (isAgentMode?: boolean) => void
  onStop?: () => void
  disabled?: boolean
  isDark: boolean
  isAgentMode?: boolean
  setIsAgentMode?: (active: boolean) => void
  onOpenSettings?: () => void
}

const MAX_HEIGHT = 128

export function AgentChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  disabled,
  isDark,
  isAgentMode = false,
  setIsAgentMode,
  onOpenSettings,
}: AgentChatComposerProps) {
  const maxChars = 4000
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = "auto"
    const nextHeight = Math.min(textarea.scrollHeight, MAX_HEIGHT)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT ? "auto" : "hidden"
  }, [value])

  // Handle slash '/' trigger in typing
  const handleInputChange = (newValue: string) => {
    const trimmed = newValue.slice(0, maxChars)
    onChange(trimmed)

    // Open menu only if user types a standalone slash '/' (e.g. "/" or ending with " /")
    const isStandaloneSlash = trimmed === "/" || trimmed.endsWith(" /")
    if (isStandaloneSlash) {
      setMenuOpen(true)
      setSelectedIndex(0)
    } else if (menuOpen) {
      setMenuOpen(false)
    }
  }

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const menuItems = [
    {
      id: "upload",
      label: "Add photos & files",
      description: "Upload from computer",
      icon: Paperclip,
      action: () => {
        fileInputRef.current?.click()
        setMenuOpen(false)
        onChange(value.replace(/\/$/, ""))
      },
    },
    {
      id: "cortex-agent",
      label: "cortex-agent",
      description: "multi-step reasoning agent",
      icon: (props: any) => <CortexAgentIcon invert={!isDark} {...props} />,
      action: () => {
        setIsAgentMode?.(true)
        setMenuOpen(false)
        onChange(value.replace(/\/$/, "").replace(/cortex-agent/i, "").trim())
      },
    },
    {
      id: "setting",
      label: "setting",
      description: "open setting",
      icon: Settings,
      action: () => {
        onOpenSettings?.()
        setMenuOpen(false)
        onChange(value.replace(/\/$/, ""))
      },
    },
  ]

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % menuItems.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length)
        return
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        menuItems[selectedIndex].action()
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setMenuOpen(false)
        return
      }
    }

    if (e.key === "Backspace" && value === "" && isAgentMode) {
      setIsAgentMode?.(false)
      return
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !disabled) {
        onSend(isAgentMode)
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    alert(`Selected ${files.length} file(s): ${Array.from(files).map((f) => f.name).join(", ")}`)
  }

  return (
    <div className="relative shrink-0 px-10 pb-3 pt-1">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
      />

      {/* Slash / Plus Menu Popup */}
      {menuOpen && (
        <div
          ref={menuRef}
          className={cn(
            "absolute bottom-full mb-3 left-10 right-10 mx-auto w-full max-w-[52rem] rounded-2xl border p-1.5 shadow-2xl z-50 transition-all duration-150 animate-in fade-in slide-in-from-bottom-2",
            isDark
              ? "border-zinc-800 bg-[#161618] text-white"
              : "border-slate-200 bg-white text-slate-900 shadow-xl"
          )}
        >
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
            Commands & Activation
          </div>
          <div className="space-y-0.5">
            {menuItems.map((item, index) => {
              const Icon = item.icon
              const isSelected = index === selectedIndex
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs transition-colors",
                    isSelected
                      ? isDark
                        ? "bg-zinc-800 text-white"
                        : "bg-slate-100 text-slate-900"
                      : isDark
                      ? "hover:bg-zinc-850 text-zinc-300"
                      : "hover:bg-slate-50 text-slate-700"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "grid size-7 place-items-center rounded-lg border",
                        isDark
                          ? "border-zinc-700/60 bg-zinc-800 text-zinc-200"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div>
                      <div className="font-semibold">{item.label}</div>
                      <div className="text-[11px] text-slate-400 dark:text-zinc-400">
                        {item.description}
                      </div>
                    </div>
                  </div>
                  {item.id === "cortex-agent" && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                        isAgentMode
                          ? "bg-purple-600 text-white"
                          : isDark
                          ? "bg-purple-950/80 text-purple-300 border border-purple-700/60"
                          : "bg-purple-50 text-purple-700 border border-purple-200"
                      )}
                    >
                      {isAgentMode ? "Active" : "Agent"}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Main Composer Box Container with Purple Aurora Glow backdrop */}
      <div className="relative mx-auto w-full max-w-[52rem]">
        {/* Animated Purple boundary glow (citation purple theme) when agent mode is active */}
        {isAgentMode && (
          <div
            className="absolute -inset-[1.5px] rounded-[27px] bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500 opacity-75 blur-[3px] animate-pulse pointer-events-none transition-all duration-300"
          />
        )}

        <div
          className={cn(
            "relative flex w-full items-end gap-2 rounded-[26px] border p-2.5 transition-all duration-200",
            isDark
              ? isAgentMode
                ? "border-indigo-500/60 bg-[#09090b] shadow-[0_0_30px_rgba(99,102,241,0.35)]"
                : "border-zinc-800 bg-[#121214]"
              : isAgentMode
                ? "border-indigo-400 bg-white shadow-[0_0_25px_rgba(99,102,241,0.25)]"
                : "border-slate-200 bg-white shadow-sm"
          )}
        >
          {/* Left-side action button: Plus button when normal, Cortex Agent icon button when active */}
          {isAgentMode ? (
            <div className="relative mb-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-label="Cortex agent active. Click to open menu."
                title="Cortex Agent Active"
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full transition-all cursor-pointer border shadow-sm",
                  isDark
                    ? "bg-indigo-950/80 border-indigo-700/80 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.4)] hover:bg-indigo-900"
                    : "bg-indigo-50 border-indigo-300 text-indigo-700 shadow-[0_0_12px_rgba(99,102,241,0.3)] hover:bg-indigo-100"
                )}
              >
                <CortexAgentIcon className="size-5" invert={!isDark} pulse={true} />
              </button>

              {/* Small circle badge with X to cancel Cortex Agent */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsAgentMode?.(false)
                }}
                title="Deactivate Cortex Agent"
                aria-label="Deactivate Cortex Agent"
                className={cn(
                  "absolute -top-1 -right-1 grid size-4.5 place-items-center rounded-full border transition-all cursor-pointer shadow-xs hover:scale-110 active:scale-95 z-10",
                  isDark
                    ? "bg-zinc-900 border-indigo-500/80 text-indigo-300 hover:bg-red-950 hover:border-red-500 hover:text-red-300"
                    : "bg-white border-indigo-300 text-indigo-700 hover:bg-red-50 hover:border-red-400 hover:text-red-600"
                )}
              >
                <X className="size-3 stroke-[2.5]" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Add attachment or open menu"
              className={cn(
                "mb-0.5 grid size-9 shrink-0 place-items-center rounded-full transition-colors cursor-pointer",
                isDark
                  ? "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <Plus className="size-5" />
            </button>
          )}


          {/* Input Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={isAgentMode ? "Ask Cortex Agent multi-step reasoning..." : "Ask anything..."}
            rows={1}
            className={cn(
              "min-h-[36px] max-h-32 flex-1 resize-none bg-transparent px-1 py-1.5 text-[13.5px] leading-relaxed outline-none",
              "agent-composer-scroll",
              isDark
                ? "text-white placeholder:text-zinc-500"
                : "text-slate-900 placeholder:text-slate-400"
            )}
          />

          {/* Action buttons (Mic & Send / Stop) */}
          <div className="flex items-center gap-1.5 mb-0.5 shrink-0">
            <button
              type="button"
              aria-label="Voice input"
              className={cn(
                "grid size-9 place-items-center rounded-full transition-colors cursor-pointer",
                isDark
                  ? "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <Mic className="size-[18px]" />
            </button>

            {disabled ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop execution"
                title="Stop execution"
                className={cn(
                  "grid size-9 place-items-center rounded-full transition-all cursor-pointer shadow-sm",
                  isDark
                    ? "bg-white text-black hover:bg-zinc-200"
                    : "bg-black text-white hover:bg-zinc-800"
                )}
              >
                <Square className={cn("size-3.5", isDark ? "fill-black text-black" : "fill-white text-white")} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (value.trim() && !disabled) {
                    onSend(isAgentMode)
                  }
                }}
                disabled={!value.trim()}
                aria-label="Send message"
                className={cn(
                  "grid size-9 place-items-center rounded-full transition-all cursor-pointer",
                  isDark
                    ? isAgentMode
                      ? "bg-indigo-600 text-white hover:bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.5)]"
                      : "bg-white text-black hover:bg-zinc-200"
                    : isAgentMode
                      ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-[0_0_10px_rgba(99,102,241,0.4)]"
                      : "bg-black text-white hover:bg-zinc-800",
                  !value.trim() && "opacity-35 cursor-not-allowed shadow-none"
                )}
              >
                <ArrowUp className="size-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


