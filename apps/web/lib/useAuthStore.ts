import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { User } from "./types"
import { isTokenExpired, mockLogout } from "./auth"

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  setUser: (u: User | null) => void
  clearUser: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      setUser: (u: User | null) => {
        // Guard against expired tokens being set
        if (u && isTokenExpired(u)) {
          set(() => ({ user: null, isAuthenticated: false }))
          return
        }
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
    }),
    {
      name: "eduprofile_user", // localStorage key — keeps backward compat
      // Only persist user; isAuthenticated is derived on rehydration
      partialize: (state) => ({ user: state.user }),
      // On rehydration, re-derive isAuthenticated and evict expired tokens
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (state.user && isTokenExpired(state.user)) {
          state.user = null
          state.isAuthenticated = false
        } else {
          state.isAuthenticated = state.user !== null
        }
      },
    }
  )
)
