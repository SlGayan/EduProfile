import { getCurrentUser } from "./auth"
import { useAuthStore } from "./useAuthStore"

export const SESSION_EXPIRED_FLAG = "eduprofile_session_expired"

// Separated out as its own function so tests can exercise the redirect
// decision (flag + target) without depending on jsdom's unimplemented
// navigation behavior for `window.location.href` assignment.
export function handleSessionExpired(): void {
  if (typeof window === "undefined") return
  if (window.location.pathname === "/login") return
  sessionStorage.setItem(SESSION_EXPIRED_FLAG, "1")
  window.location.href = "/login"
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const user = getCurrentUser()
  const token = user?.token

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  const response = await fetch(path, { ...options, headers })

  if (response.status === 401) {
    useAuthStore.getState().clearUser()
    handleSessionExpired()
  }

  return response
}
