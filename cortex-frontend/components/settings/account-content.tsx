"use client"

import { useEffect, useState } from "react"
import type { FormEvent, ReactNode } from "react"
import { useTheme } from "next-themes"
import { useAuth } from "@/components/auth/protected-route"
import { UserAvatarContents } from "@/components/teams/user-avatar-contents"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Check, Loader2, LogOut, Save, Trash2, TriangleAlert } from "lucide-react"

export default function AccountSettingsContent() {
  const { user, logout, updateUser } = useAuth()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== "light"
  const [name, setName] = useState(user?.name || "")
  const [savingName, setSavingName] = useState(false)
  const [profileError, setProfileError] = useState("")
  const [profileSaved, setProfileSaved] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState("")
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [ownedProjects, setOwnedProjects] = useState<{ project_id: number; name: string }[]>([])
  const [deletingAccount, setDeletingAccount] = useState(false)
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
  const deletePhrase = "DELETE MY ACCOUNT"

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

  const handleDeleteAccount = async () => {
    if (!user?.email || deleteEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      setDeleteError("Enter the email address for this account to continue.")
      return
    }
    if (deleteConfirmation !== deletePhrase) {
      setDeleteError(`Type "${deletePhrase}" exactly to continue.`)
      return
    }

    const token = localStorage.getItem("access_token")
    if (!token) {
      setDeleteError("Your session is missing. Please sign in again.")
      return
    }

    setDeletingAccount(true)
    setDeleteError("")
    setOwnedProjects([])
    try {
      const response = await fetch(`${apiUrl}/me/account`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: deleteEmail.trim(),
          confirmation: deleteConfirmation,
        }),
      })
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        let message = "Could not delete your account."
        if (typeof data === "object" && data !== null && "detail" in data) {
          const detail = data.detail
          if (typeof detail === "string") {
            message = detail
          } else if (typeof detail === "object" && detail !== null) {
            if ("message" in detail && typeof detail.message === "string") {
              message = detail.message
            }
            if ("projects" in detail && Array.isArray(detail.projects)) {
              const projects = detail.projects.filter(
                (project): project is { project_id: number; name: string } =>
                  typeof project === "object" &&
                  project !== null &&
                  "project_id" in project &&
                  typeof project.project_id === "number" &&
                  "name" in project &&
                  typeof project.name === "string"
              )
              setOwnedProjects(projects)
            }
          }
        }
        throw new Error(message)
      }

      await logout()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete your account.")
    } finally {
      setDeletingAccount(false)
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
              <UserAvatarContents name={user?.name} avatarUrl={user?.avatar_url || undefined} />
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
            description="Permanently remove your Cortex access and personal account details."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteEmail("")
                  setDeleteConfirmation("")
                  setDeleteError("")
                  setOwnedProjects([])
                  setDeleteOpen(true)
                }}
                className="gap-2 border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"
              >
                <Trash2 className="size-4" /> Delete account
              </Button>
            }
          />
        </div>
      </section>
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deletingAccount) setDeleteOpen(open)
        }}
      >
        <DialogContent className={isDark ? "border-red-500/30 bg-[#15171d] text-white" : "border-red-200 bg-white text-zinc-900"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-red-400" />
              Delete your Cortex account?
            </DialogTitle>
            <DialogDescription className={isDark ? "pt-1 text-zinc-400" : "pt-1 text-zinc-600"}>
              This permanently removes your sign-in, integrations, memberships, notifications, and private chat history.
              Shared project content is retained with your attribution anonymized as “Deleted User”. You can later sign up
              with the same email as a new account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className={isDark ? "rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200" : "rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"}>
              Accounts that own projects cannot be deleted. Transfer ownership or delete those projects first.
            </div>
            <p className={isDark ? "text-xs text-zinc-400" : "text-xs text-zinc-600"}>
              For security, you must have signed in within the last 10 minutes. If needed, sign out and sign back in before continuing.
            </p>
            <div className="space-y-2">
              <label htmlFor="delete-account-email" className="text-sm font-medium">Account email</label>
              <Input
                id="delete-account-email"
                type="email"
                autoComplete="email"
                value={deleteEmail}
                onChange={(event) => setDeleteEmail(event.target.value)}
                disabled={deletingAccount}
                placeholder={user?.email || "Enter your email"}
                className={isDark ? "border-zinc-700 bg-[#202020] text-white" : "border-zinc-300 bg-white text-zinc-900"}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="delete-account-confirmation" className="text-sm font-medium">
                Type <span className="font-mono font-bold">{deletePhrase}</span> to confirm
              </label>
              <Input
                id="delete-account-confirmation"
                autoComplete="off"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                disabled={deletingAccount}
                className={isDark ? "border-zinc-700 bg-[#202020] text-white" : "border-zinc-300 bg-white text-zinc-900"}
              />
            </div>
            {ownedProjects.length > 0 && (
              <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                <p className="font-semibold">Transfer ownership or delete these projects first:</p>
                <ul className="mt-2 list-inside list-disc">
                  {ownedProjects.map((project) => <li key={project.project_id}>{project.name}</li>)}
                </ul>
              </div>
            )}
            {deleteError && (
              <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {deleteError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deletingAccount}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={
                deletingAccount ||
                deleteConfirmation !== deletePhrase ||
                deleteEmail.trim().toLowerCase() !== user?.email?.toLowerCase()
              }
            >
              {deletingAccount && <Loader2 className="mr-2 size-4 animate-spin" />}
              Permanently delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
