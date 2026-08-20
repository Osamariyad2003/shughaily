import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Copy, MessageSquare, Send } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { copilotService } from '@/services/copilot.service'
import { useTranslation } from '@/store/i18nStore'
import { quickPromptsByLocale } from '@/lib/locales'
import type { ChatMessage } from '@/lib/types'

// Matched against the actual API error message (not UI copy) to detect an
// AI-service outage regardless of which language the UI is displaying.
const AI_UNAVAILABLE_MSGS = [
  'خدمة الذكاء الاصطناعي غير متاحة',
  'AI service',
  'ECONNREFUSED',
  'خدمة AI',
]

function isAiDownError(msg: string) {
  return AI_UNAVAILABLE_MSGS.some((s) => msg.toLowerCase().includes(s.toLowerCase()))
}

export default function CopilotPage() {
  const { t, dir, language } = useTranslation()
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: t('copilot.welcome'),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [aiDown, setAiDown] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async (message: string) => {
    if (!message.trim()) return

    const userMessage: ChatMessage = { role: 'user', content: message.trim() }
    setMessages((current) => [...current, userMessage])
    setInput('')
    setLoading(true)
    setAiDown(false)

    try {
      const response = await copilotService.chat(message.trim(), language)
      const reply = response.data?.reply ?? t('copilot.error.noReply')
      setMessages((current) => [...current, { role: 'assistant', content: reply }])
    } catch (error) {
      const msg = error instanceof Error ? error.message : t('copilot.error.generic')
      const down = isAiDownError(msg)
      if (down) setAiDown(true)
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: down ? t('copilot.error.aiDown') : msg,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const copyText = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => undefined)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.85fr,1.4fr]" dir={dir}>
      {/* ── Left panel ── */}
      <div className="space-y-4">
        <Card className="border border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <div>
              <h1 className="text-base font-bold text-[#0F172A]">{t('copilot.quickStart')}</h1>
              <p className="text-[11px] text-[#64748B]">{t('copilot.quickStart.subtitle')}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {quickPromptsByLocale[language].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => sendMessage(prompt)}
                className="rounded-full border border-[#E2E8F0] px-3 py-1.5 text-xs text-[#475569] transition hover:border-[#0EA5A4] hover:bg-teal-50 hover:text-[#0F766E]"
              >
                {prompt}
              </button>
            ))}
          </div>
        </Card>

        {aiDown && (
          <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t('copilot.aiDownBanner')}
          </div>
        )}
      </div>

      {/* ── Chat panel ── */}
      <Card className="flex min-h-[75vh] flex-col border border-[#E2E8F0] p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[#F1F5F9] bg-gradient-to-l from-teal-50/60 to-white px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0EA5A4] text-white">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#0F172A]">{t('copilot.header.title')}</h2>
            <p className="text-[11px] text-[#64748B]">{t('copilot.header.subtitle')}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <AnimatePresence initial={false}>
            {messages.map((message, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className={`flex gap-2 ${message.role === 'user' ? 'justify-start flex-row-reverse' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0EA5A4] text-white">
                    <MessageSquare className="h-3.5 w-3.5" />
                  </div>
                )}
                <div className={`group relative max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-7 ${
                  message.role === 'user'
                    ? 'bg-[#0EA5A4] text-white rounded-tl-sm'
                    : 'bg-[var(--rushd-surface-alt)] text-[#334155] rounded-tr-sm ring-1 ring-[#E2E8F0]'
                }`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.role === 'assistant' && (
                    <button
                      onClick={() => copyText(message.content)}
                      className="absolute -bottom-6 start-1 hidden items-center gap-1 text-[10px] text-[#94A3B8] hover:text-[#0EA5A4] group-hover:flex"
                    >
                      <Copy className="h-3 w-3" /> {t('copilot.copy')}
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0EA5A4] text-white">
                <MessageSquare className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center gap-1.5 rounded-2xl bg-[var(--rushd-surface-alt)] px-4 py-3 ring-1 ring-[#E2E8F0]">
                <span className="h-2 w-2 animate-bounce rounded-full bg-[#0EA5A4] [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[#0EA5A4] [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[#0EA5A4] [animation-delay:300ms]" />
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form
          className="flex items-end gap-3 border-t border-[#F1F5F9] bg-white px-5 py-4"
          onSubmit={(e) => { e.preventDefault(); void sendMessage(input) }}
        >
          <textarea
            className="min-h-[52px] max-h-32 flex-1 resize-none rounded-2xl border border-[#E2E8F0] bg-[var(--rushd-surface-alt)] px-4 py-3 text-sm text-[#0F172A] outline-none transition focus:border-[#0EA5A4] focus:ring-2 focus:ring-[#0EA5A4]/20"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void sendMessage(input)
              }
            }}
            placeholder={t('copilot.input.placeholder')}
            rows={2}
          />
          <Button type="submit" disabled={!input.trim() || loading} loading={loading}>
            <Send className="h-4 w-4" />
            {t('copilot.send')}
          </Button>
        </form>
      </Card>
    </div>
  )
}
