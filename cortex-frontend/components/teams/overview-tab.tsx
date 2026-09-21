import { LayoutGrid } from "lucide-react"
import { EmptyTeamTab } from "./discussions-tab"

export function OverviewTab({ isDark }: { isDark: boolean }) {
  return <EmptyTeamTab isDark={isDark} icon={<LayoutGrid className="size-8" />} title="Overview" description="A quick snapshot of this team's activity will appear here." />
}
