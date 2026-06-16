import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatRelativeDate(date: string | Date): string {
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'اليوم'
  if (diffDays === 1) return 'أمس'
  if (diffDays < 7) return `منذ ${diffDays} أيام`
  if (diffDays < 30) return `منذ ${Math.floor(diffDays / 7)} أسابيع`
  return formatDate(date)
}

export function getMatchScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-[#0EA5A4]'
  if (score >= 40) return 'text-amber-500'
  return 'text-red-500'
}

export function getMatchScoreBg(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-[#0EA5A4]'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    saved: 'تم الحفظ',
    applied: 'تم التقديم',
    interviewing: 'مقابلة',
    offered: 'عرض',
    rejected: 'مرفوض',
    withdrawn: 'منسحب',
  }
  return map[status] || status
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    saved: 'bg-slate-100 text-slate-600',
    applied: 'bg-blue-100 text-blue-700',
    interviewing: 'bg-amber-100 text-amber-700',
    offered: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    withdrawn: 'bg-slate-200 text-slate-700',
  }
  return map[status] || 'bg-slate-100 text-slate-600'
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}
