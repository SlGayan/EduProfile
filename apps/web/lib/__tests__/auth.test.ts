import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  login,
  mockLogin,
  mockLogout,
  getCurrentUser,
  isTokenExpired,
  type MockUser,
} from "../auth"

// Mock fetch
global.fetch = vi.fn()

describe("Auth Utilities", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe("isTokenExpired", () => {
    it("should return false for null user", () => {
      expect(isTokenExpired(null)).toBe(false)
    })

    it("should return false for user without tokenExpiry", () => {
      const user: MockUser = {
        id: "1",
        name: "Test User",
        email: "test@edu.com",
        role: "teacher",
      }
      expect(isTokenExpired(user)).toBe(false)
    })

    it("should return false for valid (non-expired) token", () => {
      const user: MockUser = {
        id: "1",
        name: "Test User",
        email: "test@edu.com",
        role: "teacher",
        tokenExpiry: Date.now() + 60 * 60 * 1000, // 1 hour from now
      }
      expect(isTokenExpired(user)).toBe(false)
    })

    it("should return true for expired token", () => {
      const user: MockUser = {
        id: "1",
        name: "Test User",
        email: "test@edu.com",
        role: "teacher",
        tokenExpiry: Date.now() - 1000, // 1 second ago
      }
      expect(isTokenExpired(user)).toBe(true)
    })
  })

  describe("mockLogin", () => {
    it("should authenticate teacher with correct email", () => {
      const user = mockLogin("teacher@edu.com", "anypassword")

      expect(user).toBeDefined()
      expect(user?.email).toBe("teacher@edu.com")
      expect(user?.role).toBe("teacher")
      expect(user?.name).toBe("John Doe")
    })

    it("should authenticate admin with correct email", () => {
      const user = mockLogin("admin@edu.com", "anypassword")

      expect(user).toBeDefined()
      expect(user?.email).toBe("admin@edu.com")
      expect(user?.role).toBe("admin")
    })

    it("should authenticate principal with correct email", () => {
      const user = mockLogin("principal@edu.com", "anypassword")

      expect(user).toBeDefined()
      expect(user?.email).toBe("principal@edu.com")
      expect(user?.role).toBe("principal")
    })

    it("should authenticate student with correct email", () => {
      const user = mockLogin("student@edu.com", "anypassword")

      expect(user).toBeDefined()
      expect(user?.email).toBe("student@edu.com")
      expect(user?.role).toBe("student")
    })

    it("should return null for invalid email", () => {
      const user = mockLogin("invalid@edu.com", "anypassword")
      expect(user).toBeNull()
    })

    it("should store user in localStorage", () => {
      mockLogin("teacher@edu.com", "password")

      const stored = localStorage.getItem("eduprofile_user")
      expect(stored).toBeDefined()

      const user = JSON.parse(stored!)
      expect(user.email).toBe("teacher@edu.com")
    })

    it("should add tokenExpiry to user", () => {
      const beforeLogin = Date.now()
      const user = mockLogin("teacher@edu.com", "password")
      const afterLogin = Date.now()

      expect(user?.tokenExpiry).toBeDefined()
      expect(user!.tokenExpiry!).toBeGreaterThan(beforeLogin)
      // Should be ~24 hours from now
      expect(user!.tokenExpiry!).toBeGreaterThan(afterLogin + 23 * 60 * 60 * 1000)
    })
  })

  describe("mockLogout", () => {
    it("should remove user from localStorage", () => {
      mockLogin("teacher@edu.com", "password")
      expect(localStorage.getItem("eduprofile_user")).toBeDefined()

      mockLogout()
      expect(localStorage.getItem("eduprofile_user")).toBeNull()
    })
  })

  describe("getCurrentUser", () => {
    it("should return null when no user is stored", () => {
      const user = getCurrentUser()
      expect(user).toBeNull()
    })

    it("should return stored user when valid", () => {
      const mockUser: MockUser = {
        id: "1",
        name: "Test User",
        email: "test@edu.com",
        role: "teacher",
        tokenExpiry: Date.now() + 60 * 60 * 1000,
      }

      localStorage.setItem("eduprofile_user", JSON.stringify(mockUser))

      const user = getCurrentUser()
      expect(user).toEqual(mockUser)
    })

    it("should return null and clear storage for expired token", () => {
      const expiredUser: MockUser = {
        id: "1",
        name: "Test User",
        email: "test@edu.com",
        role: "teacher",
        tokenExpiry: Date.now() - 1000, // Expired
      }

      localStorage.setItem("eduprofile_user", JSON.stringify(expiredUser))

      const user = getCurrentUser()
      expect(user).toBeNull()
      expect(localStorage.getItem("eduprofile_user")).toBeNull()
    })

    it("should handle invalid JSON gracefully", () => {
      localStorage.setItem("eduprofile_user", "invalid json{")

      const user = getCurrentUser()
      expect(user).toBeNull()
    })
  })

  describe("login (API with fallback)", () => {
    it("should call API endpoint with credentials", async () => {
      const mockResponse = {
        user: {
          id: "1",
          name: "API User",
          email: "api@edu.com",
          role: "teacher",
        },
        tokenExpiry: Date.now() + 24 * 60 * 60 * 1000,
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const user = await login("api@edu.com", "password123")

      expect(global.fetch).toHaveBeenCalledWith("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "api@edu.com", password: "password123" }),
      })

      // User should include tokenExpiry from response
      expect(user.id).toBe(mockResponse.user.id)
      expect(user.email).toBe(mockResponse.user.email)
      expect(user.role).toBe(mockResponse.user.role)
      expect(user.tokenExpiry).toBeDefined()
    })

    it("should throw error for failed API response", async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: "Invalid credentials" }),
      })

      await expect(login("wrong@edu.com", "wrongpass")).rejects.toThrow("Invalid credentials")
    })

    it("should fallback to mock login on network error", async () => {
      ;(global.fetch as any).mockRejectedValueOnce(new Error("Failed to fetch"))

      const user = await login("teacher@edu.com", "anypassword")

      expect(user).toBeDefined()
      expect(user.email).toBe("teacher@edu.com")
      expect(user.role).toBe("teacher")
    })

    it("should store user in localStorage after successful login", async () => {
      const mockResponse = {
        user: {
          id: "1",
          name: "API User",
          email: "api@edu.com",
          role: "teacher",
        },
        tokenExpiry: Date.now() + 24 * 60 * 60 * 1000,
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      await login("api@edu.com", "password123")

      const stored = localStorage.getItem("eduprofile_user")
      expect(stored).toBeDefined()

      const user = JSON.parse(stored!)
      expect(user.email).toBe("api@edu.com")
    })

    it("should add default tokenExpiry if not provided by API", async () => {
      const mockResponse = {
        user: {
          id: "1",
          name: "API User",
          email: "api@edu.com",
          role: "teacher",
        },
        // No tokenExpiry
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const beforeLogin = Date.now()
      const user = await login("api@edu.com", "password123")
      const afterLogin = Date.now()

      expect(user.tokenExpiry).toBeDefined()
      expect(user.tokenExpiry!).toBeGreaterThan(beforeLogin)
      expect(user.tokenExpiry!).toBeGreaterThan(afterLogin + 23 * 60 * 60 * 1000)
    })

    it("should throw error for invalid API response format", async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: "response" }),
      })

      await expect(login("test@edu.com", "password")).rejects.toThrow(
        "Invalid response from server"
      )
    })
  })
})
