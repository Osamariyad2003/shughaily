import { create } from 'zustand'
import { dictionaries, type Locale, type TranslationKey } from '@/lib/locales'

interface I18nState {
  language: Locale
  dir: 'rtl' | 'ltr'
  /** Set the active language. Persists to localStorage so it survives a
   * refresh even before the user's profile has loaded, and is the single
   * source of truth AppLayout/AuthLayout/every page reads `dir` from. */
  setLanguage: (language: Locale) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

function readInitialLanguage(): Locale {
  const stored = localStorage.getItem('language')
  return stored === 'en' ? 'en' : 'ar'
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match))
}

export const useI18nStore = create<I18nState>((set, get) => ({
  language: readInitialLanguage(),
  dir: readInitialLanguage() === 'ar' ? 'rtl' : 'ltr',

  setLanguage: (language) => {
    localStorage.setItem('language', language)
    set({ language, dir: language === 'ar' ? 'rtl' : 'ltr' })
  },

  t: (key, vars) => {
    const { language } = get()
    const dict = dictionaries[language]
    const template = dict[key] ?? dictionaries.ar[key] ?? key
    return interpolate(template, vars)
  },
}))

/** Convenience hook for components — `const { t, dir, language } = useTranslation()`. */
export function useTranslation() {
  const t = useI18nStore((s) => s.t)
  const dir = useI18nStore((s) => s.dir)
  const language = useI18nStore((s) => s.language)
  const setLanguage = useI18nStore((s) => s.setLanguage)
  return { t, dir, language, setLanguage }
}
