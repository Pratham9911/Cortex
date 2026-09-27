"use client"

import { useState } from "react"

export function UserAvatarContents({
  name,
  avatarUrl,
}: {
  name?: string | null
  avatarUrl?: string
}) {
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null)
  const normalizedName = typeof name === "string" ? name.trim() : ""
  const words = normalizedName.split(/\s+/).filter(Boolean)
  const initials = !normalizedName || normalizedName.startsWith("User #")
    ? "U"
    : words.length > 1
      ? `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
      : words[0].slice(0, 2).toUpperCase()
  const normalizedAvatarUrl = avatarUrl?.trim()

  if (normalizedAvatarUrl && failedAvatarUrl !== normalizedAvatarUrl) {
    return (
      <img
        key={normalizedAvatarUrl}
        src={normalizedAvatarUrl}
        alt=""
        onError={() => setFailedAvatarUrl(normalizedAvatarUrl)}
        onLoad={(event) => {
          if (event.currentTarget.naturalWidth === 0) {
            setFailedAvatarUrl(normalizedAvatarUrl)
          }
        }}
        className="size-full object-cover"
      />
    )
  }

  return <span aria-hidden="true">{initials}</span>
}
