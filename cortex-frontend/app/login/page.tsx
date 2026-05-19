"use client"

import { AuthForm } from "@/components/auth/auth-form"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export default function LoginPage() {
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && theme === "dark"

  return (
    <div className={cn(
      "min-h-screen h-screen w-screen flex items-center justify-center transition-colors duration-300 relative overflow-hidden",
      isDark ? "bg-[#050505]" : "bg-zinc-50"
    )}>
      {/* Stark monochrome ambient background filters */}
      {isDark ? (
        <>
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-zinc-900/20 rounded-full blur-[130px] pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-zinc-800/10 rounded-full blur-[130px] pointer-events-none" />
        </>
      ) : (
        <>
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-zinc-200/50 rounded-full blur-[130px] pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-zinc-100/30 rounded-full blur-[130px] pointer-events-none" />
        </>
      )}

      <AuthForm isRegister={false} />
    </div>
  )
}
