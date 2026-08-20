import { api } from '@/lib/api'
import type {
  CandidateProfileSummary,
  RecommendedJob,
  SearchAgent,
  SearchAgentInput,
} from '@/lib/types'

export interface RunSearchAgentResponse {
  agent: SearchAgent
  jobs: RecommendedJob[]
  new_jobs_count: number
  avg_match_score: number
}

export const searchAgentsService = {
  getAgents: () => api.get<SearchAgent[]>('/search-agents'),

  createAgent: (payload: SearchAgentInput) => api.post<SearchAgent>('/search-agents', payload),

  updateAgent: (id: string, payload: Partial<SearchAgentInput>) =>
    api.patch<SearchAgent>(`/search-agents/${id}`, payload),

  deleteAgent: (id: string) => api.delete(`/search-agents/${id}`),

  getCandidateProfile: () => api.get<CandidateProfileSummary>('/search-agents/candidate-profile'),

  runAgent: (id: string) => api.post<RunSearchAgentResponse>(`/search-agents/${id}/run`),
}
