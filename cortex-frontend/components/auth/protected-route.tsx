"use client"

import { useEffect, useState, createContext, useContext } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

interface User {
  user_id: number
  email?: string
  name?: string
  created_at?: string
  avatar_url?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const clearSession = () => {
    localStorage.removeItem("access_token")
    localStorage.removeItem("token_type")
    setUser(null)
    router.push("/login")
  }

  const logout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error("Error signing out from Supabase:", error)
    }
    clearSession()
  }

  const syncBackendUser = async (token: string, avatarUrl?: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      const response = await fetch(`${apiUrl}/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.status === 401) {
        clearSession()
        return
      }

      if (!response.ok) {
        throw new Error(`Failed to sync backend user: ${response.statusText}`)
      }

      const data = await response.json()
      
      const userData: User = {
        user_id: data.user_id,
        name: data.name || "Cortex Explorer",
        email: data.email || "explorer@cortex.com",
        created_at: data.created_at,
        avatar_url: avatarUrl
      }
      
      setUser(userData)
    } catch (error) {
      console.error("Backend synchronization failed:", error)
    }
  }

  useEffect(() => {
    let active = true

    const checkInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        if (!active) return

        if (session) {
          localStorage.setItem("access_token", session.access_token)
          localStorage.setItem("token_type", "bearer")
          await syncBackendUser(session.access_token, session.user?.user_metadata?.avatar_url)
        } else {
          clearSession()
        }
      } catch (error) {
        console.error("Error checking initial session:", error)
        if (active) clearSession()
      } finally {
        if (active) setLoading(false)
      }
    }

    checkInitialSession()

    // Listen for auth state changes (login, logout, token refresh, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return

      if (session) {
        localStorage.setItem("access_token", session.access_token)
        localStorage.setItem("token_type", "bearer")
        await syncBackendUser(session.access_token, session.user?.user_metadata?.avatar_url)
      } else {
        clearSession()
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [router])

  if (loading) {
    return (
      <div className="h-screen w-full bg-black flex flex-col items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-white border-r-transparent border-b-transparent border-l-transparent"></div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
