import { Clock3 } from "lucide-react"
import { EmptyTeamTab } from "./discussions-tab"

export function TimelinesTab({ isDark }: { isDark: boolean }) {
  return <EmptyTeamTab isDark={isDark} icon={<Clock3 className="size-8" />} title="Timelines" description="Plan milestones and see how your team's work moves forward." />
}
