import { api } from '@/lib/api'
import type { Application } from '@/lib/types'

export const applicationsService = {
  getApplications: (status?: string) => {
    const params = status && status !== 'all' ? `?status=${status}` : ''
    return api.get<Application[]>(`/applications${params}`)
  },

  createApplication: (jobId: string, status = 'applied') =>
    api.post<Application>('/applications', { job_id: jobId, status }),

  updateApplication: (id: string, data: { status?: string; notes?: string }) =>
    api.put<Application>(`/applications/${id}`, data),

  deleteApplication: (id: string) => api.delete(`/applications/${id}`),
}
