"use client"

import { ChevronDown, Image as LucideImage, MoreHorizontal, Search, Sparkles, Star } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { ChatSession } from "./types"

type AgentChatSidebarProps = {
  chats: ChatSession[]
  activeChatId: string | null
  onNewChat: () => void
  onSelectChat: (id: string) => void
  isDark: boolean
}

function ChatListItem({
  chat,
  isActive,
  onSelect,
  isDark,
  showAvatar,
}: {
  chat: ChatSession
  isActive: boolean
  onSelect: () => void
  isDark: boolean
  showAvatar: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
        isActive
          ? isDark
            ? "bg-zinc-800 text-white font-bold"
            : "bg-[#F4F4F5] text-[#090D1A] font-bold"
          : isDark
            ? "text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-200"
            : "text-[#334155] hover:bg-slate-100/60 hover:text-slate-900"
      )}
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
      <span className="min-w-0 flex-1 truncate text-[13px] leading-5 font-semibold">
        {chat.title}
      </span>
      <MoreHorizontal
        className={cn(
          "size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
          isDark ? "text-zinc-500" : "text-slate-400"
        )}
      />
    </button>
  )
}

function ChatSection({
  label,
  items,
  activeChatId,
  onSelectChat,
  isDark,
  showAvatar,
}: {
  label: string
  items: ChatSession[]
  activeChatId: string | null
  onSelectChat: (id: string) => void
  isDark: boolean
  showAvatar: boolean
}) {
  if (items.length === 0) return null

  return (
    <div className="mt-4">
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
      <div className="flex flex-col gap-0.5">
        {items.map((chat) => (
          <ChatListItem
            key={chat.id}
            chat={chat}
            isActive={activeChatId === chat.id}
            onSelect={() => onSelectChat(chat.id)}
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
          isDark={isDark}
          showAvatar={true}
        />
        <ChatSection
          label="Today"
          items={today}
          activeChatId={activeChatId}
          onSelectChat={onSelectChat}
          isDark={isDark}
          showAvatar={false}
        />
        <ChatSection
          label="Yesterday"
          items={yesterday}
          activeChatId={activeChatId}
          onSelectChat={onSelectChat}
          isDark={isDark}
          showAvatar={false}
        />
      </ScrollArea>
    </aside>
  )
}
