import { Folder } from "lucide-react"
import { EmptyTeamTab } from "./discussions-tab"

export function FilesTab({ isDark }: { isDark: boolean }) {
  return <EmptyTeamTab isDark={isDark} icon={<Folder className="size-8" />} title="Files" description="Shared files and project assets will be collected here." />
}
