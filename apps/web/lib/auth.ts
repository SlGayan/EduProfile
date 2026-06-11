import type { User } from "./types"

// Re-export for backwards compat (tests import MockUser from here)
export type { User as MockUser }

const MOCK_USERS: User[] = [
  {
    id: "1",
    name: "John Doe",
    email: "teacher@edu.com",
    role: "teacher",
  },
  {
    id: "2",
    name: "Jane Smith",
    email: "admin@edu.com",
    role: "admin",
  },
  {
    id: "3",
    name: "Robert Wilson",
    email: "principal@edu.com",
    role: "principal",
  },
  {
    id: "4",
    name: "Alice Johnson",
    email: "student@edu.com",
    role: "student",
  },
]

function storeUser(user: User | null) {
  if (typeof window !== "undefined") {
    if (user) {
      localStorage.setItem("eduprofile_user", JSON.stringify(user))
      // Set cookies for middleware
      document.cookie = `eduprofile_role=${user.role}; path=/; max-age=${30 * 24 * 60 * 60}`
      document.cookie = `eduprofile_user=${JSON.stringify(user)}; path=/; max-age=${30 * 24 * 60 * 60}`
    } else {
      localStorage.removeItem("eduprofile_user")
      // Remove cookies
      document.cookie = "eduprofile_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"
      document.cookie = "eduprofile_user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"
    }
  }
}
export { storeUser }

/**
 * Check if a user's token has expired
 */
export function isTokenExpired(user: User | null): boolean {
  if (!user || !user.tokenExpiry) return false
  return Date.now() >= user.tokenExpiry
}

export async function login(email: string, password: string): Promise<User> {
  // Try the real API first
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const payload = await res.json().catch(() => null)
      const message = payload?.message || `Login failed (${res.status})`
      throw new Error(message)
    }

    const data = await res.json()
    // Expecting { user: { id, name, email, role }, tokenExpiry?: number }
    if (!data || !data.user) throw new Error("Invalid response from server")

    const user: User = {
      ...data.user,
      tokenExpiry: data.tokenExpiry || Date.now() + 24 * 60 * 60 * 1000, // Default 24h expiry
    }
    storeUser(user)
    return user
  } catch (err) {
    // On network error or missing API, fall back to mock login for demo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e: any = err
    if (e?.message && e.message.includes("Failed to fetch")) {
      const user = mockLogin(email, password)
      if (user) return user
    }
    throw err
  }
}

export function mockLogin(email: string, _password?: string): User | null {
  // Accept any password for demo purposes (password parameter kept for parity with callers)
  const user = MOCK_USERS.find((u) => u.email === email)
  if (user) {
    // Add token expiry for demo (24 hours from now)
    const userWithExpiry: User = {
      ...user,
      tokenExpiry: Date.now() + 24 * 60 * 60 * 1000,
    }
    // Store user in localStorage
    storeUser(userWithExpiry)
    return userWithExpiry
  }
  return null
}

export function mockLogout(): void {
  storeUser(null)
}

export function getCurrentUser(): User | null {
  if (typeof window !== "undefined") {
    const userStr = localStorage.getItem("eduprofile_user")
    if (userStr) {
      try {
        const user = JSON.parse(userStr) as User
        // Check if token has expired
        if (isTokenExpired(user)) {
          // Auto-logout if expired
          storeUser(null)
          return null
        }
        return user
      } catch {
        return null
      }
    }
  }
  return null
}
