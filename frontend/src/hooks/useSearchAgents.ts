import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SearchAgentInput } from '@/lib/types'
import { searchAgentsService } from '@/services/searchAgents.service'

export function useSearchAgents() {
  return useQuery({
    queryKey: ['search-agents'],
    queryFn: () => searchAgentsService.getAgents(),
  })
}

export function useCandidateProfileSummary() {
  return useQuery({
    queryKey: ['candidate-profile-summary'],
    queryFn: () => searchAgentsService.getCandidateProfile(),
  })
}

export function useSearchAgentQueryPlan(id: string) {
  return useQuery({
    queryKey: ['search-agent-query-plan', id],
    queryFn: () => searchAgentsService.getQueryPlan(id),
    enabled: !!id,
  })
}

export function useCreateSearchAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: SearchAgentInput) => searchAgentsService.createAgent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search-agents'] })
    },
  })
}

export function useUpdateSearchAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<SearchAgentInput> }) =>
      searchAgentsService.updateAgent(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search-agents'] })
    },
  })
}

export function useDeleteSearchAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => searchAgentsService.deleteAgent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search-agents'] })
    },
  })
}

export function useRunSearchAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => searchAgentsService.runAgent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['search-agents'] })
    },
  })
}
