import { api } from '@/lib/api'
import type {
  ApiKeyMeta,
  CreatedApiKey,
  BillingStatsResponse,
} from '@/lib/types'

export const billingService = {
  listApiKeys: () => api.get<ApiKeyMeta[]>('/keys'),

  createApiKey: (name: string) =>
    api.post<CreatedApiKey>('/keys', { name }),

  revokeApiKey: (id: string) =>
    api.delete<{ message: string }>(`/keys/${id}`),

  getBillingStats: () =>
    api.get<BillingStatsResponse>('/dashboard/billing'),
}
