import { api } from '@/lib/api'
import type { User, UserPreferences } from '@/lib/types'

export const usersService = {
  getProfile: () => api.get<User>('/users/profile'),

  updateProfile: (payload: Partial<Pick<User, 'name' | 'country' | 'city' | 'preferred_language'>>) =>
    api.put<User>('/users/profile', payload),

  getPreferences: () => api.get<UserPreferences>('/users/preferences'),

  updatePreferences: (payload: Partial<UserPreferences>) =>
    api.put<UserPreferences>('/users/preferences', payload),
}
