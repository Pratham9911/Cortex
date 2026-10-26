/**
 * wake-ingestion-worker.ts
 *
 * Generic Render cold-start waker.
 *
 * Exported helpers:
 *   wakeIngestionWorker()  — pings the lightweight ingestion worker (/healthz)
 *   wakeBackend()          — pings the main Cortex backend (/)
 *
 * Both are fire-and-forget: call without awaiting so the UI is never blocked.
 *
 * Configuration (Next.js env):
 *   NEXT_PUBLIC_INGESTION_WORKER_URL=https://cortex-ingestion-worker-0qo7.onrender.com
 *   NEXT_PUBLIC_API_URL=https://cortex-ubgz.onrender.com   ← already required by the app
 *
 * Behaviour per call:
 *   - Polls the given endpoint every POLL_INTERVAL_MS milliseconds
 *   - Stops once a 200 OK is received (service is awake)
 *   - Gives up after MAX_ATTEMPTS (the job/request will still work once
 *     the service wakes up naturally — Render keeps queued requests alive)
 *   - Never throws — failures are swallowed so the user flow is never blocked
 */

/** Gap between health-check pings (ms) */
const POLL_INTERVAL_MS = 10_000

/**
 * Max number of pings before giving up.
 * 12 × 10 s = 120 s (2 min) — enough for a cold Render free-tier start.
 */
const MAX_ATTEMPTS = 12

/**
 * Internal factory: creates a fire-and-forget poller for a given service.
 *
 * @param serviceUrl   Base URL of the Render service (no trailing slash)
 * @param path         Endpoint to ping, e.g. "/" or "/healthz"
 * @param serviceName  Human-readable name used in console logs
 */
function wakeRenderService(
  serviceUrl: string,
  path: string,
  serviceName: string,
  onAwake?: () => void,
  onGiveUp?: () => void,
): void {
  if (!serviceUrl) {
    console.warn(`[wakeRenderService] URL for "${serviceName}" is not set — skipping wake.`)
    return
  }

  const url = `${serviceUrl.replace(/\/$/, "")}${path}`
  let attempt = 0

  const ping = async () => {
    attempt++
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(8_000),
      })

      if (res.ok) {
        console.info(`[wakeRenderService] "${serviceName}" is awake after ${attempt} ping(s).`)
        onAwake?.()
        return
      }

      console.info(
        `[wakeRenderService] "${serviceName}" attempt ${attempt}/${MAX_ATTEMPTS} — status ${res.status}, not ready yet.`,
      )
    } catch (err) {
      console.info(
        `[wakeRenderService] "${serviceName}" attempt ${attempt}/${MAX_ATTEMPTS} — unreachable (${(err as Error).message}).`,
      )
    }

    if (attempt >= MAX_ATTEMPTS) {
      console.warn(
        `[wakeRenderService] Giving up on "${serviceName}" after ${MAX_ATTEMPTS} attempts. ` +
        "The service will process the request once it wakes up.",
      )
      onGiveUp?.()
      return
    }

    setTimeout(ping, POLL_INTERVAL_MS)
  }

  // First ping immediately, don't wait for the interval
  ping()
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Wake the lightweight ingestion worker on Render.
 * Call fire-and-forget before any document upload.
 */
export function wakeIngestionWorker(onAwake?: () => void, onGiveUp?: () => void): void {
  const url = process.env.NEXT_PUBLIC_INGESTION_WORKER_URL ?? ""
  wakeRenderService(url, "/healthz", "Ingestion Worker", onAwake, onGiveUp)
}

/**
 * Wake the main Cortex backend on Render.
 * Call fire-and-forget when the landing page or workspace mounts.
 */
export function wakeBackend(onAwake?: () => void, onGiveUp?: () => void): void {
  const url = process.env.NEXT_PUBLIC_API_URL ?? ""
  wakeRenderService(url, "/", "Cortex Backend", onAwake, onGiveUp)
}

