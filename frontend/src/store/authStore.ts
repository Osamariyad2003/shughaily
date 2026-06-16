import { create } from 'zustand'
import type { User } from '@/lib/types'
import { api } from '@/lib/api'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean

  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  googleLogin: (code: string) => Promise<{ isNewUser: boolean }>
  logout: () => void
  loadUser: () => Promise<void>
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true })
    try {
      const res = await api.post<{ user: User; token: string }>('/auth/login', {
        email,
        password,
      })
      if (res.data) {
        api.setToken(res.data.token)
        set({
          user: res.data.user,
          token: res.data.token,
          isAuthenticated: true,
          isLoading: false,
        })
      }
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  register: async (name: string, email: string, password: string) => {
    set({ isLoading: true })
    try {
      const res = await api.post<{ user: User; token: string }>('/auth/register', {
        name,
        email,
        password,
      })
      if (res.data) {
        api.setToken(res.data.token)
        set({
          user: res.data.user,
          token: res.data.token,
          isAuthenticated: true,
          isLoading: false,
        })
      }
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  googleLogin: async (code: string) => {
    set({ isLoading: true })
    try {
      const res = await api.post<{ user: User; token: string; isNewUser: boolean }>('/auth/google', {
        code,
      })
      if (res.data) {
        api.setToken(res.data.token)
        set({
          user: res.data.user,
          token: res.data.token,
          isAuthenticated: true,
          isLoading: false,
        })
        return { isNewUser: res.data.isNewUser }
      }
      return { isNewUser: false }
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  logout: () => {
    api.setToken(null)
    set({ user: null, token: null, isAuthenticated: false })
  },

  loadUser: async () => {
    try {
      const res = await api.get<User>('/auth/me')
      if (res.data) {
        set({ user: res.data, isAuthenticated: true })
      }
    } catch {
      api.setToken(null)
      set({ user: null, token: null, isAuthenticated: false })
    }
  },

  setUser: (user: User) => set({ user }),
}))
