import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileCheck,
  Lightbulb,
  Mail,
  MapPin,
  PenLine,
  Shield,
  Target,
  XCircle,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import MatchScore from '@/components/ui/MatchScore'
import Spinner from '@/components/ui/Spinner'
import { useJob, useSaveJob } from '@/hooks/useJobs'
import { useCreateApplication } from '@/hooks/useApplications'
import { useResumes } from '@/hooks/useResume'
import { copilotService, type ApplicationEmailResponse, type AtsReviewResponse } from '@/services/copilot.service'
import { cn } from '@/lib/utils'
import type { Match, RecommendedJob } from '@/lib/types'

function extractSingleMatch(payload?: { matches?: Match[]; recommended_jobs?: RecommendedJob[] }) {
  if (payload?.matches?.length) {
    return payload.matches[0]
  }

  if (payload?.recommended_jobs?.length) {
    const job = payload.recommended_jobs[0]
    return {
      job_id: job.id,
      score: job.match_score ?? 0,
      explanation_ar: job.explanation_ar ?? '',
      matched_skills: job.matched_skills,
      missing_skills: job.missing_skills,
    }
  }

  return null
}

export default function JobDetailPage() {
  const { id = '' } = useParams()
  const jobQuery = useJob(id)
  const resumesQuery = useResumes()
  const saveJob = useSaveJob()
  const createApplication = useCreateApplication()

  const [selectedResumeId, setSelectedResumeId] = useState('')
  const [match, setMatch] = useState<ReturnType<typeof extractSingleMatch>>(null)
  const [matchLoading, setMatchLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [appEmail, setAppEmail] = useState<ApplicationEmailResponse | null>(null)
  const [atsLoading, setAtsLoading] = useState(false)
  const [atsError, setAtsError] = useState('')
  const [atsReview, setAtsReview] = useState<AtsReviewResponse | null>(null)
  const [atsExpanded, setAtsExpanded] = useState<Record<string, boolean>>({})

  const job = jobQuery.data?.data
  const resumes = resumesQuery.data?.data ?? []

  useEffect(() => {
    if (!selectedResumeId && resumes.length > 0) {
      setSelectedResumeId(resumes[0].id)
    }
  }, [resumes, selectedResumeId])

  const handleMatch = async () => {
    if (!id) return
    setMatchLoading(true)
    try {
      const response = await copilotService.matchJob(id, selectedResumeId || undefined)
      setMatch(extractSingleMatch(response.data))
    } finally {
      setMatchLoading(false)
    }
  }

  const handleGenerateEmail = async () => {
    if (!id) return
    setEmailLoading(true)
    setEmailError('')
    try {
      const response = await copilotService.generateApplicationEmail(
        id,
        selectedResumeId || undefined,
        'ar',
      )
      setAppEmail(response.data ?? null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذر توليد الرسالة'
      setEmailError(message)
    } finally {
      setEmailLoading(false)
    }
  }

  const handleAtsReview = async () => {
    if (!id) return
    setAtsLoading(true)
    setAtsError('')
    try {
      const response = await copilotService.atsReview({
        jobId: id,
        resumeId: selectedResumeId || undefined,
        language: 'ar',
      })
      setAtsReview(response.data ?? null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذر إجراء فحص ATS'
      setAtsError(message)
    } finally {
      setAtsLoading(false)
    }
  }

  const toggleAtsSection = (key: string) => {
    setAtsExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const copyText = (text: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => undefined)
    }
  }

  if (jobQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="lg" className="text-[#0EA5A4]" />
      </div>
    )
  }

  if (!job) {
    return <p className="text-sm text-[#64748B]">تعذر العثور على الوظيفة المطلوبة.</p>
  }

  return (
    <div className="space-y-6" dir="rtl">
      <Link className="text-sm font-medium text-[#0EA5A4]" to="/jobs">
        العودة إلى الوظائف
      </Link>

      <Card className="border border-[#E2E8F0]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[#0F172A]">{job.title}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[#64748B]">
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-4 w-4" />
                {job.company ?? 'شركة غير محددة'}
              </span>
              {job.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {job.location}
                </span>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {job.employment_type && <Badge variant="neutral">{job.employment_type}</Badge>}
              {job.salary_text && <Badge variant="default">{job.salary_text}</Badge>}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => saveJob.mutate(job.id)} loading={saveJob.isPending}>
              حفظ الوظيفة
            </Button>
            {job.apply_url ? (
              <a
                href={job.apply_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => createApplication.mutate({ jobId: job.id, status: 'applied' })}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#0EA5A4] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0F766E]"
              >
                <ExternalLink className="h-4 w-4" />
                تقدم الآن
              </a>
            ) : (
              <Button onClick={() => createApplication.mutate({ jobId: job.id })} loading={createApplication.isPending}>
                إنشاء طلب
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.3fr,0.9fr]">
        <Card className="border border-[#E2E8F0]">
          <h2 className="mb-4 text-xl font-semibold text-[#0F172A]">وصف الوظيفة</h2>
          <p className="whitespace-pre-line text-sm leading-7 text-[#475569]">
            {job.description ?? 'لا يوجد وصف متاح حالياً.'}
          </p>
        </Card>

        <Card className="space-y-4 border border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-[#0F172A]">تطابق الوظيفة</h2>
          </div>

          {resumes.length > 0 ? (
            <select
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A]"
              value={selectedResumeId}
              onChange={(event) => setSelectedResumeId(event.target.value)}
            >
              {resumes.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.file_name ?? 'سيرة ذاتية'}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-[#64748B]">ارفع سيرة ذاتية أولاً لحساب التطابق.</p>
          )}

          <Button
            className="w-full"
            variant="secondary"
            disabled={resumes.length === 0}
            onClick={handleMatch}
            loading={matchLoading}
          >
            حساب التطابق
          </Button>

          {match && (
            <div className="space-y-3 rounded-2xl bg-[#F8FAFC] p-4">
              <MatchScore score={match.score} />
              {match.explanation_ar && (
                <p className="text-sm leading-6 text-[#475569]">{match.explanation_ar}</p>
              )}
              {!!match.matched_skills?.length && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-[#0F172A]">مهارات متطابقة</p>
                  <div className="flex flex-wrap gap-2">
                    {match.matched_skills.map((skill) => (
                      <Badge key={skill} variant="success">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {!!match.missing_skills?.length && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-[#0F172A]">مهارات ناقصة</p>
                  <div className="flex flex-wrap gap-2">
                    {match.missing_skills.map((skill) => (
                      <Badge key={skill} variant="warning">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-[#E2E8F0] pt-4">
            <div className="mb-3 flex items-center gap-2">
              <Mail className="h-5 w-5 text-[#0EA5A4]" />
              <h3 className="text-base font-semibold text-[#0F172A]">رسالة طلب توظيف</h3>
            </div>
            <Button
              className="w-full"
              variant="secondary"
              onClick={handleGenerateEmail}
              loading={emailLoading}
            >
              توليد رسالة تقدّم
            </Button>
            {emailError && (
              <p className="mt-2 text-xs text-[#DC2626]">{emailError}</p>
            )}
            {appEmail && (
              <div className="mt-3 space-y-3 rounded-2xl bg-[#F8FAFC] p-4">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[#0F172A]">العنوان</p>
                    <button
                      type="button"
                      onClick={() => copyText(appEmail.subject)}
                      className="inline-flex items-center gap-1 text-xs text-[#0EA5A4] hover:text-[#0F766E]"
                    >
                      <Copy className="h-3 w-3" />
                      نسخ
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-[#0F172A]">{appEmail.subject}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[#0F172A]">النص</p>
                    <button
                      type="button"
                      onClick={() => copyText(appEmail.body)}
                      className="inline-flex items-center gap-1 text-xs text-[#0EA5A4] hover:text-[#0F766E]"
                    >
                      <Copy className="h-3 w-3" />
                      نسخ
                    </button>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#475569]">
                    {appEmail.body}
                  </p>
                </div>
                {!appEmail.llm && (
                  <p className="text-[10px] text-[#94A3B8]">
                    تم التوليد بقالب احتياطي (LLM غير متاح حالياً).
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ─── ATS Review Section ─── */}
      <Card className="border border-[#E2E8F0]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#0F172A]">فحص توافق ATS</h2>
              <p className="text-xs text-[#64748B]">تحليل احترافي لسيرتك مقارنةً بوصف الوظيفة</p>
            </div>
          </div>
          <Button
            onClick={handleAtsReview}
            loading={atsLoading}
            disabled={resumes.length === 0}
          >
            <Shield className="h-4 w-4" />
            {atsReview ? 'إعادة الفحص' : 'ابدأ الفحص'}
          </Button>
        </div>

        {atsError && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {atsError}
          </div>
        )}

        <AnimatePresence>
        {atsReview && (
          <motion.div
            className="mt-6 space-y-6"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          >
            {/* ── Score Hero ── */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="flex flex-col items-center gap-6 rounded-3xl bg-gradient-to-br from-slate-50 via-white to-teal-50 p-8 ring-1 ring-[#E2E8F0] lg:flex-row lg:justify-between"
            >
              <div className="flex items-center gap-6">
                <div className="relative h-28 w-28">
                  <svg className="h-28 w-28 -rotate-90" viewBox="0 0 128 128">
                    <circle cx="64" cy="64" r="54" fill="none" stroke="#E2E8F0" strokeWidth="10" />
                    <circle
                      cx="64" cy="64" r="54"
                      fill="none"
                      stroke={
                        atsReview.score >= 75 ? '#10B981'
                          : atsReview.score >= 50 ? '#F59E0B'
                            : '#EF4444'
                      }
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${(atsReview.score / 100) * 339} 339`}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black text-[#0F172A]">{atsReview.score}</span>
                    <span className="text-[10px] font-medium text-[#94A3B8]">من 100</span>
                  </div>
                </div>
                <div>
                  <p className={cn(
                    'text-lg font-bold',
                    atsReview.verdict === 'yes' ? 'text-emerald-600'
                      : atsReview.verdict === 'maybe' ? 'text-amber-600'
                        : 'text-red-600',
                  )}>
                    {atsReview.verdict === 'yes' ? 'جاهز للتقديم ✓' : atsReview.verdict === 'maybe' ? 'يحتاج تحسينات' : 'غير مؤهل بعد'}
                  </p>
                  <p className="mt-1 text-sm text-[#64748B]">
                    {atsReview.verdict === 'yes'
                      ? 'سيرتك متوافقة بشكل ممتاز مع هذه الوظيفة.'
                      : atsReview.verdict === 'maybe'
                        ? 'بتعديلات بسيطة يمكن تحسين فرصتك بشكل كبير.'
                        : 'يُنصح بإجراء تحسينات جوهرية قبل التقديم.'}
                  </p>
                  {!atsReview.llm && (
                    <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
                      <AlertTriangle className="h-3 w-3" />
                      تحليل تقريبي (LLM غير متاح)
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-6 text-center">
                <div className="rounded-2xl bg-emerald-50 px-5 py-3 ring-1 ring-emerald-200">
                  <p className="text-2xl font-bold text-emerald-600">{atsReview.keywords.present.length}</p>
                  <p className="text-[10px] font-medium text-emerald-700">كلمات موجودة</p>
                </div>
                <div className="rounded-2xl bg-red-50 px-5 py-3 ring-1 ring-red-200">
                  <p className="text-2xl font-bold text-red-500">{atsReview.keywords.missing.length}</p>
                  <p className="text-[10px] font-medium text-red-700">كلمات مفقودة</p>
                </div>
                <div className="rounded-2xl bg-amber-50 px-5 py-3 ring-1 ring-amber-200">
                  <p className="text-2xl font-bold text-amber-500">{atsReview.keywords.weak.length}</p>
                  <p className="text-[10px] font-medium text-amber-700">كلمات ضعيفة</p>
                </div>
              </div>
            </motion.div>

            {/* ── Top Fixes Banner ── */}
            {atsReview.top_fixes.length > 0 && (
              <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.35, ease: 'easeOut' }} className="rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50 to-white p-5">
                <p className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-800">
                  <Lightbulb className="h-4 w-4" />
                  أهم {atsReview.top_fixes.length} إصلاحات
                </p>
                <div className="space-y-2">
                  {atsReview.top_fixes.map((fix, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800">{i + 1}</span>
                      <p className="text-sm text-[#334155]">{fix}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Keywords ── */}
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.35, ease: 'easeOut' }} className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
              <button onClick={() => toggleAtsSection('keywords')} className="flex w-full items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                  <Target className="h-4 w-4 text-[#0EA5A4]" />
                  الكلمات المفتاحية
                </p>
                {atsExpanded.keywords ? <ChevronUp className="h-4 w-4 text-[#94A3B8]" /> : <ChevronDown className="h-4 w-4 text-[#94A3B8]" />}
              </button>
              {(atsExpanded.keywords ?? true) && (
                <div className="mt-4 space-y-3">
                  {atsReview.keywords.present.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold text-emerald-700">موجودة في سيرتك</p>
                      <div className="flex flex-wrap gap-1.5">
                        {atsReview.keywords.present.map((kw) => (
                          <span key={kw} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {atsReview.keywords.missing.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold text-red-700">مفقودة — أضفها</p>
                      <div className="flex flex-wrap gap-1.5">
                        {atsReview.keywords.missing.map((kw) => (
                          <span key={kw} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">
                            <XCircle className="h-3 w-3" />
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {atsReview.keywords.weak.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold text-amber-700">ضعيفة — عزّز ذكرها</p>
                      <div className="flex flex-wrap gap-1.5">
                        {atsReview.keywords.weak.map((kw) => (
                          <span key={kw} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                            <AlertTriangle className="h-3 w-3" />
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>

            {/* ── Section Feedback ── */}
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.35, ease: 'easeOut' }} className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
              <button onClick={() => toggleAtsSection('sections')} className="flex w-full items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                  <FileCheck className="h-4 w-4 text-[#0EA5A4]" />
                  تقييم الأقسام
                </p>
                {atsExpanded.sections ? <ChevronUp className="h-4 w-4 text-[#94A3B8]" /> : <ChevronDown className="h-4 w-4 text-[#94A3B8]" />}
              </button>
              {(atsExpanded.sections ?? true) && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {([
                    { key: 'header', label: 'المعلومات الأساسية', icon: '👤' },
                    { key: 'summary', label: 'الملخص المهني', icon: '📝' },
                    { key: 'experience', label: 'الخبرات', icon: '💼' },
                    { key: 'skills', label: 'المهارات', icon: '🛠' },
                    { key: 'education', label: 'التعليم', icon: '🎓' },
                  ] as const).map((section) => (
                    <div key={section.key} className="rounded-xl border border-[#F1F5F9] bg-[#F8FAFC] p-4">
                      <p className="mb-2 text-xs font-bold text-[#0F172A]">
                        <span className="ml-1.5">{section.icon}</span>
                        {section.label}
                      </p>
                      <p className="text-xs leading-5 text-[#475569]">
                        {atsReview.sections[section.key]}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* ── Issues ── */}
            {atsReview.issues.length > 0 && (
              <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.35, ease: 'easeOut' }} className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
                <button onClick={() => toggleAtsSection('issues')} className="flex w-full items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    المشاكل المكتشفة
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{atsReview.issues.length}</span>
                  </p>
                  {atsExpanded.issues ? <ChevronUp className="h-4 w-4 text-[#94A3B8]" /> : <ChevronDown className="h-4 w-4 text-[#94A3B8]" />}
                </button>
                {(atsExpanded.issues ?? true) && (
                  <div className="mt-4 space-y-2">
                    {atsReview.issues.map((issue, i) => (
                      <div key={i} className="flex items-start gap-2.5 rounded-xl bg-amber-50/60 p-3 ring-1 ring-amber-100">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <p className="text-xs leading-5 text-[#334155]">{issue}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Rewrites ── */}
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.35, ease: 'easeOut' }} className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
              <button onClick={() => toggleAtsSection('rewrites')} className="flex w-full items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                  <PenLine className="h-4 w-4 text-[#0EA5A4]" />
                  إعادة صياغة مقترحة
                </p>
                {atsExpanded.rewrites ? <ChevronUp className="h-4 w-4 text-[#94A3B8]" /> : <ChevronDown className="h-4 w-4 text-[#94A3B8]" />}
              </button>
              {(atsExpanded.rewrites ?? true) && (
                <div className="mt-4 space-y-4">
                  {atsReview.rewrites.bullets.map((bullet, i) => (
                    <div key={i} className="rounded-xl border border-[#F1F5F9] bg-[#F8FAFC] p-4">
                      <div className="grid gap-3 md:grid-cols-[1fr,auto,1fr]">
                        <div>
                          <p className="mb-1.5 text-[10px] font-bold text-red-500">قبل</p>
                          <p className="text-xs leading-5 text-[#475569] line-through decoration-red-300">{bullet.before}</p>
                        </div>
                        <div className="hidden items-center md:flex">
                          <ArrowRight className="h-4 w-4 text-[#0EA5A4]" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between">
                            <p className="mb-1.5 text-[10px] font-bold text-emerald-600">بعد</p>
                            <button
                              type="button"
                              onClick={() => copyText(bullet.after)}
                              className="inline-flex items-center gap-1 text-[10px] text-[#0EA5A4] hover:text-[#0F766E]"
                            >
                              <Copy className="h-3 w-3" />
                              نسخ
                            </button>
                          </div>
                          <p className="text-xs font-medium leading-5 text-[#0F172A]">{bullet.after}</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {atsReview.rewrites.summary && (
                    <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-[#0F766E]">ملخص مهني مُحسّن</p>
                        <button
                          type="button"
                          onClick={() => copyText(atsReview.rewrites.summary)}
                          className="inline-flex items-center gap-1 text-[10px] text-[#0EA5A4] hover:text-[#0F766E]"
                        >
                          <Copy className="h-3 w-3" />
                          نسخ
                        </button>
                      </div>
                      <p className="mt-2 text-xs leading-6 text-[#334155]">{atsReview.rewrites.summary}</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>

            {/* ── Tips ── */}
            {atsReview.tips.length > 0 && (
              <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.35, ease: 'easeOut' }} className="rounded-2xl border border-[#E2E8F0] bg-white p-5">
                <button onClick={() => toggleAtsSection('tips')} className="flex w-full items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-bold text-[#0F172A]">
                    نصائح ATS احترافية
                  </p>
                  {atsExpanded.tips ? <ChevronUp className="h-4 w-4 text-[#94A3B8]" /> : <ChevronDown className="h-4 w-4 text-[#94A3B8]" />}
                </button>
                {(atsExpanded.tips ?? true) && (
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {atsReview.tips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-2.5 rounded-xl bg-teal-50/50 p-3 ring-1 ring-teal-100">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0EA5A4]" />
                        <p className="text-xs leading-5 text-[#334155]">{tip}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
        </AnimatePresence>
      </Card>
    </div>
  )
}
