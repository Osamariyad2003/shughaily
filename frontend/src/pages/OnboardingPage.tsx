import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { usersService } from '@/services/users.service'
import { useTranslation } from '@/store/i18nStore'
import type { TranslationKey } from '@/lib/locales'

function splitTags(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { t, dir } = useTranslation()
  const [targetTitlesInput, setTargetTitlesInput] = useState('')
  const [locationsInput, setLocationsInput] = useState('')
  const [industriesInput, setIndustriesInput] = useState('')
  const [workType, setWorkType] = useState('full_time')
  const [minSalary, setMinSalary] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const workTypeOptions: [string, TranslationKey][] = [
    ['full_time', 'settings.preferences.workType.fullTime'],
    ['part_time', 'settings.preferences.workType.partTime'],
    ['remote', 'settings.preferences.workType.remote'],
    ['contract', 'settings.preferences.workType.contract'],
  ]

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
      setError(err instanceof Error ? err.message : t('onboarding.error.generic'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--rushd-surface-alt)] px-4 py-10" dir={dir}>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="text-center">
          <p className="text-sm font-medium text-[#0EA5A4]">{t('onboarding.step')}</p>
          <h1 className="mt-2 text-3xl font-bold text-[#0F172A]">{t('onboarding.heading')}</h1>
          <p className="mt-3 text-sm text-[#64748B]">
            {t('onboarding.description')}
          </p>
        </div>

        <Card className="space-y-5 border border-[#E2E8F0]">
          <Input
            label={t('settings.preferences.targetTitles')}
            value={targetTitlesInput}
            onChange={(event) => setTargetTitlesInput(event.target.value)}
            placeholder={t('onboarding.targetTitles.placeholder')}
          />
          <Input
            label={t('settings.preferences.locations')}
            value={locationsInput}
            onChange={(event) => setLocationsInput(event.target.value)}
            placeholder={t('settings.preferences.locations.placeholder')}
          />
          <Input
            label={t('settings.preferences.industries')}
            value={industriesInput}
            onChange={(event) => setIndustriesInput(event.target.value)}
            placeholder={t('settings.preferences.industries.placeholder')}
          />
          <Input
            label={t('settings.preferences.minSalary')}
            type="number"
            value={minSalary}
            onChange={(event) => setMinSalary(event.target.value)}
            placeholder={t('onboarding.minSalary.placeholder')}
          />

          <div>
            <p className="mb-2 text-sm font-medium text-[#0F172A]">{t('onboarding.workType')}</p>
            <div className="flex flex-wrap gap-2">
              {workTypeOptions.map(([value, labelKey]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setWorkType(value)}
                  className="cursor-pointer"
                >
                  <Badge variant={workType === value ? 'default' : 'neutral'}>{t(labelKey)}</Badge>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-[#EF4444]">{error}</p>}

          <div className="flex justify-end">
            <Button onClick={handleSave} loading={isSaving}>
              {t('onboarding.save')}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
