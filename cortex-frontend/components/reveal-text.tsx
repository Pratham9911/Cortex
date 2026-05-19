"use client"

import { useEffect, useRef, useState } from "react"

// Splits text into words and reveals each with staggered opacity+blur+translateY
// matching the AGENTIC intro animation style.
export function RevealText({
  children,
  className = "",
  as: Tag = "h2",
  stagger = 80,       // ms between each word
  duration = 700,     // ms per word transition
  delay = 0,          // initial delay before first word
  threshold = 0.2,    // IntersectionObserver threshold
}: {
  children: string
  className?: string
  as?: "h1" | "h2" | "h3" | "p" | "span"
  stagger?: number
  duration?: number
  delay?: number
  threshold?: number
}) {
  const ref       = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  // Split on spaces but preserve line breaks (rendered via <br />)
  const parts = children.split(/(\n)/g)
  const words: { word: string; index: number }[] = []
  let wordIndex = 0
  parts.forEach((part) => {
    if (part === "\n") {
      words.push({ word: "\n", index: wordIndex++ })
    } else {
      part.split(" ").forEach((w, i, arr) => {
        if (w) words.push({ word: i < arr.length - 1 ? w + "\u00A0" : w, index: wordIndex++ })
      })
    }
  })

  return (
    // @ts-ignore — dynamic tag
    <Tag ref={ref} className={className} style={{ display: "block", overflow: "hidden" }}>
      {words.map(({ word, index }) => {
        if (word === "\n") return <br key={`br-${index}`} />

        const wordDelay = delay + index * stagger

        return (
          <span
            key={index}
            style={{
              display:    "inline-block",
              opacity:    visible ? 1 : 0,
              filter:     visible ? "blur(0px)" : "blur(8px)",
              transform:  visible ? "translateY(0)" : "translateY(12px)",
              transition: visible
                ? `opacity ${duration}ms cubic-bezier(0.16,1,0.3,1) ${wordDelay}ms,
                   filter  ${duration}ms cubic-bezier(0.16,1,0.3,1) ${wordDelay}ms,
                   transform ${duration}ms cubic-bezier(0.16,1,0.3,1) ${wordDelay}ms`
                : "none",
            }}
          >
            {word}
          </span>
        )
      })}
    </Tag>
  )
}
