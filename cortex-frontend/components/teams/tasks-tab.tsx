import { FileText, LayoutGrid, List, MessageCircle, MoreHorizontal, Plus, SlidersHorizontal, Table2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const tasks = [
  { title: "Pages “About” and “Careers”", description: "All the details are in the file, I’m sure it will turn out cool!", tags: ["Website", "Design"], column: "New Request" },
  { title: "Planning meeting for the second version of the app", description: "Align on the next milestones and owners.", tags: ["App", "Planning"], column: "In Progress" },
  { title: "Second design concept", description: "Let's do the exact opposite of the first concept. Light theme, minimalism and lightness", tags: ["Website", "Design"], column: "Complete" },
  { title: "Secret Marketing Page", description: "We need to make a page for a special offer for the most loyal customers", tags: ["Website", "Design"], column: "In Progress" },
  { title: "Do competitor research", description: "You need to research competitors and identify weaknesses and strengths of each of them", tags: ["App", "Research"], column: "Complete" },
  { title: "First design concept", description: "Let’s try a dark theme and bright colors for accents.", tags: ["Website", "Design"], column: "Complete" },
]
const columns = ["New Request", "In Progress", "Complete"]
const tagColors = ["bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-fuchsia-500"]

export function TasksTab({ isDark }: { isDark: boolean }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" className="rounded-lg bg-[#202429] text-white hover:bg-[#292e34]"><LayoutGrid className="size-4" />Kanban</Button>
          <Button variant="ghost" size="sm" className={cn(isDark ? "text-zinc-400" : "text-slate-500")}><Table2 className="size-4" />Table</Button>
          <Button variant="ghost" size="sm" className={cn(isDark ? "text-zinc-400" : "text-slate-500")}><List className="size-4" />List View</Button>
        </div>
        <Button variant="outline" size="sm" className="rounded-lg"><SlidersHorizontal className="size-4" />Filter</Button>
      </div>
      <div className="grid gap-4 overflow-x-auto pb-3 md:grid-cols-3">
        {columns.map((column) => (
          <div key={column} className={cn("min-w-[280px] rounded-lg p-1", isDark ? "bg-[#111315]" : "bg-slate-100/80")}>
            <div className="mb-2 flex items-center justify-between px-2 py-2">
              <h2 className="flex items-center gap-2 text-xs font-semibold"><span className={cn("size-2 rounded-full", column === "New Request" ? "bg-rose-500" : column === "In Progress" ? "bg-white" : "bg-emerald-500")} />{column}<span className="font-normal text-zinc-500">{tasks.filter((task) => task.column === column).length}</span></h2>
              <MoreHorizontal className="size-4 text-zinc-500" />
            </div>
            <div className="space-y-3">
              {tasks.filter((task) => task.column === column).map((task, index) => (
                <Card key={task.title} className={cn("rounded-lg p-3 shadow-sm transition-transform hover:-translate-y-0.5", isDark ? "border-zinc-800 bg-[#1b1d1f]" : "border-slate-200 bg-white")}>
                  <div className="mb-2 flex flex-wrap gap-1.5">{task.tags.map((tag, tagIndex) => <span key={tag} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold text-slate-900", tagColors[(index + tagIndex) % tagColors.length])}>{tag}</span>)}</div>
                  <h3 className={cn("text-sm font-semibold leading-5", isDark ? "text-zinc-100" : "text-slate-800")}>{task.title}</h3>
                  <p className={cn("mt-1.5 text-xs leading-5", isDark ? "text-zinc-500" : "text-slate-500")}>{task.description}</p>
                  {index === 0 && <div className={cn("mt-3 border-t pt-2 text-xs", isDark ? "border-zinc-800 text-zinc-500" : "border-slate-100 text-slate-500")}><Plus className="mr-1 inline size-3" />Add Subtask</div>}
                  <div className="mt-3 flex items-center justify-between"><div className="flex -space-x-1.5"><span className="flex size-6 items-center justify-center rounded-full border-2 border-[#1b1d1f] bg-violet-500 text-[8px] font-bold text-white">PT</span><span className="flex size-6 items-center justify-center rounded-full border-2 border-[#1b1d1f] bg-amber-500 text-[8px] font-bold text-white">AK</span></div><span className="flex items-center gap-2 text-[10px] text-zinc-500"><MessageCircle className="size-3" />{index + 1}<FileText className="size-3" />{index + 2}</span></div>
                </Card>
              ))}
              <button type="button" className={cn("flex w-full items-center justify-center gap-1 rounded-lg border border-dashed py-2 text-xs transition-colors", isDark ? "border-zinc-700 text-zinc-500 hover:bg-zinc-800" : "border-slate-300 text-slate-500 hover:bg-white")}><Plus className="size-3" />Add task</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
