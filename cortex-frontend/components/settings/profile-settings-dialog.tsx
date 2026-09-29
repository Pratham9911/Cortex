"use client"

import { useState } from "react"
import { useTheme } from "next-themes"
import { FolderKanban, Plug, UserRound } from "lucide-react"
import AccountSettingsContent from "@/components/settings/account-content"
import ConnectorsSettingsContent from "@/components/settings/connectors-content"
import ProjectsSettingsContent from "@/components/settings/projects-content"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const PROFILE_TABS = [
  { id: "account", label: "Account", icon: UserRound },
  { id: "connectors", label: "Connectors", icon: Plug },
  { id: "projects", label: "Projects", icon: FolderKanban },
] as const

type ProfileTab = (typeof PROFILE_TABS)[number]["id"]

export function ProfileSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [activeTab, setActiveTab] = useState<ProfileTab>("account")
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== "light"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-profile-theme={isDark ? "dark" : "light"}
        className={cn(
 "grid h-[min(86dvh,760px)] w-[85vw] max-w-[1100px] grid-cols-1 grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl p-0 shadow-2xl sm:w-[85vw] sm:max-w-[1100px] md:grid-cols-[232px_minmax(0,1fr)]",
          isDark
            ? "border-zinc-700 bg-[#171717] text-zinc-100"
            : "border-zinc-200 bg-white text-zinc-900"
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Profile settings</DialogTitle>
          <DialogDescription>Manage your account, connectors, and projects.</DialogDescription>
        </DialogHeader>
        <div
          className={cn(
            "flex min-h-0 flex-col border-b p-3 md:border-b-0 md:border-r md:p-4",
            isDark ? "border-zinc-800 bg-[#141414]" : "border-zinc-200 bg-zinc-50"
          )}
        >
          <p className={cn(
            "mb-3 px-3 text-[11px] font-semibold uppercase tracking-wide",
            isDark ? "text-zinc-500" : "text-zinc-400"
          )}>
            Profile settings
          </p>
          <nav
            aria-label="Profile settings sections"
            className="flex min-h-0 gap-1 overflow-x-auto md:flex-col md:overflow-x-hidden"
          >
            {PROFILE_TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={activeTab === id ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors md:w-full",
                  activeTab === id
                    ? isDark ? "bg-zinc-800 text-white" : "bg-zinc-200 text-zinc-900"
                    : isDark
                      ? "text-zinc-400 hover:bg-zinc-800/60 hover:text-white"
                      : "text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        </div>
        <section
          className={cn(
            "profile-settings-content min-h-0 overflow-y-auto profile-settings-scroll p-5 md:p-7",
            isDark ? "bg-[#171717]" : "bg-white"
          )}
          data-profile-theme={isDark ? "dark" : "light"}
        >
          <h2
            className={cn(
              "mb-5 border-b pb-4 text-base font-semibold",
              isDark ? "border-zinc-800 text-zinc-100" : "border-zinc-200 text-zinc-900"
            )}
          >
            {activeTab === "account" ? "Profile" : activeTab === "connectors" ? "Connectors" : "Projects"}
          </h2>
          {activeTab === "account" && <AccountSettingsContent />}
          {activeTab === "connectors" && (
            <ConnectorsSettingsContent onClose={() => onOpenChange(false)} />
          )}
          {activeTab === "projects" && <ProjectsSettingsContent />}
        </section>
      </DialogContent>
    </Dialog>
  )
}
