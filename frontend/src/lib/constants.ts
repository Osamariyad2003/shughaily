export const APP_NAME = 'الشغيلي'
export const APP_TAGLINE = 'مساعدك الذكي للتوظيف'

export const WORK_TYPES = [
  { value: 'full_time', label: 'دوام كامل' },
  { value: 'part_time', label: 'دوام جزئي' },
  { value: 'remote', label: 'عن بعد' },
  { value: 'contract', label: 'عقد مؤقت' },
  { value: 'freelance', label: 'عمل حر' },
] as const

export const APPLICATION_STATUSES = [
  { value: 'all', label: 'الكل' },
  { value: 'saved', label: 'تم الحفظ' },
  { value: 'applied', label: 'تم التقديم' },
  { value: 'interviewing', label: 'مقابلة' },
  { value: 'offered', label: 'عرض' },
  { value: 'rejected', label: 'مرفوض' },
] as const

export const COPILOT_QUICK_PROMPTS = [
  'حلل سيرتي الذاتية',
  'اقترح وظائف مناسبة لي',
  'اكتب خطاب تغطية',
  'حضرني للمقابلة',
  'كيف أحسن سيرتي الذاتية؟',
  'ما هي المهارات المطلوبة؟',
] as const
