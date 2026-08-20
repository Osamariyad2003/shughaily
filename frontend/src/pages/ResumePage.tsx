import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertTriangle, XCircle, FileUp, Shield, Trash2, TrendingUp, TrendingDown, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import { useDeleteResume, useParseResume, useResumes, useUploadResume, useUpdateSkills } from '@/hooks/useResume'
import { copilotService } from '@/services/copilot.service'
import { useTranslation } from '@/store/i18nStore'
import type { AtsCheckResponse, CvFeedback } from '@/lib/types'
import { formatDate } from '@/lib/utils'

export default function ResumePage() {
  const { t, dir } = useTranslation()
  const resumesQuery = useResumes()
  const uploadResume = useUploadResume()
  const parseResume = useParseResume()
  const deleteResume = useDeleteResume()
  const updateSkills = useUpdateSkills()

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedResumeId, setSelectedResumeId] = useState('')
  const [feedback, setFeedback] = useState<CvFeedback[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [atsResult, setAtsResult] = useState<AtsCheckResponse | null>(null)
  const [atsLoading, setAtsLoading] = useState(false)
  const [atsError, setAtsError] = useState('')
  const [newSkill, setNewSkill] = useState('')

  const resumes = resumesQuery.data?.data ?? []
  const selectedResume = useMemo(
    () => resumes.find((resume) => resume.id === selectedResumeId) ?? resumes[0],
    [resumes, selectedResumeId],
  )

  const handleUpload = async () => {
    if (!selectedFile) return
    await uploadResume.mutateAsync(selectedFile)
    setSelectedFile(null)
  }

  const handleFeedback = async () => {
    if (!selectedResume) return

    setFeedbackLoading(true)
    try {
      const response = await copilotService.getCvFeedback(selectedResume.id)
      setFeedback(response.data?.suggestions ?? [])
    } finally {
      setFeedbackLoading(false)
    }
  }

  const handleAtsCheck = async () => {
    if (!selectedResume) return

    setAtsLoading(true)
    setAtsError('')
    try {
      // Auto-parse if not already parsed
      if (!selectedResume.parsed_data) {
        await parseResume.mutateAsync(selectedResume.id)
      }
      const response = await copilotService.atsCheck(selectedResume.id)
      setAtsResult(response.data ?? null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('resume.error.atsFailed')
      setAtsError(msg)
      setAtsResult(null)
    } finally {
      setAtsLoading(false)
    }
  }

  if (resumesQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="lg" className="text-[#0EA5A4]" />
      </div>
    )
  }

  return (
    <div className="space-y-6" dir={dir}>
      <div>
        <h1 className="text-3xl font-bold text-[#0F172A]">{t('resume.title')}</h1>
        <p className="mt-2 text-sm text-[#64748B]">
          {t('resume.subtitle')}
        </p>
      </div>

      <Card className="space-y-4 border border-[#E2E8F0]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-[#0F172A]">{t('resume.upload.label')}</label>
            <input
              className="block w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A]"
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <Button onClick={handleUpload} loading={uploadResume.isPending} disabled={!selectedFile}>
            <FileUp className="h-4 w-4" />
            {t('resume.upload.button')}
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
        <Card className="border border-[#E2E8F0]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#0F172A]">{t('resume.list.title')}</h2>
            <span className="text-sm text-[#64748B]">{resumes.length} {t('resume.list.count')}</span>
          </div>

          <div className="space-y-3">
            {resumes.map((resume) => (
              <div
                key={resume.id}
                role="button"
                tabIndex={0}
                className={`w-full cursor-pointer rounded-2xl border p-4 text-right transition-colors ${
                  selectedResume?.id === resume.id
                    ? 'border-[#0EA5A4] bg-[#CCFBF1]/50'
                    : 'border-[#E2E8F0] hover:border-[#0EA5A4]/30'
                }`}
                onClick={() => setSelectedResumeId(resume.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelectedResumeId(resume.id)
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-[#0F172A]">{resume.file_name ?? t('resume.defaultName')}</h3>
                    <p className="mt-1 text-xs text-[#64748B]">{formatDate(resume.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {resume.parsed_data && <Badge variant="success">{t('resume.parsed')}</Badge>}
                    <button
                      className="rounded-lg p-2 text-[#EF4444] hover:bg-red-50"
                      onClick={(event) => {
                        event.stopPropagation()
                        deleteResume.mutate(resume.id)
                      }}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {resumes.length === 0 && (
              <p className="text-sm text-[#64748B]">{t('resume.list.empty')}</p>
            )}
          </div>
        </Card>

        <Card className="space-y-4 border border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-[#0F172A]">{t('resume.analysis.title')}</h2>
          </div>

          {selectedResume ? (
            <>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  onClick={() => parseResume.mutate(selectedResume.id)}
                  loading={parseResume.isPending}
                >
                  {t('resume.analysis.parse')}
                </Button>
                <Button onClick={handleFeedback} loading={feedbackLoading}>
                  {t('resume.analysis.feedback')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleAtsCheck}
                  loading={atsLoading}
                >
                  <Shield className="h-4 w-4" />
                  {t('resume.analysis.atsCheck')}
                </Button>
              </div>

              {atsError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {atsError}
                </div>
              )}

              {selectedResume.parsed_data?.summary && (
                <div className="rounded-2xl bg-[var(--rushd-surface-alt)] p-4">
                  <p className="text-xs font-semibold text-[#0F172A]">{t('resume.summary')}</p>
                  <p className="mt-2 text-sm leading-6 text-[#475569]">
                    {selectedResume.parsed_data.summary}
                  </p>
                </div>
              )}

              {/* ── Skills Editor ── */}
              {(() => {
                const skills = Array.from(new Set(selectedResume.parsed_data?.skills ?? []))
                const addSkill = () => {
                  const trimmed = newSkill.trim()
                  if (!trimmed || skills.includes(trimmed)) { setNewSkill(''); return }
                  updateSkills.mutate({ id: selectedResume.id, skills: [...skills, trimmed] })
                  setNewSkill('')
                }
                const removeSkill = (skill: string) => {
                  updateSkills.mutate({ id: selectedResume.id, skills: skills.filter(s => s !== skill) })
                }
                return (
                  <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-bold text-[#0F172A]">{t('resume.skills.title')}</p>
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-[#0F766E] ring-1 ring-teal-200">
                        {skills.length} {t('resume.skills.count')}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <AnimatePresence mode="popLayout">
                        {skills.map((skill) => (
                          <motion.span
                            key={skill}
                            layout
                            initial={{ opacity: 0, scale: 0.7 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.7 }}
                            transition={{ duration: 0.2, ease: 'backOut' }}
                            className="group inline-flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-[#0F766E] ring-1 ring-teal-200 transition hover:bg-red-50 hover:text-red-600 hover:ring-red-200"
                          >
                            {skill}
                            <button
                              type="button"
                              onClick={() => removeSkill(skill)}
                              className="opacity-0 transition group-hover:opacity-100"
                              title={t('resume.skills.remove')}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </motion.span>
                        ))}
                      </AnimatePresence>
                      {skills.length === 0 && (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-[#94A3B8]">{t('resume.skills.empty')}</motion.p>
                      )}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={newSkill}
                        onChange={(e) => setNewSkill(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }}
                        placeholder={t('resume.skills.placeholder')}
                        className="flex-1 rounded-xl border border-[#E2E8F0] bg-[var(--rushd-surface-alt)] px-3 py-2 text-xs text-[#0F172A] outline-none transition focus:border-[#0EA5A4] focus:ring-2 focus:ring-[#0EA5A4]/20"
                      />
                      <button
                        type="button"
                        onClick={addSkill}
                        disabled={!newSkill.trim() || updateSkills.isPending}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#0EA5A4] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#0F766E] disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t('resume.skills.add')}
                      </button>
                    </div>
                  </div>
                )
              })()}

              {feedback.length > 0 && (
                <div className="space-y-3">
                  {feedback.map((item, index) => (
                    <div key={`${item.section}-${index}`} className="rounded-2xl border border-[#E2E8F0] p-4">
                      <p className="text-xs font-semibold text-[#0EA5A4]">{item.section}</p>
                      <p className="mt-2 text-sm leading-6 text-[#475569]">{item.suggestion}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-[#64748B]">{t('resume.empty')}</p>
          )}
        </Card>
      </div>

      {/* ATS Score Results */}
      <AnimatePresence>
      {atsResult && (
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
        <Card className="overflow-hidden border border-[#E2E8F0]">
          {/* Hero Banner */}
          <div className="bg-gradient-to-bl from-slate-900 via-slate-800 to-[#0F766E] px-6 py-8 text-white">
            <div className="flex flex-col items-center gap-6 lg:flex-row lg:justify-between">
              <div className="flex items-center gap-6">
                <div className="relative h-24 w-24">
                  <svg className="h-24 w-24 -rotate-90" viewBox="0 0 128 128">
                    <circle cx="64" cy="64" r="54" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="8" />
                    <circle
                      cx="64" cy="64" r="54"
                      fill="none"
                      stroke={
                        atsResult.verdict_level === 'good' ? '#34D399'
                          : atsResult.verdict_level === 'fair' ? '#FBBF24'
                            : '#F87171'
                      }
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${(atsResult.ats_score / 100) * 339} 339`}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black">{atsResult.ats_score}</span>
                    <span className="text-[10px] text-white/60">ATS</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    <h2 className="text-xl font-bold">{t('resume.ats.title')}</h2>
                  </div>
                  <p className={cn(
                    'mt-2 text-sm font-semibold',
                    atsResult.verdict_level === 'good' ? 'text-emerald-300'
                      : atsResult.verdict_level === 'fair' ? 'text-amber-300'
                        : 'text-red-300',
                  )}>
                    {atsResult.verdict}
                  </p>
                </div>
              </div>

              <div className="flex gap-4 text-center">
                <div className="rounded-2xl bg-white/10 px-5 py-3 backdrop-blur">
                  <div className="flex items-center justify-center gap-1">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    <p className="text-2xl font-bold text-emerald-400">{atsResult.passed_checks}</p>
                  </div>
                  <p className="text-[10px] text-white/70">{t('resume.ats.passed')}</p>
                </div>
                <div className="rounded-2xl bg-white/10 px-5 py-3 backdrop-blur">
                  <div className="flex items-center justify-center gap-1">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <p className="text-2xl font-bold text-amber-400">{atsResult.warning_checks}</p>
                  </div>
                  <p className="text-[10px] text-white/70">{t('resume.ats.warning')}</p>
                </div>
                <div className="rounded-2xl bg-white/10 px-5 py-3 backdrop-blur">
                  <div className="flex items-center justify-center gap-1">
                    <TrendingDown className="h-4 w-4 text-red-400" />
                    <p className="text-2xl font-bold text-red-400">{atsResult.failed_checks}</p>
                  </div>
                  <p className="text-[10px] text-white/70">{t('resume.ats.failed')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Checks Grid */}
          <div className="grid gap-3 p-6 md:grid-cols-2">
            {atsResult.checks.map((check, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex items-start gap-3 rounded-2xl border p-4 transition-shadow hover:shadow-sm',
                  check.status === 'pass'
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : check.status === 'warning'
                      ? 'border-amber-200 bg-amber-50/50'
                      : 'border-red-200 bg-red-50/50',
                )}
              >
                {check.status === 'pass' ? (
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                ) : check.status === 'warning' ? (
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                )}
                <div>
                  <p className="text-sm font-bold text-[#0F172A]">{check.name}</p>
                  <p className="mt-1 text-xs leading-5 text-[#475569]">{check.message}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Keywords */}
          {atsResult.matched_keywords.length > 0 && (
            <div className="border-t border-[#F1F5F9] bg-[var(--rushd-surface-alt)] p-6">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                {t('resume.ats.keywords')}
              </p>
              <div className="flex flex-wrap gap-2">
                {atsResult.matched_keywords.map((kw) => (
                  <span key={kw} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                    <CheckCircle className="h-3 w-3" />
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* AI Tips (OpenRouter) */}
          {atsResult.llm_tips && (
            <div className="border-t border-[#F1F5F9] bg-gradient-to-br from-teal-50/60 to-slate-50 p-6">
              <p className="mb-3 flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-[10px] font-black text-white">AI</span>
                {t('resume.ats.aiTips')}
              </p>
              <p className="whitespace-pre-line text-sm leading-7 text-[#334155]" dir={dir}>
                {atsResult.llm_tips}
              </p>
            </div>
          )}
        </Card>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}
