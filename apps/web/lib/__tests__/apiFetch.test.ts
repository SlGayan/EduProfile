import { describe, it, expect, beforeEach, vi, type Mock } from "vitest"
import { apiFetch, handleSessionExpired, SESSION_EXPIRED_FLAG } from "../apiFetch"
import { useAuthStore } from "../useAuthStore"
import type { User as MockUser } from "../types"

global.fetch = vi.fn()

function setLocation(pathname: string) {
  Object.defineProperty(window, "location", {
    writable: true,
    configurable: true,
    value: { pathname, href: "" } as unknown as Location,
  })
}

describe("apiFetch", () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
    useAuthStore.setState({ user: null, isAuthenticated: false })
    setLocation("/admin/users")
  })

  it("attaches the Authorization header from the stored user's token", async () => {
    const mockUser: MockUser = {
      id: "1",
      name: "Test User",
      email: "test@edu.com",
      role: "admin",
      token: "abc123",
      tokenExpiry: Date.now() + 60 * 60 * 1000,
    }
    localStorage.setItem("eduprofile_user", JSON.stringify(mockUser))

    ;(global.fetch as Mock).mockResolvedValueOnce({ status: 200, ok: true })

    await apiFetch("/api/users")

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/users",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer abc123" }),
      })
    )
  })

  it("passes a non-401 response through unchanged with no side effects", async () => {
    const response = { status: 200, ok: true }
    ;(global.fetch as Mock).mockResolvedValueOnce(response)

    useAuthStore.getState().setUser({
      id: "1",
      name: "Test User",
      email: "test@edu.com",
      role: "admin",
    })

    const result = await apiFetch("/api/users")

    expect(result).toBe(response)
    expect(useAuthStore.getState().user).not.toBeNull()
    expect(sessionStorage.getItem(SESSION_EXPIRED_FLAG)).toBeNull()
    expect(window.location.href).toBe("")
  })

  it("on a 401 response, clears the auth store, sets the session-expired flag, and redirects to /login", async () => {
    ;(global.fetch as Mock).mockResolvedValueOnce({ status: 401, ok: false })

    useAuthStore.getState().setUser({
      id: "1",
      name: "Test User",
      email: "test@edu.com",
      role: "admin",
    })
    expect(useAuthStore.getState().isAuthenticated).toBe(true)

    const result = await apiFetch("/api/users")

    expect(result.status).toBe(401)
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(sessionStorage.getItem(SESSION_EXPIRED_FLAG)).toBe("1")
    expect(window.location.href).toBe("/login")
  })

  it("still returns the 401 Response so existing callers' if (!res.ok) handling keeps working", async () => {
    const response = { status: 401, ok: false, json: async () => ({ error: "Invalid or expired token" }) }
    ;(global.fetch as Mock).mockResolvedValueOnce(response)

    const result = await apiFetch("/api/users")

    expect(result).toBe(response)
    expect(result.ok).toBe(false)
  })
})

describe("handleSessionExpired", () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it("sets the session-expired flag and redirects to /login when not already there", () => {
    setLocation("/admin/users")

    handleSessionExpired()

    expect(sessionStorage.getItem(SESSION_EXPIRED_FLAG)).toBe("1")
    expect(window.location.href).toBe("/login")
  })

  it("does nothing when already on /login (avoids a redirect loop)", () => {
    setLocation("/login")

    handleSessionExpired()

    expect(sessionStorage.getItem(SESSION_EXPIRED_FLAG)).toBeNull()
    expect(window.location.href).toBe("")
  })
})
