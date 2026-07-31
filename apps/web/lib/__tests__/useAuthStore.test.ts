import { describe, it, expect, beforeEach, vi } from "vitest"
import { useAuthStore } from "../useAuthStore"
import { getCurrentUser } from "../auth"
import type { User as MockUser } from "../types"

// Mock console.warn to suppress expected warnings
global.console.warn = vi.fn()

describe("useAuthStore", () => {
  beforeEach(() => {
    // Clear localStorage and reset store before each test
    localStorage.clear()
    useAuthStore.setState({ user: null, isAuthenticated: false })
  })

  describe("Initial State", () => {
    it("should initialize with null user", () => {
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
    })

    it("should have isAuthenticated as false when user is null", () => {
      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
    })

    it("should seed the store's initial user from localStorage at module load", async () => {
      const mockUser: MockUser = {
        id: "1",
        name: "Test User",
        email: "test@edu.com",
        role: "teacher",
        tokenExpiry: Date.now() + 24 * 60 * 60 * 1000,
      }
      localStorage.setItem("eduprofile_user", JSON.stringify(mockUser))

      // The store's initial `user` is seeded once, at module-evaluation time, via
      // getCurrentUser(). vi.resetModules() + a dynamic re-import forces a fresh
      // evaluation (after localStorage is seeded above) so this test actually
      // exercises that seeding logic on the store, not just getCurrentUser() in isolation.
      vi.resetModules()
      const { useAuthStore: freshStore } = await import("../useAuthStore")

      const state = freshStore.getState()
      expect(state.user).toEqual(mockUser)
      expect(state.isAuthenticated).toBe(true)
    })
  })

  describe("setUser", () => {
    it("should set user and mark as authenticated", () => {
      const mockUser: MockUser = {
        id: "1",
        name: "Test User",
        email: "test@edu.com",
        role: "teacher",
      }

      useAuthStore.getState().setUser(mockUser)

      const state = useAuthStore.getState()
      expect(state.user).toEqual(mockUser)
      expect(state.isAuthenticated).toBe(true)
    })

    it("should persist user to localStorage via storeUser() (flat shape, single writer)", () => {
      const mockUser: MockUser = {
        id: "2",
        name: "Admin User",
        email: "admin@edu.com",
        role: "admin",
      }

      useAuthStore.getState().setUser(mockUser)

      const stored = localStorage.getItem("eduprofile_user")
      expect(stored).toBeDefined()
      const parsed = JSON.parse(stored!)
      // storeUser() writes the flat User object directly — no Zustand wrapper shape
      expect(parsed).toEqual(mockUser)
    })

    it("should not set an expired user", () => {
      const expiredUser: MockUser = {
        id: "3",
        name: "Expired User",
        email: "expired@edu.com",
        role: "teacher",
        tokenExpiry: Date.now() - 1000, // already expired
      }

      useAuthStore.getState().setUser(expiredUser)

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
    })

    it("should allow setting user to null", () => {
      const mockUser: MockUser = {
        id: "1",
        name: "Test User",
        email: "test@edu.com",
        role: "teacher",
      }

      useAuthStore.getState().setUser(mockUser)
      expect(useAuthStore.getState().user).toEqual(mockUser)

      useAuthStore.getState().setUser(null)
      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })
  })

  describe("clearUser", () => {
    it("should clear user and set authenticated to false", () => {
      const mockUser: MockUser = {
        id: "1",
        name: "Test User",
        email: "test@edu.com",
        role: "teacher",
      }

      useAuthStore.getState().setUser(mockUser)
      expect(useAuthStore.getState().isAuthenticated).toBe(true)

      useAuthStore.getState().clearUser()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
    })

    it("should remove user from localStorage via storeUser(null)", () => {
      const mockUser: MockUser = {
        id: "1",
        name: "Test User",
        email: "test@edu.com",
        role: "teacher",
      }

      useAuthStore.getState().setUser(mockUser)

      // clearUser() calls mockLogout() -> storeUser(null), which removes the key entirely
      useAuthStore.getState().clearUser()

      const stored = localStorage.getItem("eduprofile_user")
      expect(stored).toBeNull()
    })
  })

  describe("isAuthenticated", () => {
    it("should return true when user exists", () => {
      const mockUser: MockUser = {
        id: "1",
        name: "Test User",
        email: "test@edu.com",
        role: "student",
      }

      useAuthStore.getState().setUser(mockUser)
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })

    it("should return false when user is null", () => {
      useAuthStore.getState().setUser(null)
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })

    it("should update when user changes", () => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false)

      const mockUser: MockUser = {
        id: "1",
        name: "Test User",
        email: "test@edu.com",
        role: "teacher",
      }

      useAuthStore.getState().setUser(mockUser)
      expect(useAuthStore.getState().isAuthenticated).toBe(true)

      useAuthStore.getState().clearUser()
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })
  })

  describe("Role-based scenarios", () => {
    it("should handle teacher role", () => {
      const teacher: MockUser = {
        id: "1",
        name: "Teacher",
        email: "teacher@edu.com",
        role: "teacher",
      }

      useAuthStore.getState().setUser(teacher)
      expect(useAuthStore.getState().user?.role).toBe("teacher")
    })

    it("should handle admin role", () => {
      const admin: MockUser = {
        id: "2",
        name: "Admin",
        email: "admin@edu.com",
        role: "admin",
      }

      useAuthStore.getState().setUser(admin)
      expect(useAuthStore.getState().user?.role).toBe("admin")
    })

    it("should handle principal role", () => {
      const principal: MockUser = {
        id: "3",
        name: "Principal",
        email: "principal@edu.com",
        role: "principal",
      }

      useAuthStore.getState().setUser(principal)
      expect(useAuthStore.getState().user?.role).toBe("principal")
    })

    it("should handle student role", () => {
      const student: MockUser = {
        id: "4",
        name: "Student",
        email: "student@edu.com",
        role: "student",
      }

      useAuthStore.getState().setUser(student)
      expect(useAuthStore.getState().user?.role).toBe("student")
    })
  })
})
