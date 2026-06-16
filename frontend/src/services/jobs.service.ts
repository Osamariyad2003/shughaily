import { api } from '@/lib/api'
import type { Job, RecommendedJobsResponse } from '@/lib/types'

interface JobsQuery {
  page?: number
  limit?: number
  search?: string
  work_type?: string
  location?: string
}

export const jobsService = {
  getJobs: (query: JobsQuery = {}) => {
    const params = new URLSearchParams()
    if (query.page) params.set('page', String(query.page))
    if (query.limit) params.set('limit', String(query.limit))
    if (query.search) params.set('search', query.search)
    if (query.work_type) params.set('work_type', query.work_type)
    if (query.location) params.set('location', query.location)
    return api.get<Job[]>(`/jobs?${params.toString()}`)
  },

  getJob: (id: string) => api.get<Job>(`/jobs/${id}`),

  getRecommended: () => api.get<RecommendedJobsResponse>('/jobs/recommended'),

  saveJob: (jobId: string) => api.post('/jobs/saved', { job_id: jobId }),

  unsaveJob: (jobId: string) => api.delete(`/jobs/saved/${jobId}`),

  getSavedJobs: () => api.get<Job[]>('/jobs/saved'),

  searchExternal: (params: { q: string; location?: string; page?: number; remote?: boolean; employment_type?: string }) => {
    const qs = new URLSearchParams()
    qs.set('q', params.q)
    if (params.location) qs.set('location', params.location)
    if (params.page) qs.set('page', String(params.page))
    if (params.remote) qs.set('remote', 'true')
    if (params.employment_type) qs.set('employment_type', params.employment_type)
    return api.get<Job[]>(`/jobs/search?${qs.toString()}`)
  },
}
