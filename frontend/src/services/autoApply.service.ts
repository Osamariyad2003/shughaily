import { api } from '@/lib/api'
import type { AutoApplySettings, AutoApplySettingsInput } from '@/lib/types'

export const autoApplyService = {
  getSettings: () => api.get<AutoApplySettings>('/auto-apply/settings'),

  updateSettings: (payload: AutoApplySettingsInput) =>
    api.patch<AutoApplySettings>('/auto-apply/settings', payload),
}
