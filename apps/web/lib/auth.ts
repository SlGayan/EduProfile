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

export function mockLogin(email: string): MockUser | null {
  // Accept any password for demo purposes
  const user = MOCK_USERS.find((u) => u.email === email)
  if (user) {
    // Store user in localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("eduprofile_user", JSON.stringify(user))
    }
    return user
  }
  return null
}

export function mockLogout(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("eduprofile_user")
  }
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
