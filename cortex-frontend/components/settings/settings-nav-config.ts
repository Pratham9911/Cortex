import {
  UserRound,
  Plug,
  FolderKanban,
  type LucideIcon,
} from "lucide-react"

export type SettingsNavItem = {
  id: string
  label: string
  href: string
  icon: LucideIcon
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: "account", label: "Account", href: "/settings/profile/account", icon: UserRound },
  { id: "connectors", label: "Connectors", href: "/settings/profile/connectors", icon: Plug },
  { id: "projects", label: "Projects", href: "/settings/profile/projects", icon: FolderKanban },
]
