import {
  Settings as SettingsIcon,
  User as UserIcon,
  Shield,
  CreditCard,
  Sliders,
  Zap,
  Moon,
  Code,
  FileText,
  Plug,
  Package,
  Brain,
  Briefcase,
  type LucideIcon,
} from "lucide-react"

export type SettingsNavItem = {
  id: string
  label: string
  href: string
  icon: LucideIcon
  group: "settings" | "customize" | "admin"
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: "general", label: "General", href: "/settings/general", icon: SettingsIcon, group: "settings" },
  { id: "account", label: "Account", href: "/settings/account", icon: UserIcon, group: "settings" },
  { id: "privacy", label: "Privacy", href: "/settings/privacy", icon: Shield, group: "settings" },
  { id: "billing", label: "Billing", href: "/settings/billing", icon: CreditCard, group: "settings" },
  { id: "capabilities", label: "Capabilities", href: "/settings/capabilities", icon: Sliders, group: "settings" },
  { id: "reflect", label: "Reflect", href: "/settings/reflect", icon: Zap, group: "settings" },
  { id: "time-focus", label: "Time and focus", href: "/settings/time-focus", icon: Moon, group: "settings" },
  { id: "claude-code", label: "Claude Code", href: "/settings/claude-code", icon: Code, group: "settings" },
  { id: "skills", label: "Skills", href: "/settings/skills", icon: FileText, group: "customize" },
  { id: "connectors", label: "Connectors", href: "/settings/connectors", icon: Plug, group: "customize" },
  { id: "plugins", label: "Plugins", href: "/settings/plugins", icon: Package, group: "customize" },
  { id: "memory", label: "Memory", href: "/settings/memory", icon: Brain, group: "customize" },
  { id: "project-settings", label: "Project Settings", href: "/settings/project-settings", icon: Briefcase, group: "admin" },
]
