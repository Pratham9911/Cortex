"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import { useAuth } from "@/components/auth/protected-route"
import { Button } from "@/components/ui/button"
import { LogOut, Trash2 } from "lucide-react"

export default function AccountSettingsContent() {
  const { user, logout } = useAuth()
  const [deleteNotice, setDeleteNotice] = useState(false)
  const initials = user?.name
    ?.trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "CX"

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section className="overflow-hidden border-b border-zinc-800 pb-4">
        <div className="divide-y divide-zinc-800 px-5">
          <div className="flex min-h-20 items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-medium text-zinc-200">Avatar</p>
              <p className="mt-1 text-xs text-zinc-500">Your profile image.</p>
            </div>
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 text-sm font-bold text-white">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={`${user.name || "User"} avatar`} className="size-full object-cover" />
              ) : initials}
            </div>
          </div>
          <AccountValue label="Full name" value={user?.name || "Not available"} />
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
