import { create } from "zustand"
import type { MockUser } from "./auth"
import { getCurrentUser, storeUser, mockLogout } from "./auth"

interface AuthState {
  user: MockUser | null
  isAuthenticated: boolean
  setUser: (u: MockUser | null) => void
  clearUser: () => void
}

// Initialize from localStorage (if present) and keep storage in sync
export const useAuthStore = create<AuthState>((set) => {
  const initialUser = getCurrentUser()
  
  return {
    user: initialUser,
    // Derived state: isAuthenticated is true when user exists
    isAuthenticated: initialUser !== null,
    setUser: (u: MockUser | null) => {
      // persist through the same helper used by auth utilities
      try {
        storeUser(u)
      } catch (error) {
        // Log storage errors for debugging but don't throw
        console.warn("Failed to store user in localStorage:", error)
        // ignore storage errors (e.g., SSR or storage blocked)
      }
      set(() => ({ user: u, isAuthenticated: u !== null }))
    },
    clearUser: () => {
      try {
        // keep same semantics as mockLogout
        storeUser(null)
        mockLogout()
      } catch (error) {
        console.warn("Failed to clear user from localStorage:", error)
        // ignore
      }
      set(() => ({ user: null, isAuthenticated: false }))
    },
  }
})
