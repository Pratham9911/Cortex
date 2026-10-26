"use client"

import { useEffect, useRef, useState, createContext, useContext, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import {
  getTokenExp,
  isTokenExpired,
  wipeLocalSession,
  handleUnauthorized,
  refreshSessionSafely,
  installFetchAuthInterceptor,
  setupProactiveTokenRefresh,
} from "@/lib/auth"

interface User {
  user_id: number
  email?: string
  name?: string
  created_at?: string
  avatar_url?: string
  plan_name?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  logout: () => void
  updateUser: (updates: Partial<User>) => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
  updateUser: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const activeRef = useRef(true)

  // Install global fetch 401 interceptor & background token refresher
  useEffect(() => {
    installFetchAuthInterceptor()
    setupProactiveTokenRefresh()
  }, [])

  // ── clearSession ─────────────────────────────────────────────────────────
  const clearSession = useCallback(() => {
    handleUnauthorized()
    setUser(null)
  }, [])

  // ── logout ───────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error("Error signing out from Supabase:", err)
    }
    clearSession()
  }, [clearSession])

  // ── syncBackendUser ───────────────────────────────────────────────────────
  const syncBackendUser = useCallback(async (token: string, avatarUrl?: string): Promise<boolean> => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL!
      const res = await fetch(`${apiUrl}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.status === 401) {
        // Backend explicitly rejected the token — session is invalid
        return false
      }

      if (!res.ok) {
        // Transient server error (Render waking up, 502/503) — keep existing session
        console.warn("Backend /me returned", res.status, "— keeping existing session")
        return true
      }

      const data = await res.json()
      if (activeRef.current) {
        setUser({
          user_id: data.user_id,
          name: data.name || "Cortex Explorer",
          email: data.email || "explorer@cortex.com",
          created_at: data.created_at,
          avatar_url: data.avatar_url || avatarUrl,
          plan_name: data.plan_name || "Free",
        })
      }
      return true
    } catch (err) {
      // Flaky network or cold start — keep session alive optimistically
      console.warn("Backend sync failed (network):", err)
      return true
    }
  }, [])

  // ── updateUser ───────────────────────────────────────────────────────────
  const updateUser = useCallback((updates: Partial<User>) => {
    setUser(prev => (prev ? { ...prev, ...updates } : prev))
  }, [])

  // ── Initial session check + Supabase listener ─────────────────────────────
  useEffect(() => {
    activeRef.current = true

    // Listen for unauthorized events emitted from fetch interceptor or elsewhere
    const handleUnauthorizedEvent = () => {
      if (activeRef.current) {
        setUser(null)
        setLoading(false)
      }
    }
    window.addEventListener("cortex-unauthorized", handleUnauthorizedEvent)

    const checkInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!activeRef.current) return

        if (session) {
          let token = session.access_token

          // If current token is already expired or near expiry, refresh immediately
          if (isTokenExpired(token, 60)) {
            const refreshed = await refreshSessionSafely()
            if (refreshed) {
              token = refreshed
            }
          }

          localStorage.setItem("access_token", token)
          localStorage.setItem("token_type", "bearer")

          const ok = await syncBackendUser(token, session.user?.user_metadata?.avatar_url)
          if (!ok && activeRef.current) {
            clearSession()
          }
        } else {
          // No Supabase session at all → redirect to login
          clearSession()
        }
      } catch (err) {
        console.error("Error checking initial session:", err)
        if (activeRef.current) clearSession()
      } finally {
        if (activeRef.current) setLoading(false)
      }
    }

    checkInitialSession()

    // Supabase fires SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, etc.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!activeRef.current) return

      if (event === "SIGNED_OUT" || !session) {
        clearSession()
        return
      }

      // Update storage with fresh token
      localStorage.setItem("access_token", session.access_token)
      localStorage.setItem("token_type", "bearer")

      // Only re-sync backend on meaningful events, not every routine token refresh
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        const ok = await syncBackendUser(session.access_token, session.user?.user_metadata?.avatar_url)
        if (!ok && activeRef.current) clearSession()
      }
    })

    return () => {
      activeRef.current = false
      window.removeEventListener("cortex-unauthorized", handleUnauthorizedEvent)
      subscription.unsubscribe()
    }
  }, [clearSession, syncBackendUser])

  // ── Per-navigation token guard ────────────────────────────────────────────
  // On route changes, check token expiry and refresh proactively if needed
  useEffect(() => {
    if (loading) return

    const token = localStorage.getItem("access_token")
    if (isTokenExpired(token, 60)) {
      refreshSessionSafely().then(newToken => {
        if (!newToken && activeRef.current) {
          clearSession()
        }
      })
    }
  }, [pathname, loading, clearSession])

  // ── Guard: redirect unauthenticated users ─────────────────────────────────
  useEffect(() => {
    if (!loading && !user) {
      handleUnauthorized()
    }
  }, [loading, user])

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading || !user) {
    return (
      <div className="h-screen w-full bg-black flex flex-col items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-white border-r-transparent border-b-transparent border-l-transparent" />
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}
