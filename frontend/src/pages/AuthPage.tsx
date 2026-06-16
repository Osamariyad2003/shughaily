import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { BriefcaseBusiness, FileText, Lock, Mail, Sparkles, User as UserIcon } from 'lucide-react'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { useAuthStore } from '@/store/authStore'

type AuthMode = 'login' | 'signup'

const highlights = [
  {
    icon: Sparkles,
    title: 'توصيات وظائف ذكية',
    description: 'احصل على فرص مناسبة لسيرتك الذاتية وتفضيلاتك المهنية.',
  },
  {
    icon: FileText,
    title: 'تحسين السيرة الذاتية',
    description: 'حلل سيرتك الذاتية بالعربية واقترح تحسينات عملية وسريعة.',
  },
  {
    icon: BriefcaseBusiness,
    title: 'متابعة التقديمات',
    description: 'احفظ الوظائف وتابع كل مرحلة من التقديم من لوحة واحدة.',
  },
]

function getMode(value: string | null): AuthMode {
  return value === 'signup' ? 'signup' : 'login'
}

export default function AuthPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const login = useAuthStore((state) => state.login)
  const register = useAuthStore((state) => state.register)
  const isLoading = useAuthStore((state) => state.isLoading)

  const mode = getMode(searchParams.get('mode'))

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(
    searchParams.get('error') === 'google_failed' ? 'تعذر تسجيل الدخول عبر Google. يرجى المحاولة مرة أخرى.' : ''
  )

  const setMode = (nextMode: AuthMode) => {
    setError('')
    setSearchParams(nextMode === 'signup' ? { mode: 'signup' } : {})
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (mode === 'signup') {
      if (!name.trim()) {
        setError('يرجى إدخال الاسم الكامل.')
        return
      }

      if (password !== confirmPassword) {
        setError('كلمتا المرور غير متطابقتين.')
        return
      }
    }

    try {
      if (mode === 'login') {
        await login(email, password)
        navigate('/dashboard')
        return
      }

      await register(name.trim(), email, password)
      navigate('/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إكمال العملية حالياً.')
    }
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.12),_transparent_28%),linear-gradient(180deg,_#F8FAFC_0%,_#ECFEFF_100%)]"
    >
      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-10 px-4 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-10">
        <section className="relative overflow-hidden rounded-[2rem] bg-[#0F766E] px-6 py-8 text-white shadow-xl shadow-teal-900/15 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_32%),radial-gradient(circle_at_bottom_left,_rgba(153,246,228,0.22),_transparent_30%)]" />

          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between">
              <Link to="/" className="inline-flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                  <Sparkles className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-lg font-bold">الشغيلي</span>
                  <span className="block text-sm text-white/70">مساعدك الذكي للوظائف</span>
                </span>
              </Link>
            </div>

            <div className="mt-12 max-w-2xl lg:mt-16">
              <p className="inline-flex rounded-full bg-white/12 px-4 py-1.5 text-sm text-white/85 ring-1 ring-white/15">
                منصة عربية للبحث الذكي عن العمل
              </p>
              <h1 className="mt-6 text-4xl font-bold leading-tight sm:text-5xl">
                انطلق في رحلة التوظيف
                <span className="block text-[#99F6E4]">بخطوات أسرع وقرارات أوضح</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-8 text-white/80 sm:text-lg">
                ارفع سيرتك الذاتية مرة واحدة، واحصل على توصيات وظائف، وتحسينات للسيرة،
                ورسائل تغطية، وتحضير للمقابلات من مكان واحد.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3 lg:mt-auto">
              {highlights.map((item, index) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: index * 0.08 }}
                  className="rounded-3xl bg-white/10 p-5 backdrop-blur-sm ring-1 ring-white/10"
                >
                  <item.icon className="mb-3 h-5 w-5 text-[#99F6E4]" />
                  <h2 className="text-base font-semibold">{item.title}</h2>
                  <p className="mt-2 text-sm leading-7 text-white/75">{item.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="w-full max-w-xl"
          >
            <Card className="rounded-[2rem] border border-white/60 bg-white/90 p-6 shadow-xl shadow-slate-200/60 backdrop-blur sm:p-8">
              <div className="text-center">
                <p className="text-sm font-medium text-[#0EA5A4]">مرحباً بك في الشغيلي</p>
                <h2 className="mt-2 text-3xl font-bold text-[#0F172A]">
                  {mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
                </h2>
                <p className="mt-3 text-sm leading-7 text-[#64748B]">
                  {mode === 'login'
                    ? 'ادخل إلى حسابك لمتابعة الوظائف المناسبة والتقديمات والسيرة الذاتية.'
                    : 'أنشئ حسابك وابدأ إعداد مساعدك الذكي للتوظيف خلال دقائق.'}
                </p>
              </div>

              <div className="mt-8 grid grid-cols-2 rounded-2xl bg-[#F1F5F9] p-1">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className={`rounded-[1rem] px-4 py-3 text-sm font-semibold transition-colors ${
                    mode === 'login'
                      ? 'bg-white text-[#0F172A] shadow-sm'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  تسجيل الدخول
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={`rounded-[1rem] px-4 py-3 text-sm font-semibold transition-colors ${
                    mode === 'signup'
                      ? 'bg-white text-[#0F172A] shadow-sm'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  إنشاء حساب
                </button>
              </div>

              <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                <AnimatePresence initial={false}>
                  {mode === 'signup' && (
                    <motion.div
                      key="name-field"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Input
                        label="الاسم الكامل"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        icon={<UserIcon className="h-4 w-4" />}
                        placeholder="اكتب اسمك الكامل"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <Input
                  label="البريد الإلكتروني"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  icon={<Mail className="h-4 w-4" />}
                  placeholder="name@example.com"
                />

                <Input
                  label="كلمة المرور"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  icon={<Lock className="h-4 w-4" />}
                  placeholder="أدخل كلمة المرور"
                />

                <AnimatePresence initial={false}>
                  {mode === 'signup' && (
                    <motion.div
                      key="confirm-password-field"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Input
                        label="تأكيد كلمة المرور"
                        type="password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        icon={<Lock className="h-4 w-4" />}
                        placeholder="أعد إدخال كلمة المرور"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <Button className="mt-2 w-full rounded-2xl py-3 text-base" type="submit" loading={isLoading}>
                  {mode === 'login' ? 'متابعة إلى لوحة التحكم' : 'إنشاء الحساب والبدء'}
                </Button>
              </form>

              <div className="mt-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#E2E8F0]" />
                <span className="text-sm text-[#94A3B8]">أو</span>
                <div className="h-px flex-1 bg-[#E2E8F0]" />
              </div>

              <button
                type="button"
                onClick={() => {
                  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
                  if (!clientId) {
                    setError('Google OAuth غير مُعدّ بعد.')
                    return
                  }
                  const params = new URLSearchParams({
                    client_id: clientId,
                    redirect_uri: `${window.location.origin}/auth/google/callback`,
                    response_type: 'code',
                    scope: 'openid email profile',
                    access_type: 'offline',
                    prompt: 'consent',
                  })
                  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
                }}
                className="mt-4 flex w-full items-center justify-center gap-3 rounded-2xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm font-semibold text-[#334155] shadow-sm transition-colors hover:bg-[#F8FAFC]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                {mode === 'login' ? 'تسجيل الدخول عبر Google' : 'إنشاء حساب عبر Google'}
              </button>

              <div className="mt-6 text-center text-sm text-[#64748B]">
                {mode === 'login' ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}{' '}
                <button
                  type="button"
                  onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                  className="font-semibold text-[#0EA5A4] transition-colors hover:text-[#0F766E]"
                >
                  {mode === 'login' ? 'أنشئ حساباً جديداً' : 'تسجيل الدخول'}
                </button>
              </div>
            </Card>
          </motion.div>
        </section>
      </div>
    </div>
  )
}
