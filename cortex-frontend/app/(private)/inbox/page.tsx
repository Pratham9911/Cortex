"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"
import { InboxContent, useInboxControllerContext } from "@/components/inbox/inbox-dialog"
import { cn } from "@/lib/utils"

export default function InboxPage() {
  const { theme } = useTheme()
  const controller = useInboxControllerContext()
  const isDark = theme === "dark"

  useEffect(() => {
    void controller.loadInbox()
  }, [])

  return (
    <section className={cn("flex h-full min-h-0 w-full flex-col", isDark ? "bg-[#0A0A0A]" : "bg-white")}>
      <InboxContent controller={controller} isDark={isDark} fullPage />
    </section>
  )
}
