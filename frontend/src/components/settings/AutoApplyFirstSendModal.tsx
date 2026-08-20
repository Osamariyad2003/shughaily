import { AlertTriangle, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useTranslation } from '@/store/i18nStore'

/**
 * Mandatory one-time confirmation before a user's first real (non-dry-run)
 * auto-apply send. Requirement 6: "review before first send" — this is the
 * only place `reviewed_first_send` is ever set to true.
 */
export default function AutoApplyFirstSendModal({
  open,
  onCancel,
  onConfirm,
  confirming,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  confirming?: boolean
}) {
  const { t, dir } = useTranslation()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" dir={dir}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-bold text-[#0F172A]">{t('autoApply.firstSend.title')}</h2>
          </div>
          <button onClick={onCancel} className="rounded-lg p-1 text-[#94A3B8] hover:bg-[var(--rushd-surface-alt)] hover:text-[#0F172A]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm leading-6 text-[#334155]">
          <p>
            {t('autoApply.firstSend.body1Prefix')}{' '}
            <strong>{t('autoApply.firstSend.body1Strong')}</strong>{' '}
            {t('autoApply.firstSend.body1Suffix')}
          </p>
          <ul className="list-inside list-disc space-y-1 text-[#475569]">
            <li>{t('autoApply.firstSend.bullet1')}</li>
            <li>{t('autoApply.firstSend.bullet2')}</li>
            <li>{t('autoApply.firstSend.bullet3')}</li>
          </ul>
          <p className="font-medium text-[#0F172A]">{t('autoApply.firstSend.confirm')}</p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={confirming}>
            {t('autoApply.firstSend.cancel')}
          </Button>
          <Button onClick={onConfirm} loading={confirming}>
            {t('autoApply.firstSend.activate')}
          </Button>
        </div>
      </div>
    </div>
  )
}
