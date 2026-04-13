import { Brain, Database, Bot, Search } from "lucide-react"
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid"
import { CortexNotifications } from "@/components/ui/cortex-notifications"
import { CortexDocuments } from "@/components/ui/cortex-documents"

const features = [
  {
  Icon: Brain,
  name: "AI Knowledge Engine",
  description:
    "Cortex connects and understands your organization's knowledge.",
  href: "#",
  cta: "Learn more",
  className: "col-span-3 lg:col-span-1",
  background: (
    <CortexDocuments className="absolute inset-0 scale-90 opacity-90 group-hover:scale-95 transition-all duration-300" />
  ),
},
  {
  Icon: Search,
  name: "Activity Feed",
  description: "Live AI activity happening across Cortex.",
  href: "#",
  cta: "Learn more",
  className: "col-span-3 lg:col-span-2",
  background: (
    <CortexNotifications
      className="absolute inset-0 scale-90 opacity-80 transition-all duration-300 group-hover:scale-100"
    />
  ),
},
  {
    Icon: Bot,
    name: "AI Agents",
    description:
      "Run intelligent agents that automate workflows and research.",
    href: "#",
    cta: "Learn more",
    className: "col-span-3 lg:col-span-2",
  },
  {
    Icon: Database,
    name: "Knowledge Graph",
    description:
      "Understand relationships between information.",
    href: "#",
    cta: "Learn more",
    className: "col-span-3 lg:col-span-1",
  },
]

export function CortexBento() {
  return (
    <section className="max-w-[1200px] mx-auto py-20">
      <BentoGrid>
        {features.map((feature, idx) => (
          <BentoCard key={idx} {...feature} />
        ))}
      </BentoGrid>
    </section>
  )
}