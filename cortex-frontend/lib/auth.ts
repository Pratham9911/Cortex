import { supabase } from "@/lib/supabase"

/**
 * Decode a JWT payload without an external library to read the `exp` field.
 */
export function getTokenExp(token: string): number | null {
  try {
    const parts = token.split(".")
    if (parts.length < 2) return null
    const payload = JSON.parse(atob(parts[1]))
    return typeof payload.exp === "number" ? payload.exp : null
  } catch {
    return null
  }
}

/**
 * Returns true if the token is missing, unparseable, or expires within `bufferSeconds`.
 */
export function isTokenExpired(token: string | null | undefined, bufferSeconds = 60): boolean {
  if (!token) return true
  const exp = getTokenExp(token)
  if (exp === null) return false
  return Date.now() / 1000 > exp - bufferSeconds
}

/**
 * Wipe all local authentication storage.
 */
export function wipeLocalSession() {
  if (typeof window === "undefined") return
  localStorage.removeItem("access_token")
  localStorage.removeItem("token_type")
}

/**
 * Cleanly handle unauthorized state (expired session, revoked token, 401).
 * Wipes tokens, signs out of Supabase, alerts listening contexts,
 * and redirects the user to /login.
 */
let isRedirectingToLogin = false

export function handleUnauthorized() {
  if (typeof window === "undefined") return
  if (isRedirectingToLogin) return

  wipeLocalSession()

  // Sign out from Supabase in the background
  try {
    supabase.auth.signOut().catch(() => {})
  } catch {}

  // Broadcast event so active React contexts update immediately
  window.dispatchEvent(new CustomEvent("cortex-unauthorized"))

  const pathname = window.location.pathname
  const isAuthRoute = pathname === "/login" || pathname === "/register" || pathname === "/"

  if (!isAuthRoute) {
    isRedirectingToLogin = true
    window.location.href = "/login"
    // Reset guard after 3 seconds in case navigation is delayed
    setTimeout(() => {
      isRedirectingToLogin = false
    }, 3000)
  }
}

/**
 * Deduplicated session refresh. If multiple API calls detect an expiring token
 * at the same time, only a single refreshSession call is in flight.
 */
let refreshPromise: Promise<string | null> | null = null

export async function refreshSessionSafely(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error || !data.session) {
        console.warn("[Auth] Failed to refresh Supabase session:", error?.message)
        handleUnauthorized()
        return null
      }

      const newToken = data.session.access_token
      if (typeof window !== "undefined") {
        localStorage.setItem("access_token", newToken)
        localStorage.setItem("token_type", "bearer")
      }
      return newToken
    } catch (err) {
      console.error("[Auth] Unexpected error during session refresh:", err)
      handleUnauthorized()
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

/**
 * Retrieve a guaranteed valid access token.
 * If the current token is within 2 minutes of expiry, it is refreshed silently first.
 */
export async function getValidAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null

  const token = localStorage.getItem("access_token")
  if (!token) {
    return null
  }

  // If token is expiring within 120 seconds, refresh it now
  if (isTokenExpired(token, 120)) {
    return await refreshSessionSafely()
  }

  return token
}

/**
 * Intercept window.fetch to automatically handle 401s:
 * 1. Attempt silent token refresh via Supabase.
 * 2. If refreshed, retry the request transparently with the new token.
 * 3. If refresh fails or retry also returns 401, trigger handleUnauthorized() and redirect to /login.
 */
let isFetchInterceptorInstalled = false

export function installFetchAuthInterceptor() {
  if (typeof window === "undefined" || isFetchInterceptorInstalled) return
  isFetchInterceptorInstalled = true

  const originalFetch = window.fetch

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const response = await originalFetch(input, init)

    // Check if response is 401 Unauthorized
    if (response.status === 401) {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ""

      // Only intercept calls targeting our backend API
      const isBackendCall = !apiUrl || urlStr.startsWith(apiUrl) || urlStr.includes("/projects") || urlStr.includes("/getprojects") || urlStr.includes("/me")

      if (isBackendCall) {
        // Try refreshing the session once
        const newToken = await refreshSessionSafely()
        if (newToken) {
          // Retry the request with the fresh token
          const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
          headers.set("Authorization", `Bearer ${newToken}`)

          const retryInit: RequestInit = {
            ...init,
            headers,
          }

          const retriedResponse = await originalFetch(input, retryInit)
          if (retriedResponse.status === 401) {
            // Even with fresh token backend returned 401 -> session revoked
            handleUnauthorized()
          }
          return retriedResponse
        } else {
          // Refresh failed -> redirect to /login
          handleUnauthorized()
        }
      }
    }

    return response
  }
}

/**
 * Setup proactive background token refresh:
 * - Checks every 30 seconds if token has < 5 minutes remaining.
 * - On window focus or tab visibility change, checks and refreshes immediately.
 */
let isProactiveRefreshInstalled = false

export function setupProactiveTokenRefresh() {
  if (typeof window === "undefined" || isProactiveRefreshInstalled) return
  isProactiveRefreshInstalled = true

  const checkAndRefresh = async () => {
    const token = localStorage.getItem("access_token")
    if (!token) return

    // Refresh if within 5 minutes (300 seconds) of expiration
    if (isTokenExpired(token, 300)) {
      await refreshSessionSafely()
    }
  }

  // Periodic interval
  setInterval(checkAndRefresh, 30 * 1000)

  // On tab focus / visibility
  window.addEventListener("focus", checkAndRefresh)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkAndRefresh()
    }
  })
}
