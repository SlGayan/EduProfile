import { create } from "zustand"
import type { User } from "./types"
import { isTokenExpired, mockLogout, getCurrentUser, storeUser } from "./auth"

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  setUser: (u: User | null) => void
  clearUser: () => void
}

// storeUser() (in ./auth) is the single function that writes auth state to
// localStorage/cookies. This store never writes storage directly — it seeds
// its initial state from storeUser()'s last write (via getCurrentUser()) and
// calls storeUser()/mockLogout() on every change, so there is exactly one
// writer instead of this store's old `persist` middleware racing storeUser()
// for the same localStorage key.
const initialUser = typeof window !== "undefined" ? getCurrentUser() : null

export const useAuthStore = create<AuthState>()((set) => ({
  user: initialUser,
  isAuthenticated: initialUser !== null,

  setUser: (u: User | null) => {
    // Guard against expired tokens being set
    if (u && isTokenExpired(u)) {
      storeUser(null)
      set(() => ({ user: null, isAuthenticated: false }))
      return
    }
    storeUser(u)
    set(() => ({ user: u, isAuthenticated: u !== null }))
  },

  clearUser: () => {
    try {
      mockLogout()
    } catch (error) {
      console.warn("Failed to clear auth data:", error)
    }
    set(() => ({ user: null, isAuthenticated: false }))
  },
}))
