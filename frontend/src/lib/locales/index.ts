import ar, { quickPrompts as quickPromptsAr } from './ar'
import en, { quickPrompts as quickPromptsEn } from './en'

export type Locale = 'ar' | 'en'
export type TranslationKey = keyof typeof ar

export const dictionaries: Record<Locale, Record<TranslationKey, string>> = { ar, en }
export const quickPromptsByLocale: Record<Locale, readonly string[]> = {
  ar: quickPromptsAr,
  en: quickPromptsEn,
}
