import { useEffect, useState } from 'react'
import { Mail } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import AutoApplyFirstSendModal from './AutoApplyFirstSendModal'
import { autoApplyService } from '@/services/autoApply.service'
import { useTranslation } from '@/store/i18nStore'
import type { AutoApplySettings } from '@/lib/types'

export default function AutoApplySettingsCard() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<AutoApplySettings | null>(null)

  const [enabled, setEnabled] = useState(false)
  const [threshold, setThreshold] = useState(80)
  const [dailyCap, setDailyCap] = useState(10)
  const [dryRun, setDryRun] = useState(true)

  const applyToDrafts = (data: AutoApplySettings) => {
    setSettings(data)
    setEnabled(data.enabled)
    setThreshold(data.min_match_threshold)
    setDailyCap(data.daily_send_cap)
    setDryRun(data.dry_run)
  }

  useEffect(() => {
    const load = async () => {
      try {
        const res = await autoApplyService.getSettings()
        if (res.data) applyToDrafts(res.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : t('autoApply.error.loadFailed'))
      } finally {
        setLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persist = async (payload: Parameters<typeof autoApplyService.updateSettings>[0]) => {
    setError('')
    try {
      const res = await autoApplyService.updateSettings(payload)
      if (res.data) applyToDrafts(res.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('autoApply.error.saveFailed'))
    }
  }

  const handleSave = async () => {
    // Turning dry_run OFF for the first time requires the mandatory
    // confirmation modal instead of saving directly (requirement 6).
    if (!dryRun && settings && !settings.reviewed_first_send) {
      setConfirmOpen(true)
      return
    }

    setSaving(true)
    await persist({
      enabled,
      min_match_threshold: threshold,
      daily_send_cap: dailyCap,
      dry_run: dryRun,
    })
    setSaving(false)
  }

  const handleConfirmFirstSend = async () => {
    setConfirming(true)
    await persist({
      enabled,
      min_match_threshold: threshold,
      daily_send_cap: dailyCap,
      dry_run: false,
      reviewed_first_send: true,
    })
    setConfirming(false)
    setConfirmOpen(false)
  }

  const handleCancelFirstSend = () => {
    setConfirmOpen(false)
    // Revert the draft toggle back to dry-run so the UI doesn't look like
    // a real-send state was applied when it wasn't.
    setDryRun(true)
  }

  if (loading) {
    return (
      <Card className="space-y-4 border border-[#E2E8F0]">
        <h2 className="text-lg font-semibold text-[#0F172A]">{t('autoApply.title')}</h2>
        <p className="text-sm text-[#64748B]">{t('autoApply.loading')}</p>
      </Card>
    )
  }

  return (
    <>
      <Card className="space-y-4 border border-[#E2E8F0]">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[#0F172A]">
            <Mail className="h-5 w-5 text-[#0EA5A4]" />
            {t('autoApply.title')}
          </h2>
          {settings && (
            <Badge variant={settings.enabled && !settings.dry_run ? 'success' : 'neutral'}>
              {!settings.enabled ? t('autoApply.status.off') : settings.dry_run ? t('autoApply.status.dryRun') : t('autoApply.status.live')}
            </Badge>
          )}
        </div>

        <p className="text-sm leading-6 text-[#64748B]">
          {t('autoApply.description')}
        </p>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>
        )}

        <label className="flex items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] p-3">
          <div>
            <p className="text-sm font-medium text-[#0F172A]">{t('autoApply.enable.title')}</p>
            <p className="text-xs text-[#64748B]">{t('autoApply.enable.description')}</p>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-5 accent-[#0EA5A4]"
          />
        </label>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] p-3">
          <div>
            <p className="text-sm font-medium text-[#0F172A]">{t('autoApply.dryRun.title')}</p>
            <p className="text-xs text-[#64748B]">
              {t('autoApply.dryRun.description')}
            </p>
          </div>
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            className="h-5 w-5 accent-[#0EA5A4]"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#0F172A]">
              {t('autoApply.threshold.label')}
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A]"
            />
            <p className="mt-1 text-xs text-[#94A3B8]">{t('autoApply.threshold.description')}</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#0F172A]">{t('autoApply.dailyCap.label')}</label>
            <input
              type="number"
              min={1}
              max={100}
              value={dailyCap}
              onChange={(e) => setDailyCap(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A]"
            />
            <p className="mt-1 text-xs text-[#94A3B8]">{t('autoApply.dailyCap.description')}</p>
          </div>
        </div>

        <Button onClick={handleSave} loading={saving}>
          {t('autoApply.save')}
        </Button>
      </Card>

      <AutoApplyFirstSendModal
        open={confirmOpen}
        onCancel={handleCancelFirstSend}
        onConfirm={handleConfirmFirstSend}
        confirming={confirming}
      />
    </>
  )
}
