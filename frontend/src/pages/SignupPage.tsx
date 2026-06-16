import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Lock, Mail, User } from 'lucide-react'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { useAuthStore } from '@/store/authStore'

export default function SignupPage() {
  const navigate = useNavigate()
  const register = useAuthStore((state) => state.register)
  const isLoading = useAuthStore((state) => state.isLoading)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.')
      return
    }

    try {
      await register(name, email, password)
      navigate('/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء الحساب حالياً.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 py-8" dir="rtl">
      <Card className="w-full max-w-md border border-[#E2E8F0]">
        <div className="mb-6 text-center">
          <p className="text-sm font-medium text-[#0EA5A4]">الشغيلي</p>
          <h1 className="mt-2 text-2xl font-bold text-[#0F172A]">إنشاء حساب</h1>
          <p className="mt-2 text-sm text-[#64748B]">
            ابدأ إعداد مساعدك الذكي للتوظيف خلال دقائق.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <Input
            label="الاسم"
            value={name}
            onChange={(event) => setName(event.target.value)}
            icon={<User className="h-4 w-4" />}
            placeholder="اسمك الكامل"
          />
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
            placeholder="8 أحرف أو أكثر"
          />
          <Input
            label="تأكيد كلمة المرور"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            icon={<Lock className="h-4 w-4" />}
            placeholder="أعد إدخال كلمة المرور"
          />

          {error && <p className="text-sm text-[#EF4444]">{error}</p>}

          <Button className="w-full" type="submit" loading={isLoading}>
            إنشاء الحساب
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-[#64748B]">
          لديك حساب بالفعل؟{' '}
          <Link className="font-medium text-[#0EA5A4]" to="/login">
            تسجيل الدخول
          </Link>
        </p>
      </Card>
    </div>
  )
}
