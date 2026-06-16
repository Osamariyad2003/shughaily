import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { resumeService } from '@/services/resume.service'

export function useResumes() {
  return useQuery({
    queryKey: ['resumes'],
    queryFn: () => resumeService.getResumes(),
  })
}

export function useResume(id: string) {
  return useQuery({
    queryKey: ['resume', id],
    queryFn: () => resumeService.getResume(id),
    enabled: !!id,
  })
}

export function useUploadResume() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => resumeService.upload(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] })
    },
  })
}

export function useParseResume() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => resumeService.parseResume(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] })
    },
  })
}

export function useDeleteResume() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => resumeService.deleteResume(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] })
    },
  })
}

export function useUpdateSkills() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, skills }: { id: string; skills: string[] }) =>
      resumeService.updateSkills(id, skills),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] })
      queryClient.invalidateQueries({ queryKey: ['candidate-profile-summary'] })
    },
  })
}
