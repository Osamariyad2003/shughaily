import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Lock, Mail } from 'lucide-react'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { useAuthStore } from '@/store/authStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const isLoading = useAuthStore((state) => state.isLoading)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول حالياً.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--rushd-surface-alt)] px-4" dir="rtl">
      <Card className="w-full max-w-md border border-[#E2E8F0]">
        <div className="mb-6 text-center">
          <p className="text-sm font-medium text-[#0EA5A4]">الشغيلي</p>
          <h1 className="mt-2 text-2xl font-bold text-[#0F172A]">تسجيل الدخول</h1>
          <p className="mt-2 text-sm text-[#64748B]">
            ادخل إلى حسابك لمتابعة السير الذاتية والوظائف والتوصيات.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
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
            placeholder="********"
          />

          {error && <p className="text-sm text-[#EF4444]">{error}</p>}

          <Button className="w-full" type="submit" loading={isLoading}>
            تسجيل الدخول
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-[#64748B]">
          ليس لديك حساب؟{' '}
          <Link className="font-medium text-[#0EA5A4]" to="/signup">
            أنشئ حساباً جديداً
          </Link>
        </p>
      </Card>
    </div>
  )
}
