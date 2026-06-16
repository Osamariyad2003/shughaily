import { api } from '@/lib/api'
import type { DashboardStats } from '@/lib/types'

export const dashboardService = {
  getStats: () => api.get<DashboardStats>('/dashboard/stats'),

  getRecentActivity: () =>
    api.get<Array<{ type: string; title: string; timestamp: string }>>('/dashboard/recent-activity'),
}
