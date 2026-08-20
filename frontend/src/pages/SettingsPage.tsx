import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import AutoApplySettingsCard from '@/components/settings/AutoApplySettingsCard'
import { usersService } from '@/services/users.service'
import { useTranslation } from '@/store/i18nStore'
import type { Locale } from '@/lib/locales'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPreferences, setSavingPreferences] = useState(false)

  const [name, setName] = useState('')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const { t, dir, language, setLanguage } = useTranslation()

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
        // The server-persisted preference is the source of truth on load —
        // it may differ from whatever was last set locally (e.g. a
        // different device). setLanguage also updates `dir` immediately.
        setLanguage((profile?.preferred_language as Locale) ?? 'ar')

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
    // Only run once on mount — `setLanguage` is stable (zustand action),
    // and we don't want this effect re-firing every time the language
    // itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="space-y-6" dir={dir}>
      <div>
        <h1 className="text-3xl font-bold text-[#0F172A]">{t('settings.title')}</h1>
        <p className="mt-2 text-sm text-[#64748B]">{t('settings.subtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 border border-[#E2E8F0]">
          <h2 className="text-lg font-semibold text-[#0F172A]">{t('settings.profile.title')}</h2>
          <Input label={t('settings.profile.name')} value={name} onChange={(event) => setName(event.target.value)} />
          <Input label={t('settings.profile.country')} value={country} onChange={(event) => setCountry(event.target.value)} />
          <Input label={t('settings.profile.city')} value={city} onChange={(event) => setCity(event.target.value)} />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#0F172A]">{t('settings.profile.language')}</label>
            <select
              className="w-full rounded-lg border border-[#E2E8F0] bg-[var(--rushd-surface-alt)] px-3 py-2 text-sm text-[#0F172A]"
              value={language}
              onChange={(event) => setLanguage(event.target.value as Locale)}
            >
              <option value="ar">{t('settings.profile.language.ar')}</option>
              <option value="en">{t('settings.profile.language.en')}</option>
            </select>
          </div>

          <Button onClick={handleProfileSave} loading={savingProfile}>
            {t('settings.profile.save')}
          </Button>
        </Card>

        <Card className="space-y-4 border border-[#E2E8F0]">
          <h2 className="text-lg font-semibold text-[#0F172A]">{t('settings.preferences.title')}</h2>
          <Input
            label={t('settings.preferences.targetTitles')}
            value={targetTitles}
            onChange={(event) => setTargetTitles(event.target.value)}
            placeholder={t('settings.preferences.targetTitles.placeholder')}
          />
          <Input
            label={t('settings.preferences.locations')}
            value={locations}
            onChange={(event) => setLocations(event.target.value)}
            placeholder={t('settings.preferences.locations.placeholder')}
          />
          <Input
            label={t('settings.preferences.industries')}
            value={industries}
            onChange={(event) => setIndustries(event.target.value)}
            placeholder={t('settings.preferences.industries.placeholder')}
          />
          <Input
            label={t('settings.preferences.minSalary')}
            type="number"
            value={minSalary}
            onChange={(event) => setMinSalary(event.target.value)}
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#0F172A]">{t('settings.preferences.workType')}</label>
            <select
              className="w-full rounded-lg border border-[#E2E8F0] bg-[var(--rushd-surface-alt)] px-3 py-2 text-sm text-[#0F172A]"
              value={workType}
              onChange={(event) => setWorkType(event.target.value)}
            >
              <option value="">{t('settings.preferences.workType.unspecified')}</option>
              <option value="full_time">{t('settings.preferences.workType.fullTime')}</option>
              <option value="part_time">{t('settings.preferences.workType.partTime')}</option>
              <option value="contract">{t('settings.preferences.workType.contract')}</option>
              <option value="remote">{t('settings.preferences.workType.remote')}</option>
            </select>
          </div>

          <Button onClick={handlePreferencesSave} loading={savingPreferences}>
            {t('settings.preferences.save')}
          </Button>
        </Card>

        <AutoApplySettingsCard />
      </div>
    </div>
  )
}
