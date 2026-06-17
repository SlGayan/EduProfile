import { getCurrentUser } from "./auth"

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const user = getCurrentUser()
  const token = user?.token

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  return fetch(path, { ...options, headers })
}
