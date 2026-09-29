"use client"

import { useEffect, useState } from "react"
import type { FormEvent, ReactNode } from "react"
import { useTheme } from "next-themes"
import { useAuth } from "@/components/auth/protected-route"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, Loader2, LogOut, Save, Trash2 } from "lucide-react"

export default function AccountSettingsContent() {
  const { user, logout, updateUser } = useAuth()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== "light"
  const [deleteNotice, setDeleteNotice] = useState(false)
  const [name, setName] = useState(user?.name || "")
  const [savingName, setSavingName] = useState(false)
  const [profileError, setProfileError] = useState("")
  const [profileSaved, setProfileSaved] = useState(false)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const initials = user?.name
    ?.trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "CX"

  useEffect(() => {
    setName(user?.name || "")
  }, [user?.name])

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setProfileError("Name cannot be empty.")
      setProfileSaved(false)
      return
    }
    if (trimmedName.length > 100) {
      setProfileError("Name cannot be longer than 100 characters.")
      setProfileSaved(false)
      return
    }

    const token = localStorage.getItem("access_token")
    if (!token) {
      setProfileError("Your session is missing. Please sign in again.")
      setProfileSaved(false)
      return
    }

    setSavingName(true)
    setProfileError("")
    setProfileSaved(false)
    try {
      const response = await fetch(`${apiUrl}/me/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmedName }),
      })
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const detail =
          typeof data === "object" && data !== null && "detail" in data && typeof data.detail === "string"
            ? data.detail
            : "Could not update your name."
        throw new Error(detail)
      }
      if (
        typeof data !== "object" ||
        data === null ||
        !("name" in data) ||
        typeof data.name !== "string"
      ) {
        throw new Error("The profile update response was not in the expected format.")
      }
      setName(data.name)
      updateUser({ name: data.name })
      setProfileSaved(true)
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Could not update your name.")
    } finally {
      setSavingName(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section className="overflow-hidden border-b border-zinc-800 pb-4">
        <div className="divide-y divide-zinc-800 px-5">
          <div className="flex min-h-20 items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-medium text-zinc-200">Avatar</p>
              <p className="mt-1 text-xs text-zinc-500">Your Google profile image is currently read-only.</p>
            </div>
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 text-sm font-bold text-white">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={`${user.name || "User"} avatar`} className="size-full object-cover" />
              ) : initials}
            </div>
          </div>
          <form onSubmit={saveName} className="space-y-2 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label htmlFor="profile-name" className="shrink-0 text-sm font-medium text-zinc-300 sm:w-28">
                Full name
              </label>
              <Input
                id="profile-name"
                autoComplete="name"
                maxLength={100}
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setProfileError("")
                  setProfileSaved(false)
                }}
                disabled={savingName}
                className={
                  isDark
                    ? "h-9 border-zinc-700 bg-[#202020] text-sm text-white placeholder:text-zinc-500"
                    : "h-9 border-zinc-300 bg-white text-sm text-zinc-900 placeholder:text-zinc-400"
                }
              />
              <Button
                type="submit"
                disabled={savingName || !name.trim() || name.trim() === user?.name}
                className="shrink-0 gap-2"
              >
                {savingName ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save
              </Button>
            </div>
            {profileError && <p role="alert" className="text-xs text-red-400 sm:ml-28">{profileError}</p>}
            {profileSaved && (
              <p role="status" className="flex items-center gap-1 text-xs text-emerald-400 sm:ml-28">
                <Check className="size-3.5" /> Name updated.
              </p>
            )}
          </form>
          <AccountValue label="User ID" value={user?.user_id != null ? String(user.user_id) : "Not available"} />
          <AccountValue label="Email" value={user?.email || "Not available"} />
        </div>
      </section>

      <section className="overflow-hidden">
        <h3 className="mb-2 text-sm font-semibold text-white">Account</h3>
        <div className="divide-y divide-zinc-800">
          <ActionRow
            title="Log out"
            description="Sign out of this Cortex account on this device."
            action={<Button variant="outline" onClick={logout} className="gap-2"><LogOut className="size-4" /> Log out</Button>}
          />
          <ActionRow
            title="Delete your account"
            description="Account deletion is not available yet."
            action={
              <Button
                variant="outline"
                onClick={() => setDeleteNotice(true)}
                className="gap-2 border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"
              >
                <Trash2 className="size-4" /> Delete account
              </Button>
            }
          />
        </div>
        {deleteNotice && (
          <p role="status" className="border-t border-zinc-800 px-5 py-3 text-xs text-amber-300">
            Account deletion is not available yet. No account changes were made.
          </p>
        )}
      </section>
    </div>
  )
}

function AccountValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 py-3">
      <span className="text-sm font-medium text-zinc-300">{label}</span>
      <span className="max-w-[65%] break-all text-right text-sm text-zinc-400">{value}</span>
    </div>
  )
}

function ActionRow({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <div className="flex flex-col justify-between gap-4 px-5 py-4 sm:flex-row sm:items-center">
      <div>
        <p className="text-sm font-semibold text-zinc-200">{title}</p>
        <p className="mt-1 text-xs text-zinc-500">{description}</p>
      </div>
      {action}
    </div>
  )
}
