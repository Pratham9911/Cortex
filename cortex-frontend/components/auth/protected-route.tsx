"use client"

import { useEffect, useState, createContext, useContext } from "react"
import { useRouter } from "next/navigation"

interface User {
  user_id: number
  email?: string
  name?: string
  created_at?: string
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

  const logout = () => {
    localStorage.removeItem("access_token")
    localStorage.removeItem("token_type")
    setUser(null)
    router.push("/login")
  }

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("access_token")
      
      if (!token) {
        router.push("/login")
        return
      }

      // Handle the static Google OAuth token simulation
      if (token === "mock_google_oauth_token_cortex_static") {
        setUser({
          user_id: 1,
          name: "Google Explorer",
          email: "google.explorer@cortex.static.com",
          created_at: new Date().toISOString()
        })
        setLoading(false)
        return
      }

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
        const response = await fetch(`${apiUrl}/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          localStorage.removeItem("access_token")
          localStorage.removeItem("token_type")
          router.push("/login")
          return
        }

        const data = await response.json()
        
        // Ensure name is present, default to Email User if none returned
        const userData: User = {
          user_id: data.user_id,
          name: data.name || "Cortex Explorer",
          email: data.email || "explorer@cortex.com",
          created_at: data.created_at
        }
        
        setUser(userData)
      } catch (error) {
        console.error("Auth verification failed", error)
        localStorage.removeItem("access_token")
        localStorage.removeItem("token_type")
        router.push("/login")
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
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
