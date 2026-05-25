"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"

export default function DebugLoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [jwtToken, setJwtToken] = useState<string | null>(null)
  const [googleToken, setGoogleToken] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  useEffect(() => {
    const checkSession = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        console.error(error)
        return
      }

      if (data?.session) {
        const tokenValue = data.session.access_token
        setGoogleToken(tokenValue)
      }
    }

    checkSession()
  }, [])

  const copyToClipboard = async (value: string) => {
    await navigator.clipboard.writeText(value)
    setMessage("Token copied to clipboard")
    setTimeout(() => setMessage(""), 2000)
  }

  const handleEmailLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setError("")
    setMessage("")
    setJwtToken(null)
    setLoading(true)

    try {
      const response = await fetch(`${apiUrl}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.detail || "Login failed")
      }

      const data = await response.json()
      setJwtToken(data.access_token)
      setMessage("JWT access token received from backend")
    } catch (err: any) {
      setError(err.message || "Unable to login")
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError("")
    setMessage("")
    setLoading(true)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/debug-login",
        },
      })

      if (error) throw error
    } catch (err: any) {
      setError(err.message || "Google login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">Debug Login</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Use this page to request a backend JWT token with email/password or to get a Supabase Google token.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Email login (backend JWT)</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">This will call <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">POST /login</code> and return a JWT token for Swagger UI.</p>
            <form onSubmit={handleEmailLogin} className="mt-5 space-y-4">
              <div>
                <Label htmlFor="debug-email" className="text-sm text-slate-700 dark:text-slate-300">Email</Label>
                <Input
                  id="debug-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  placeholder="you@example.com"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="debug-password" className="text-sm text-slate-700 dark:text-slate-300">Password</Label>
                <Input
                  id="debug-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  placeholder="password"
                  className="mt-2"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>Get JWT token</Button>
            </form>
            {jwtToken && (
              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-700 dark:bg-slate-950">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Access token</p>
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(jwtToken)}>
                    Copy
                  </Button>
                </div>
                <textarea readOnly value={jwtToken} rows={4} className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-900 outline-none dark:border-zinc-700 dark:bg-slate-900 dark:text-slate-100" />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Paste this token into Swagger UI authorize as <code>Bearer &lt;token&gt;</code>.</p>
              </div>
            )}
          </Card>

          <Card className="border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Google login (Supabase token)</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">This will sign in with Google via Supabase and show the session token.</p>
            <div className="mt-5 space-y-4">
              <Button type="button" className="w-full" onClick={handleGoogleLogin} disabled={loading}>Login with Google</Button>
              {googleToken && (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-700 dark:bg-slate-950">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Supabase token</p>
                    <Button variant="outline" size="sm" onClick={() => copyToClipboard(googleToken)}>
                      Copy
                    </Button>
                  </div>
                  <textarea readOnly value={googleToken} rows={4} className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-900 outline-none dark:border-zinc-700 dark:bg-slate-900 dark:text-slate-100" />
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">This token is from Supabase Google login. Use backend JWT token for Swagger if needed.</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {(message || error) && (
          <div className={cn(
            "rounded-3xl border p-4 text-sm",
            error ? "border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/40" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40"
          )}>
            {error || message}
          </div>
        )}
      </div>
    </main>
  )
}
