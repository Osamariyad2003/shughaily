import { api } from '@/lib/api'
import type { User } from '@/lib/types'

export const authService = {
  login: (email: string, password: string) =>
    api.post<{ user: User; token: string }>('/auth/login', { email, password }),

  register: (name: string, email: string, password: string) =>
    api.post<{ user: User; token: string }>('/auth/register', { name, email, password }),

  getMe: () => api.get<User>('/auth/me'),
}
