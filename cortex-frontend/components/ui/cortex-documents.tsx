"use client"

import { cn } from "@/lib/utils"
import { Marquee } from "@/components/ui/marquee"
import { FileText } from "lucide-react"

const documents = [
  { name: "product_spec.pdf", tag: "Docs" },
  { name: "sales_data.xlsx", tag: "Analytics" },
  { name: "meeting_notes.md", tag: "Notes" },
  { name: "architecture.docx", tag: "System" },
  { name: "research_report.pdf", tag: "Research" },
  { name: "design_system.fig", tag: "Design" },
]

const DocumentCard = ({ name, tag }: { name: string; tag: string }) => {
  return (
    <div
      className={cn(
        "flex h-[100px] items-center gap-3 px-4 py-3 w-[220px] rounded-xl border",
        "bg-background/80 backdrop-blur-md border-gray-200/40",
        "transition-all duration-200 hover:scale-[103%]"
      )}
    >
      <div className="p-2 rounded-md bg-primary/10">
        <FileText className="w-4 h-4 text-primary" />
      </div>

      <div className="flex flex-col">
        <span className="text-sm font-medium text-foreground">{name}</span>
        <span className="text-xs text-muted-foreground">{tag}</span>
      </div>
    </div>
  )
}

export function CortexDocuments({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-full overflow-hidden", className)}>
      <Marquee pauseOnHover className="[--duration:18s]">
        {documents.map((doc) => (
          <DocumentCard key={doc.name} {...doc} />
        ))}
      </Marquee>

      {/* edge fades */}
      <div className="absolute left-0 top-0 h-full w-20 bg-gradient-to-r from-background pointer-events-none" />
      <div className="absolute right-0 top-0 h-full w-20 bg-gradient-to-l from-background pointer-events-none" />
    </div>
  )
}