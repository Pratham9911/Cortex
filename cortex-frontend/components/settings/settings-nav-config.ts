import {
  Settings as SettingsIcon,
  Plug,
  type LucideIcon,
} from "lucide-react"

export type SettingsNavItem = {
  id: string
  label: string
  href: string
  icon: LucideIcon
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: "general", label: "General", href: "/settings/general", icon: SettingsIcon },
  { id: "connectors", label: "Connectors", href: "/settings/connectors", icon: Plug },
]
