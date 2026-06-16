import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { usersService } from '@/services/users.service'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPreferences, setSavingPreferences] = useState(false)

  const [name, setName] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [language, setLanguage] = useState('ar')

  const [targetTitles, setTargetTitles] = useState('')
  const [locations, setLocations] = useState('')
  const [industries, setIndustries] = useState('')
  const [workType, setWorkType] = useState('')
  const [minSalary, setMinSalary] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [profileResponse, preferencesResponse] = await Promise.all([
          usersService.getProfile(),
          usersService.getPreferences(),
        ])

        const profile = profileResponse.data
        const preferences = preferencesResponse.data

        setName(profile?.name ?? '')
        setCountry(profile?.country ?? '')
        setCity(profile?.city ?? '')
        setLanguage(profile?.preferred_language ?? 'ar')

        setTargetTitles((preferences?.target_titles ?? []).join(', '))
        setLocations((preferences?.preferred_locations ?? []).join(', '))
        setIndustries((preferences?.industries ?? []).join(', '))
        setWorkType(preferences?.work_type ?? '')
        setMinSalary(preferences?.min_salary ? String(preferences.min_salary) : '')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const handleProfileSave = async () => {
    setSavingProfile(true)
    try {
      await usersService.updateProfile({
        name,
        country,
        city,
        preferred_language: language,
      })
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePreferencesSave = async () => {
    setSavingPreferences(true)
    try {
      await usersService.updatePreferences({
        target_titles: targetTitles.split(',').map((item) => item.trim()).filter(Boolean),
        preferred_locations: locations.split(',').map((item) => item.trim()).filter(Boolean),
        industries: industries.split(',').map((item) => item.trim()).filter(Boolean),
        work_type: workType || undefined,
        min_salary: minSalary ? Number(minSalary) : undefined,
      })
    } finally {
      setSavingPreferences(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner size="lg" className="text-[#0EA5A4]" />
      </div>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold text-[#0F172A]">الإعدادات</h1>
        <p className="mt-2 text-sm text-[#64748B]">حدث ملفك الشخصي وتفضيلات البحث عن الوظائف.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 border border-[#E2E8F0]">
          <h2 className="text-lg font-semibold text-[#0F172A]">الملف الشخصي</h2>
          <Input label="الاسم" value={name} onChange={(event) => setName(event.target.value)} />
          <Input label="الدولة" value={country} onChange={(event) => setCountry(event.target.value)} />
          <Input label="المدينة" value={city} onChange={(event) => setCity(event.target.value)} />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#0F172A]">اللغة</label>
            <select
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A]"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </div>

          <Button onClick={handleProfileSave} loading={savingProfile}>
            حفظ الملف الشخصي
          </Button>
        </Card>

        <Card className="space-y-4 border border-[#E2E8F0]">
          <h2 className="text-lg font-semibold text-[#0F172A]">تفضيلات الوظائف</h2>
          <Input
            label="المسميات المستهدفة"
            value={targetTitles}
            onChange={(event) => setTargetTitles(event.target.value)}
            placeholder="مثال: مطور React, محلل بيانات"
          />
          <Input
            label="المواقع المفضلة"
            value={locations}
            onChange={(event) => setLocations(event.target.value)}
            placeholder="مثال: عمّان, الرياض, عن بعد"
          />
          <Input
            label="القطاعات"
            value={industries}
            onChange={(event) => setIndustries(event.target.value)}
            placeholder="مثال: تقنية, تعليم"
          />
          <Input
            label="الحد الأدنى للراتب"
            type="number"
            value={minSalary}
            onChange={(event) => setMinSalary(event.target.value)}
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#0F172A]">نوع العمل</label>
            <select
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A]"
              value={workType}
              onChange={(event) => setWorkType(event.target.value)}
            >
              <option value="">غير محدد</option>
              <option value="full_time">دوام كامل</option>
              <option value="part_time">دوام جزئي</option>
              <option value="contract">عقد</option>
              <option value="remote">عن بعد</option>
            </select>
          </div>

          <Button onClick={handlePreferencesSave} loading={savingPreferences}>
            حفظ التفضيلات
          </Button>
        </Card>
      </div>
    </div>
  )
}
