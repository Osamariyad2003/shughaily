import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import Spinner from '@/components/ui/Spinner'

export default function GoogleCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const googleLogin = useAuthStore((state) => state.googleLogin)
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    const code = searchParams.get('code')
    const error = searchParams.get('error')

    if (error || !code) {
      navigate('/auth?error=google_failed')
      return
    }

    googleLogin(code)
      .then(({ isNewUser }) => {
        navigate(isNewUser ? '/onboarding' : '/dashboard')
      })
      .catch(() => {
        navigate('/auth?error=google_failed')
      })
  }, [searchParams, googleLogin, navigate])

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
      <div className="text-center">
        <Spinner className="mx-auto h-8 w-8" />
        <p className="mt-4 text-sm text-[#64748B]">جاري تسجيل الدخول عبر Google...</p>
      </div>
    </div>
  )
}
