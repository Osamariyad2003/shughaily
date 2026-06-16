import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { usersService } from '@/services/users.service'

function splitTags(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [targetTitlesInput, setTargetTitlesInput] = useState('')
  const [locationsInput, setLocationsInput] = useState('')
  const [industriesInput, setIndustriesInput] = useState('')
  const [workType, setWorkType] = useState('full_time')
  const [minSalary, setMinSalary] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setError('')
    setIsSaving(true)

    try {
      await usersService.updatePreferences({
        target_titles: splitTags(targetTitlesInput),
        preferred_locations: splitTags(locationsInput),
        industries: splitTags(industriesInput),
        work_type: workType,
        min_salary: minSalary ? Number(minSalary) : undefined,
      })
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ التفضيلات حالياً.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] px-4 py-10" dir="rtl">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="text-center">
          <p className="text-sm font-medium text-[#0EA5A4]">الخطوة الأخيرة</p>
          <h1 className="mt-2 text-3xl font-bold text-[#0F172A]">خصص تفضيلاتك الوظيفية</h1>
          <p className="mt-3 text-sm text-[#64748B]">
            هذه المعلومات تساعد الشغيلي في ترشيح وظائف أقرب لك من البداية.
          </p>
        </div>

        <Card className="space-y-5 border border-[#E2E8F0]">
          <Input
            label="المسميات المستهدفة"
            value={targetTitlesInput}
            onChange={(event) => setTargetTitlesInput(event.target.value)}
            placeholder="مثال: مطور React, مهندس برمجيات, محلل بيانات"
          />
          <Input
            label="المواقع المفضلة"
            value={locationsInput}
            onChange={(event) => setLocationsInput(event.target.value)}
            placeholder="مثال: عمّان, الرياض, عن بعد"
          />
          <Input
            label="القطاعات"
            value={industriesInput}
            onChange={(event) => setIndustriesInput(event.target.value)}
            placeholder="مثال: تقنية, تعليم, تجارة إلكترونية"
          />
          <Input
            label="الحد الأدنى للراتب"
            type="number"
            value={minSalary}
            onChange={(event) => setMinSalary(event.target.value)}
            placeholder="اختياري"
          />

          <div>
            <p className="mb-2 text-sm font-medium text-[#0F172A]">نوع العمل المفضل</p>
            <div className="flex flex-wrap gap-2">
              {[
                ['full_time', 'دوام كامل'],
                ['part_time', 'دوام جزئي'],
                ['remote', 'عن بعد'],
                ['contract', 'عقد'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setWorkType(value)}
                  className="cursor-pointer"
                >
                  <Badge variant={workType === value ? 'default' : 'neutral'}>{label}</Badge>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-[#EF4444]">{error}</p>}

          <div className="flex justify-end">
            <Button onClick={handleSave} loading={isSaving}>
              حفظ والانتقال إلى اللوحة
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
