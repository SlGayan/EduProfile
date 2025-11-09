import { create } from "zustand"
import type { MockUser } from "./auth"
import { getCurrentUser, storeUser, mockLogout } from "./auth"

interface AuthState {
  user: MockUser | null
  setUser: (u: MockUser | null) => void
  clearUser: () => void
}

// Initialize from localStorage (if present) and keep storage in sync
export const useAuthStore = create<AuthState>((set) => ({
  user: getCurrentUser(),
  setUser: (u: MockUser | null) => {
    // persist through the same helper used by auth utilities
    try {
      storeUser(u)
    } catch {
      // ignore storage errors (e.g., SSR or storage blocked)
    }
    set(() => ({ user: u }))
  },
  clearUser: () => {
    try {
      // keep same semantics as mockLogout
      storeUser(null)
      mockLogout()
    } catch {
      // ignore
    }
    set(() => ({ user: null }))
  },
}))
