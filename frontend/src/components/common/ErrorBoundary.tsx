import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useI18nStore } from '@/store/i18nStore'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * Top-level render-error catch-all. Without this, an uncaught exception in
 * any single component (e.g. an API response shape the UI didn't expect)
 * unmounts the whole React tree and leaves the user staring at a blank
 * white page with no way to recover short of knowing to hit refresh.
 *
 * Deliberately class-based — catching render errors requires
 * getDerivedStateFromError/componentDidCatch, which have no hook
 * equivalent yet. Because of that, this can't call useTranslation() (a
 * hook) — it reads the i18n store directly via getState() instead, which
 * is safe to call from anywhere, including mid-render-error recovery.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Server-side logging isn't wired up on the frontend; console.error is
    // the honest floor here so the failure is at least visible in devtools
    // rather than silently swallowed.
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      const { t, dir } = useI18nStore.getState()
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--rushd-surface-alt)] px-6 text-center" dir={dir}>
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h1 className="mb-1 text-lg font-bold text-[#0F172A]">{t('common.errorBoundary.title')}</h1>
          <p className="mb-4 max-w-md text-sm text-[#64748B]">
            {t('common.errorBoundary.description')}
          </p>
          <Button onClick={() => window.location.reload()} variant="primary" size="md">
            {t('common.errorBoundary.reload')}
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
