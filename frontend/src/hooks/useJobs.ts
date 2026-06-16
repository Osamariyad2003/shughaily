import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { jobsService } from '@/services/jobs.service'

export function useJobs(filters?: { search?: string; work_type?: string; location?: string; page?: number }) {
  return useQuery({
    queryKey: ['jobs', filters],
    queryFn: () => jobsService.getJobs(filters),
  })
}

export function useJob(id: string) {
  return useQuery({
    queryKey: ['job', id],
    queryFn: () => jobsService.getJob(id),
    enabled: !!id,
  })
}

export function useRecommendedJobs() {
  return useQuery({
    queryKey: ['recommended-jobs'],
    queryFn: () => jobsService.getRecommended(),
  })
}

export function useSavedJobs() {
  return useQuery({
    queryKey: ['saved-jobs'],
    queryFn: () => jobsService.getSavedJobs(),
  })
}

export function useSaveJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) => jobsService.saveJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-jobs'] })
    },
  })
}

export function useUnsaveJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) => jobsService.unsaveJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-jobs'] })
    },
  })
}
