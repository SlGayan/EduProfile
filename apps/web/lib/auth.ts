export interface MockUser {
  id: string
  name: string
  email: string
  role: "teacher" | "admin" | "principal" | "student"
}

const MOCK_USERS: MockUser[] = [
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

function storeUser(user: MockUser | null) {
  if (typeof window !== "undefined") {
    if (user) {
      localStorage.setItem("eduprofile_user", JSON.stringify(user))
    } else {
      localStorage.removeItem("eduprofile_user")
    }
  }
}
export { storeUser }

export async function login(email: string, password: string): Promise<MockUser> {
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
    // Expecting { user: { id, name, email, role } }
    if (!data || !data.user) throw new Error("Invalid response from server")

    const user: MockUser = data.user
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

export function mockLogin(email: string, _password?: string): MockUser | null {
  // Accept any password for demo purposes (password parameter kept for parity with callers)
  const user = MOCK_USERS.find((u) => u.email === email)
  if (user) {
    // Store user in localStorage
    storeUser(user)
    return user
  }
  return null
}

export function mockLogout(): void {
  storeUser(null)
}

export function getCurrentUser(): MockUser | null {
  if (typeof window !== "undefined") {
    const userStr = localStorage.getItem("eduprofile_user")
    if (userStr) {
      try {
        return JSON.parse(userStr)
      } catch {
        return null
      }
    }
  }
  return null
}
