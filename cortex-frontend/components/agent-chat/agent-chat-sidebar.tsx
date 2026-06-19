"use client"

import { FormEvent, useEffect, useState } from "react"
import {
  ChevronDown,
  Image as LucideImage,
  MoreHorizontal,
  Pencil,
  Search,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { ChatSession } from "./types"

type AgentChatSidebarProps = {
  chats: ChatSession[]
  activeChatId: string | null
  onNewChat: () => void
  onSelectChat: (id: string) => void
  onRenameChat: (chatId: number, title: string) => Promise<void>
  onDeleteChat: (chatId: number) => Promise<void>
  isDark: boolean
}

function ChatListItem({
  chat,
  isActive,
  onSelect,
  onRename,
  onDelete,
  isDark,
  showAvatar,
}: {
  chat: ChatSession
  isActive: boolean
  onSelect: () => void
  onRename: (title: string) => Promise<void>
  onDelete: () => Promise<void>
  isDark: boolean
  showAvatar: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState(chat.title)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const displayTitle =
    chat.title.length > 25 ? `${chat.title.slice(0, 22).trimEnd()}...` : chat.title

  useEffect(() => {
    setDraftTitle(chat.title)
  }, [chat.title])

  const submitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextTitle = draftTitle.trim()
    if (!nextTitle || nextTitle === chat.title || isSaving) {
      setIsRenaming(false)
      return
    }

    setIsSaving(true)
    try {
      await onRename(nextTitle)
      setIsRenaming(false)
      setMenuOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (isDeleting) return

    setIsDeleting(true)
    try {
      await onDelete()
      setDeleteConfirmOpen(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
    <div
      className={cn(
        "group relative flex w-full max-w-full min-w-0 items-center overflow-visible rounded-lg px-2.5 py-1.5 pr-8 text-left text-sm transition-colors",
        isActive
          ? isDark
            ? "bg-zinc-800 text-white font-bold"
            : "bg-[#F4F4F5] text-[#090D1A] font-bold"
          : isDark
            ? "text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-200"
            : "text-[#334155] hover:bg-slate-100/60 hover:text-slate-900"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        title={chat.title}
        className="flex w-full max-w-full min-w-0 items-center gap-2.5 overflow-hidden text-left"
      >
        {showAvatar && (
          <span
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
              chat.avatarColor
            )}
          >
            {chat.isImageIcon ? (
              <LucideImage className="size-3" />
            ) : (
              chat.avatarLetter
            )}
          </span>
        )}
        <span className="block max-w-[150px] min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-5 font-semibold">
          {displayTitle}
        </span>
      </button>

      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open)
          if (!open) setIsRenaming(false)
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Open options for ${chat.title}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "absolute right-1 top-1/2 z-20 grid size-6 -translate-y-1/2 place-items-center opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100",
              isDark
                ? "text-zinc-300 hover:text-zinc-100"
                : "text-slate-500 hover:text-slate-950"
            )}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="right"
          sideOffset={8}
          className={cn(
            "z-[100] w-48 rounded-lg p-1.5",
            isDark ? "border-zinc-800 bg-zinc-950" : "border-slate-200 bg-white"
          )}
        >
          {isRenaming ? (
            <form className="p-1" onSubmit={submitRename}>
              <input
                autoFocus
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault()
                    setIsRenaming(false)
                    setDraftTitle(chat.title)
                  }
                }}
                className={cn(
                  "h-8 w-full rounded-md border px-2 text-sm outline-none focus:ring-2",
                  isDark
                    ? "border-zinc-700 bg-zinc-900 text-zinc-100 focus:ring-zinc-600"
                    : "border-slate-200 bg-white text-slate-900 focus:ring-slate-300"
                )}
              />
              <div className="mt-1.5 flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsRenaming(false)
                    setDraftTitle(chat.title)
                  }}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium",
                    isDark ? "text-zinc-400 hover:bg-zinc-800" : "text-slate-500 hover:bg-slate-100"
                  )}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !draftTitle.trim()}
                  className="rounded-md bg-[#090D1A] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>
          ) : (
            <>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault()
                  setIsRenaming(true)
                }}
                className="gap-2 rounded-md text-sm"
              >
                <Pencil className="size-4" />
                <span>Rename</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={(event) => {
                  event.preventDefault()
                  setMenuOpen(false)
                  setDeleteConfirmOpen(true)
                }}
                className="gap-2 rounded-md text-sm text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:focus:bg-red-950/40 dark:focus:text-red-300"
              >
                <Trash2 className="size-4" />
                <span>Delete</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <AlertDialogContent
        className={cn(
          "border shadow-xl sm:max-w-md",
          isDark ? "border-zinc-800 bg-zinc-950 text-zinc-100" : "border-slate-200 bg-white text-slate-950"
        )}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Delete chat?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete "{displayTitle}" and all messages in this chat.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            onClick={(event) => {
              event.preventDefault()
              void confirmDelete()
            }}
            className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600 disabled:opacity-60 dark:bg-red-600 dark:hover:bg-red-500"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

function ChatSection({
  label,
  items,
  activeChatId,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  isDark,
  showAvatar,
}: {
  label: string
  items: ChatSession[]
  activeChatId: string | null
  onSelectChat: (id: string) => void
  onRenameChat: (chatId: number, title: string) => Promise<void>
  onDeleteChat: (chatId: number) => Promise<void>
  isDark: boolean
  showAvatar: boolean
}) {
  if (items.length === 0) return null

  return (
    <div className="mt-4 max-w-full min-w-0">
      {label === "Agents" ? (
        <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
          <Star className="size-3 stroke-[2.5px]" />
          <span>{label}</span>
        </div>
      ) : (
        <div className="mb-1.5 flex items-center justify-between px-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
          <span>{label}</span>
          <ChevronDown className="size-3 stroke-[2.5px]" />
        </div>
      )}
      <div className="flex max-w-full min-w-0 flex-col gap-0.5">
        {items.map((chat) => (
          <ChatListItem
            key={chat.id}
            chat={chat}
            isActive={activeChatId === chat.id}
            onSelect={() => onSelectChat(chat.id)}
            onRename={(title) => onRenameChat(chat.chatId, title)}
            onDelete={() => onDeleteChat(chat.chatId)}
            isDark={isDark}
            showAvatar={showAvatar}
          />
        ))}
      </div>
    </div>
  )
}

export function AgentChatSidebar({
  chats,
  activeChatId,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  isDark,
}: AgentChatSidebarProps) {
  const saved = chats.filter((c) => c.group === "saved")
  const today = chats.filter((c) => c.group === "today")
  const yesterday = chats.filter((c) => c.group === "yesterday")

  return (
    <aside
      className={cn(
        "hidden h-full w-[230px] shrink-0 flex-col border-r md:flex",
        isDark ? "border-zinc-800 bg-[#0f0f11]" : "border-slate-200 bg-[#f7f7f8]"
      )}
    >
      <div className="flex items-center justify-between px-4 py-4">
        <h2 className={cn("text-lg font-bold", isDark ? "text-white" : "text-[#090D1A]")}>
          Chat
        </h2>
        <button
          type="button"
          className={cn(
            "rounded-lg p-1.5",
            isDark ? "text-zinc-400 hover:bg-zinc-800" : "text-slate-500 hover:bg-slate-100"
          )}
        >
          <Search className="size-4" />
        </button>
      </div>

      <div className="px-3 mb-2">
        <button
          type="button"
          onClick={onNewChat}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-semibold text-white transition-all shadow-sm",
            isDark
              ? "bg-[#090D1A] hover:bg-[#131b31]"
              : "bg-[#090D1A] hover:bg-[#131b31]"
          )}
        >
          <span>+ New Chat</span>
          <Sparkles className="size-3 text-indigo-300" />
        </button>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2 pb-4">
        <ChatSection
          label="Agents"
          items={saved}
          activeChatId={activeChatId}
          onSelectChat={onSelectChat}
          onRenameChat={onRenameChat}
          onDeleteChat={onDeleteChat}
          isDark={isDark}
          showAvatar={true}
        />
        <ChatSection
          label="Today"
          items={today}
          activeChatId={activeChatId}
          onSelectChat={onSelectChat}
          onRenameChat={onRenameChat}
          onDeleteChat={onDeleteChat}
          isDark={isDark}
          showAvatar={false}
        />
        <ChatSection
          label="Yesterday"
          items={yesterday}
          activeChatId={activeChatId}
          onSelectChat={onSelectChat}
          onRenameChat={onRenameChat}
          onDeleteChat={onDeleteChat}
          isDark={isDark}
          showAvatar={false}
        />
      </ScrollArea>
    </aside>
  )
}
