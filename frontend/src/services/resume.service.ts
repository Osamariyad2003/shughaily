import { api } from '@/lib/api'
import type { Resume, CvFeedbackResponse } from '@/lib/types'

export const resumeService = {
  getResumes: () => api.get<Resume[]>('/resumes'),

  getResume: (id: string) => api.get<Resume>(`/resumes/${id}`),

  upload: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.upload<Resume>('/resumes/upload', formData)
  },

  deleteResume: (id: string) => api.delete(`/resumes/${id}`),

  parseResume: (id: string) => api.post<Resume>(`/resumes/${id}/parse`),

  updateSkills: (id: string, skills: string[]) =>
    api.patch<Resume>(`/resumes/${id}/skills`, { skills }),

  getCvFeedback: (resumeId: string) =>
    api.post<CvFeedbackResponse>('/copilot/cv-feedback', { resume_id: resumeId }),
}
