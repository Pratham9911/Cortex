"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  Hash,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Send,
  Smile,
  Sparkles,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type Discussion = {
  id: string
  title: string
  preview: string
  description: string
  time: string
  count?: string
  initials: string
  avatar: string
  pinned?: boolean
}

const discussions: Discussion[] = [
  { id: "general", title: "General", preview: "664 members online", description: "A shared space for team updates and announcements.", time: "4h ago", count: "664", initials: "#", avatar: "bg-zinc-700", pinned: true },
  { id: "william", title: "William Thomson", preview: "Struggling with consistency...", description: "Talk through ideas, blockers, and creative work.", time: "now", initials: "WT", avatar: "bg-amber-700" },
  { id: "joycelina", title: "Joycelina Oliver", preview: "Too many ideas, not enough...", description: "A place for sharing ideas and getting feedback.", time: "now", initials: "JO", avatar: "bg-violet-700" },
  { id: "gerrald", title: "Gerrald Jovy", preview: "Overthinking my content be...", description: "Turn rough thoughts into clear next steps.", time: "1h ago", initials: "GJ", avatar: "bg-emerald-700" },
  { id: "amelia", title: "Amelia Clara", preview: "Done > perfect. Always", description: "Small wins and progress check-ins.", time: "2h ago", initials: "AC", avatar: "bg-rose-700" },
  { id: "florine", title: "Florine Alexandra", preview: "Trying to be more consisten...", description: "Share work in progress and helpful feedback.", time: "2h ago", initials: "FA", avatar: "bg-orange-700" },
]

const messages = [
  { author: "Joycelina Oliver", handle: "@joyceliver", time: "April 16", initials: "JO", avatar: "bg-violet-700", text: "Hey everyone! Joy here 👋\nI help creators grow and monetize their audience.\nCurious — what’s one thing you’re currently struggling with in your content?", reactions: ["🔥 12", "✨ 48", "💬 24"], align: "right" },
  { author: "William Thomson", handle: "@wilson", time: "April 16", initials: "WT", avatar: "bg-amber-700", text: "Hey Joy, welcome! 🙌\nLately I’ve been struggling with consistency...\nI start strong, but after a week I kinda lose momentum. Any tips?", reactions: ["🔥 12"], align: "left" },
  { author: "Gerrald Jovy", handle: "@gerraldjoy", time: "April 16", initials: "GJ", avatar: "bg-emerald-700", text: "Same here actually.\nFor me it’s not ideas — I have too many 😂\nBut turning them into actual content is the hard part.", reactions: ["✨ 48"], align: "left" },
  { author: "Florine Alexandra", handle: "@florexa", time: "April 16", initials: "FA", avatar: "bg-orange-700", text: "Trying to be more consistent lately!\nJust posted this today ✨ any feedback?", reactions: [], align: "left" },
]

export function DiscussionsTab({ isDark }: { isDark: boolean }) {
  const [query, setQuery] = useState("")
  const [activeDiscussion, setActiveDiscussion] = useState("general")
  const [message, setMessage] = useState("")
  const filteredDiscussions = useMemo(
    () => discussions.filter((discussion) => `${discussion.title} ${discussion.preview}`.toLowerCase().includes(query.toLowerCase())),
    [query]
  )
  const active = discussions.find((discussion) => discussion.id === activeDiscussion) ?? discussions[0]

  return (
    <div className={cn("flex h-full min-h-0 overflow-hidden", isDark ? "bg-[#0b0d0f] text-white" : "bg-[#fbfcfd] text-slate-900")}>
      <aside style={{ scrollbarWidth: "thin", scrollbarColor: isDark ? "#4b5563 transparent" : "#cbd5e1 transparent" }} className={cn("w-[280px] shrink-0 overflow-y-auto border-r p-4 sm:w-[320px]", isDark ? "border-zinc-800 bg-[#121518]" : "border-slate-200 bg-white")}>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className={cn("pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2", isDark ? "text-zinc-400" : "text-slate-400")} />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search discussions" className={cn("h-10 rounded-xl pl-9 text-xs shadow-sm", isDark ? "border-zinc-700 bg-[#1b2024] text-white placeholder:text-zinc-500 focus-visible:border-zinc-500" : "border-slate-200 bg-slate-50")} />
          </div>
          <Button variant="ghost" size="icon-sm" className={cn("shrink-0 rounded-xl", isDark ? "text-zinc-300 hover:bg-zinc-800 hover:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-black")}><Plus /></Button>
        </div>
        <div className="mt-6">
          <p className={cn("flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em]", isDark ? "text-zinc-400" : "text-slate-500")}><Pin className="size-3" />Pinned</p>
          <div className="mt-2">
            {filteredDiscussions.filter((discussion) => discussion.pinned).map((discussion) => <DiscussionRow key={discussion.id} discussion={discussion} active={activeDiscussion === discussion.id} isDark={isDark} onClick={() => setActiveDiscussion(discussion.id)} />)}
          </div>
        </div>
        <div className="mt-6">
          <p className={cn("flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.16em]", isDark ? "text-zinc-400" : "text-slate-500")}><Sparkles className="size-3" />Primary</p>
          <div className="mt-2 space-y-1">
            {filteredDiscussions.filter((discussion) => !discussion.pinned).map((discussion) => <DiscussionRow key={discussion.id} discussion={discussion} active={activeDiscussion === discussion.id} isDark={isDark} onClick={() => setActiveDiscussion(discussion.id)} />)}
          </div>
          {filteredDiscussions.length === 0 && <p className="px-2 py-6 text-xs text-zinc-500">No discussions found.</p>}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className={cn("flex h-[54px] shrink-0 items-center justify-between border-b px-5", isDark ? "border-zinc-800 bg-[#101315]" : "border-slate-200 bg-white")}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl text-lg font-semibold", isDark ? "bg-zinc-800 text-white" : "bg-slate-100 text-slate-800")}><Hash className="size-4" /></span>
            <div className="min-w-0"><h2 className="truncate text-sm font-semibold">{active.title}</h2><p className={cn("truncate text-[11px]", isDark ? "text-zinc-500" : "text-slate-500")}>{active.description}</p></div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" className={cn("rounded-lg", isDark ? "text-zinc-300 hover:bg-zinc-800 hover:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-black")}><Search /></Button>
            <Button variant="ghost" size="icon-sm" className={cn("rounded-lg", isDark ? "text-zinc-300 hover:bg-zinc-800 hover:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-black")}><Users /></Button>
            <Button variant="ghost" size="icon-sm" className={cn("rounded-lg", isDark ? "text-zinc-300 hover:bg-zinc-800 hover:text-white" : "text-slate-600 hover:bg-slate-100 hover:text-black")}><MoreHorizontal /></Button>
          </div>
        </header>

        <div style={{ scrollbarWidth: "thin", scrollbarColor: isDark ? "#4b5563 transparent" : "#cbd5e1 transparent" }} className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5">
          <div className={cn("flex items-center gap-3 text-[10px]", isDark ? "text-zinc-600" : "text-slate-400")}><span className="h-px flex-1 bg-current opacity-30" />Yesterday<span className="h-px flex-1 bg-current opacity-30" /></div>
          {messages.map((item) => <MessageBubble key={item.author} message={item} isDark={isDark} />)}
          <div className={cn("flex items-center gap-3 text-[10px]", isDark ? "text-zinc-600" : "text-slate-400")}><span className="h-px flex-1 bg-current opacity-30" />Today<span className="h-px flex-1 bg-current opacity-30" /></div>
        </div>

        <form onSubmit={(event) => { event.preventDefault(); setMessage("") }} className={cn("flex shrink-0 items-center gap-2 border-t px-4 py-3", isDark ? "border-zinc-800 bg-[#101315]" : "border-slate-200 bg-white")}>
          <div className={cn("flex min-w-0 flex-1 items-center gap-1 rounded-2xl border px-2 py-1.5 shadow-sm", isDark ? "border-zinc-700 bg-[#1b2024] shadow-black/20" : "border-slate-200 bg-slate-50")}>
            <Button type="button" variant="ghost" size="icon-sm" className={cn("rounded-xl", isDark ? "text-zinc-300 hover:bg-zinc-800 hover:text-white" : "text-slate-600 hover:bg-white hover:text-black")}><Link2 /></Button>
            <Button type="button" variant="ghost" size="icon-sm" className={cn("rounded-xl", isDark ? "text-zinc-300 hover:bg-zinc-800 hover:text-white" : "text-slate-600 hover:bg-white hover:text-black")}><Smile /></Button>
            <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type a message..." className={cn("h-9 flex-1 border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0", isDark ? "text-white placeholder:text-zinc-500" : "text-slate-900")} />
            <Button type="submit" size="icon-sm" className={cn("rounded-xl", isDark ? "bg-white text-black hover:bg-zinc-200" : "bg-black text-white hover:bg-zinc-800")}><Send className="size-4" /></Button>
          </div>
        </form>
      </section>
    </div>
  )
}

function DiscussionRow({ discussion, active, isDark, onClick }: { discussion: Discussion; active: boolean; isDark: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors", active ? (isDark ? "bg-[#252b30] shadow-sm" : "bg-slate-100 shadow-sm") : (isDark ? "hover:bg-[#1b2024]" : "hover:bg-slate-50"))}>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white", discussion.avatar)}>{discussion.initials}</span>
      <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className={cn("truncate text-xs font-semibold", isDark ? "text-zinc-100" : "text-slate-900")}>{discussion.title}</span><span className={cn("shrink-0 text-[10px]", isDark ? "text-zinc-400" : "text-slate-400")}>{discussion.time}</span></span><span className={cn("mt-0.5 block truncate text-[11px]", isDark ? "text-zinc-400" : "text-slate-500")}>{discussion.preview}</span></span>
    </button>
  )
}

function MessageBubble({ message, isDark }: { message: (typeof messages)[number]; isDark: boolean }) {
  const isRight = message.align === "right"
  return (
    <div className={cn("flex gap-3", isRight && "flex-row-reverse text-right")}>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white", message.avatar)}>{message.initials}</span>
      <div className={cn("max-w-[560px]", isRight && "items-end")}>
        <div className={cn("flex items-center gap-2 text-xs", isRight && "justify-end")}><span className="font-semibold">{message.author}</span><span className={cn(isDark ? "text-zinc-600" : "text-slate-400")}>{message.handle} · {message.time}</span></div>
        <p className={cn("mt-2 whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-5 shadow-sm", isDark ? "bg-[#20262b] text-zinc-200 shadow-black/20" : "bg-slate-100 text-slate-700")}>{message.text}</p>
        {message.reactions.length > 0 && <div className={cn("mt-1 flex gap-1", isRight && "justify-end")}>{message.reactions.map((reaction) => <span key={reaction} className={cn("rounded-full border px-2 py-0.5 text-[10px]", isDark ? "border-zinc-700 bg-[#171c20] text-zinc-300" : "border-slate-200 bg-white text-slate-500")}>{reaction}</span>)}</div>}
      </div>
    </div>
  )
}

export function EmptyTeamTab({ isDark, icon, title, description }: { isDark: boolean; icon: ReactNode; title: string; description: string }) {
  return (
    <div className={cn("flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed text-center", isDark ? "border-zinc-800 bg-[#111315]" : "border-slate-200 bg-white")}>
      {icon}<h2 className={cn("mt-4 text-lg font-semibold", isDark ? "text-white" : "text-slate-900")}>{title}</h2><p className={cn("mt-2 max-w-sm text-sm", isDark ? "text-zinc-500" : "text-slate-500")}>{description}</p>
    </div>
  )
}
