import { useState } from 'react'
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  CreditCard,
  Zap,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  BarChart2,
  TrendingUp,
} from 'lucide-react'
import { useApiKeys, useCreateApiKey, useRevokeApiKey, useBillingStats } from '@/hooks/useBilling'
import type { ApiKeyMeta, BillingStatsResponse } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso))
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('ar-SA').format(n)
}

function formatCost(n: number): string {
  return `$${n.toFixed(4)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  accent?: 'teal' | 'amber' | 'violet' | 'rose'
}

const ACCENT = {
  teal:   { bg: 'bg-teal-50',   icon: 'text-teal-600',   border: 'border-teal-100' },
  amber:  { bg: 'bg-amber-50',  icon: 'text-amber-600',  border: 'border-amber-100' },
  violet: { bg: 'bg-violet-50', icon: 'text-violet-600', border: 'border-violet-100' },
  rose:   { bg: 'bg-rose-50',   icon: 'text-rose-600',   border: 'border-rose-100' },
}

function StatCard({ label, value, sub, icon, accent = 'teal' }: StatCardProps) {
  const c = ACCENT[accent]
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-5 flex items-start gap-4`}>
      <div className={`mt-0.5 shrink-0 ${c.icon}`}>{icon}</div>
      <div className="min-w-0 flex-1 text-right">
        <p className="text-sm text-[#64748B]">{label}</p>
        <p className="mt-1 text-2xl font-bold text-[#0F172A] tabular-nums">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-[#94A3B8]">{sub}</p>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// New-key modal
// ─────────────────────────────────────────────────────────────────────────────

interface NewKeyModalProps {
  rawKey: string
  onClose: () => void
}

function NewKeyModal({ rawKey, onClose }: NewKeyModalProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(rawKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="مفتاح API الجديد"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[#F1F5F9] px-6 py-5">
          <ShieldCheck className="h-6 w-6 text-[#0EA5A4]" />
          <h2 className="text-lg font-semibold text-[#0F172A]">مفتاح API الجديد</h2>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Warning */}
          <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-800 leading-relaxed">
              هذا المفتاح يُعرض مرة واحدة فقط. احفظه في مكان آمن الآن — لن تتمكن من رؤيته مجدداً.
            </p>
          </div>

          {/* Key display */}
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
            <p className="break-all font-mono text-sm text-[#0F172A] select-all">{rawKey}</p>
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0EA5A4] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0F766E] active:scale-95"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                تم النسخ!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                نسخ المفتاح
              </>
            )}
          </button>
        </div>

        <div className="border-t border-[#F1F5F9] px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-[#64748B] transition-colors hover:bg-[#F8FAFC]"
          >
            أغلق (حفظت المفتاح)
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// API Keys section
// ─────────────────────────────────────────────────────────────────────────────

function ApiKeysSection() {
  const { data: keysRes, isLoading, isError } = useApiKeys()
  const createMutation = useCreateApiKey()
  const revokeMutation = useRevokeApiKey()

  const [newKeyName, setNewKeyName] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null)

  const keys: ApiKeyMeta[] = keysRes?.data ?? []

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newKeyName.trim()) return
    try {
      const res = await createMutation.mutateAsync(newKeyName.trim())
      if (res.data?.raw_key) {
        setRevealedKey(res.data.raw_key)
        setNewKeyName('')
        setShowForm(false)
      }
    } catch {
      // error shown via mutation state
    }
  }

  async function handleRevoke(id: string) {
    await revokeMutation.mutateAsync(id)
    setRevokeConfirm(null)
  }

  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white">
      {/* Section header */}
      <div className="flex items-center justify-between border-b border-[#F1F5F9] px-6 py-5">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-[#0EA5A4]" />
          <h2 className="text-base font-semibold text-[#0F172A]">مفاتيح API</h2>
          <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-xs font-medium text-[#64748B]">
            {keys.filter((k) => k.is_active).length}/10
          </span>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-[#0EA5A4] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0F766E]"
        >
          <Plus className="h-4 w-4" />
          مفتاح جديد
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="border-b border-[#F1F5F9] bg-[#F8FAFC] px-6 py-4"
        >
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="اسم المفتاح (مثل: Production App)"
              maxLength={100}
              required
              className="flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#0EA5A4] focus:outline-none focus:ring-2 focus:ring-[#0EA5A4]/20 text-right"
              dir="rtl"
            />
            <button
              type="submit"
              disabled={createMutation.isPending || !newKeyName.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-[#0F766E] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors hover:bg-[#0D6460]"
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'إنشاء'
              )}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setNewKeyName('') }}
              className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-[#64748B] hover:bg-white"
            >
              إلغاء
            </button>
          </div>
          {createMutation.isError && (
            <p className="mt-2 text-xs text-rose-600 text-right">
              {(createMutation.error as Error)?.message ?? 'حدث خطأ'}
            </p>
          )}
        </form>
      )}

      {/* Keys list */}
      <div className="divide-y divide-[#F1F5F9]">
        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-[#0EA5A4]" />
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-rose-600">
            <AlertTriangle className="h-4 w-4" />
            تعذر تحميل المفاتيح
          </div>
        )}

        {!isLoading && !isError && keys.length === 0 && (
          <div className="py-12 text-center">
            <Key className="mx-auto mb-3 h-8 w-8 text-[#CBD5E1]" />
            <p className="text-sm text-[#94A3B8]">لا توجد مفاتيح API بعد</p>
          </div>
        )}

        {keys.map((key) => (
          <div key={key.id} className="flex items-center gap-4 px-6 py-4">
            {/* Status dot */}
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${key.is_active ? 'bg-emerald-500' : 'bg-[#CBD5E1]'}`}
              title={key.is_active ? 'نشط' : 'مُعطَّل'}
            />

            {/* Key info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-[#0F172A]">{key.name}</span>
                {!key.is_active && (
                  <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-xs text-[#94A3B8]">
                    مُعطَّل
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-xs text-[#94A3B8]">
                <span className="font-mono">{key.prefix}•••••••••</span>
                <span>أُنشئ {formatDate(key.created_at)}</span>
                {key.last_used_at && (
                  <span>آخر استخدام {formatDate(key.last_used_at)}</span>
                )}
              </div>
            </div>

            {/* Revoke */}
            {key.is_active && (
              <>
                {revokeConfirm === key.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-[#64748B]">تأكيد الإلغاء؟</span>
                    <button
                      onClick={() => handleRevoke(key.id)}
                      disabled={revokeMutation.isPending}
                      className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {revokeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'إلغاء'}
                    </button>
                    <button
                      onClick={() => setRevokeConfirm(null)}
                      className="rounded-md border border-[#E2E8F0] px-2.5 py-1 text-xs text-[#64748B] hover:bg-[#F8FAFC]"
                    >
                      لا
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setRevokeConfirm(key.id)}
                    className="shrink-0 rounded-md p-1.5 text-[#94A3B8] transition-colors hover:bg-rose-50 hover:text-rose-600"
                    title="إلغاء المفتاح"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* New key reveal modal */}
      {revealedKey && (
        <NewKeyModal
          rawKey={revealedKey}
          onClose={() => setRevealedKey(null)}
        />
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage breakdown bar chart
// ─────────────────────────────────────────────────────────────────────────────

interface EndpointRow {
  endpoint: string
  tokens_used: number
  cost: number
  call_count: number
}

function EndpointChart({ rows }: { rows: EndpointRow[] }) {
  const max = Math.max(...rows.map((r) => r.tokens_used), 1)

  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white">
      <div className="flex items-center gap-2 border-b border-[#F1F5F9] px-6 py-5">
        <BarChart2 className="h-5 w-5 text-[#0EA5A4]" />
        <h2 className="text-base font-semibold text-[#0F172A]">الاستهلاك حسب المسار</h2>
        <span className="text-xs text-[#94A3B8]">(آخر 30 يوماً)</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-12 text-center">
          <TrendingUp className="mx-auto mb-3 h-8 w-8 text-[#CBD5E1]" />
          <p className="text-sm text-[#94A3B8]">لا توجد بيانات استخدام بعد</p>
        </div>
      ) : (
        <div className="divide-y divide-[#F1F5F9]">
          {rows.map((row) => {
            const pct = Math.round((row.tokens_used / max) * 100)
            const shortPath = row.endpoint.replace('/api/v1', '')
            return (
              <div key={row.endpoint} className="px-6 py-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded px-2 py-0.5">
                      {shortPath}
                    </span>
                    <span className="text-xs text-[#94A3B8]">
                      {formatNumber(row.call_count)} طلب
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-medium text-[#0F172A]">
                    <span>{formatNumber(row.tokens_used)} رمز</span>
                    <span className="text-[#94A3B8]">{formatCost(row.cost)}</span>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                  <div
                    className="h-full rounded-full bg-[#0EA5A4] transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily usage sparkline (last 30 days)
// ─────────────────────────────────────────────────────────────────────────────

interface DailyRow {
  date: string
  tokens_used: number
  cost: number
}

function DailyUsageChart({ rows }: { rows: DailyRow[] }) {
  if (rows.length === 0) return null
  const max = Math.max(...rows.map((r) => r.tokens_used), 1)

  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white">
      <div className="flex items-center gap-2 border-b border-[#F1F5F9] px-6 py-5">
        <TrendingUp className="h-5 w-5 text-[#0EA5A4]" />
        <h2 className="text-base font-semibold text-[#0F172A]">الاستهلاك اليومي</h2>
        <span className="text-xs text-[#94A3B8]">(آخر 30 يوماً)</span>
      </div>
      <div className="px-6 py-5">
        <div className="flex items-end gap-1 h-20" dir="ltr">
          {rows.map((row) => {
            const h = Math.max(4, Math.round((row.tokens_used / max) * 80))
            return (
              <div
                key={row.date}
                title={`${row.date}: ${formatNumber(row.tokens_used)} رمز`}
                className="flex-1 rounded-t bg-[#0EA5A4]/70 hover:bg-[#0EA5A4] transition-colors cursor-default"
                style={{ height: `${h}px` }}
              />
            )
          })}
        </div>
        <div className="mt-2 flex justify-between text-xs text-[#94A3B8]" dir="ltr">
          <span>{rows[0]?.date}</span>
          <span>{rows[rows.length - 1]?.date}</span>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan badge
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  free: 'مجاني',
  starter: 'مبتدئ',
  pro: 'احترافي',
  enterprise: 'مؤسسي',
}

const PLAN_COLORS: Record<string, string> = {
  free:       'bg-slate-100 text-slate-600',
  starter:    'bg-blue-50 text-blue-700',
  pro:        'bg-teal-50 text-teal-700',
  enterprise: 'bg-violet-50 text-violet-700',
}

function UsageBar({ used, quota }: { used: number; quota: number }) {
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0
  const color =
    pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-[#0EA5A4]'

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-[#64748B]">
        <span>{formatNumber(used)} / {formatNumber(quota)} رمز</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { data: statsRes, isLoading: statsLoading } = useBillingStats()
  const stats = statsRes?.data as BillingStatsResponse | undefined

  const sub = stats?.subscription
  const dailyUsage = stats?.daily_usage ?? []
  const endpointBreakdown = stats?.endpoint_breakdown ?? []

  const totalCost = endpointBreakdown.reduce((s, r) => s + r.cost, 0)

  return (
    <div className="min-h-screen bg-[#F8FAFC]" dir="rtl">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">

        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">الفوترة والاشتراك</h1>
            <p className="mt-1 text-sm text-[#64748B]">إدارة مفاتيح API ومتابعة استهلاك الرموز</p>
          </div>
          {sub && (
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${PLAN_COLORS[sub.plan_tier] ?? PLAN_COLORS.free}`}>
              {PLAN_LABELS[sub.plan_tier] ?? sub.plan_tier}
            </span>
          )}
        </div>

        {/* Stat cards */}
        {statsLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-xl border border-[#E2E8F0] bg-white animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="الرموز المستهلكة هذا الشهر"
              value={formatNumber(sub?.current_token_usage ?? 0)}
              sub="رمز"
              icon={<Zap className="h-6 w-6" />}
              accent="teal"
            />
            <StatCard
              label="الرصيد المتبقي"
              value={formatNumber(sub?.remaining_quota ?? 0)}
              sub={`من ${formatNumber(sub?.monthly_token_quota ?? 0)}`}
              icon={<CreditCard className="h-6 w-6" />}
              accent={
                (sub?.remaining_quota ?? 1) / (sub?.monthly_token_quota ?? 1) < 0.1
                  ? 'rose'
                  : 'violet'
              }
            />
            <StatCard
              label="التكلفة التقديرية"
              value={formatCost(totalCost)}
              sub="آخر 30 يوماً"
              icon={<TrendingUp className="h-6 w-6" />}
              accent="amber"
            />
          </div>
        )}

        {/* Usage progress */}
        {sub && (
          <div className="rounded-2xl border border-[#E2E8F0] bg-white px-6 py-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#0F172A]">استهلاك الحصة الشهرية</h2>
              {sub.cycle_reset_date && (
                <span className="text-xs text-[#94A3B8]">
                  تُجدَّد في {formatDate(sub.cycle_reset_date)}
                </span>
              )}
            </div>
            <UsageBar used={sub.current_token_usage} quota={sub.monthly_token_quota} />
          </div>
        )}

        {/* Daily chart */}
        <DailyUsageChart rows={dailyUsage} />

        {/* API Keys management */}
        <ApiKeysSection />

        {/* Endpoint breakdown */}
        <EndpointChart rows={endpointBreakdown} />

      </div>
    </div>
  )
}
