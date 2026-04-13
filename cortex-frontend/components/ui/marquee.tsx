"use client"

import { cn } from "@/lib/utils"
import { ComponentPropsWithoutRef } from "react"

interface MarqueeProps extends ComponentPropsWithoutRef<"div"> {
  reverse?: boolean
  pauseOnHover?: boolean
  children: React.ReactNode
}

export function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  children,
  ...props
}: MarqueeProps) {
  return (
    <div
      {...props}
      className={cn(
        "group relative flex overflow-hidden",
        className
      )}
    >
      <div
        className={cn(
          "flex shrink-0 gap-4 animate-marquee",
          reverse && "[animation-direction:reverse]",
          pauseOnHover && "group-hover:[animation-play-state:paused]"
        )}
      >
        {children}
        {children}
      </div>
    </div>
  )
}