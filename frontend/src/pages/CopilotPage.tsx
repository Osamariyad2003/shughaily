import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Copy, MessageSquare, Send } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { COPILOT_QUICK_PROMPTS } from '@/lib/constants'
import { copilotService } from '@/services/copilot.service'
import type { ChatMessage } from '@/lib/types'

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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'أنا الشغيلي. أقدر أساعدك في السيرة الذاتية، التوصيات، وخطابات التغطية والمقابلات.',
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
      const response = await copilotService.chat(message.trim(), 'ar')
      const reply = response.data?.reply ?? 'تعذر توليد رد الآن.'
      setMessages((current) => [...current, { role: 'assistant', content: reply }])
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'حدث خطأ غير متوقع.'
      const down = isAiDownError(msg)
      if (down) setAiDown(true)
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: down
            ? 'خدمة الذكاء الاصطناعي غير متاحة حالياً. يرجى تشغيل خدمة AI والمحاولة مجدداً.'
            : msg,
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
    <div className="grid gap-6 lg:grid-cols-[0.85fr,1.4fr]" dir="rtl">
      {/* ── Left panel ── */}
      <div className="space-y-4">
        <Card className="border border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <div>
              <h1 className="text-base font-bold text-[#0F172A]">بدايات سريعة</h1>
              <p className="text-[11px] text-[#64748B]">اختر أو اكتب سؤالك</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {COPILOT_QUICK_PROMPTS.map((prompt) => (
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
            خدمة المساعد غير متاحة حالياً. تأكد من تشغيل الخادم ثم أعد المحاولة.
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
            <h2 className="text-sm font-bold text-[#0F172A]">المساعد</h2>
            <p className="text-[11px] text-[#64748B]">سيرة ذاتية • توصيات • خطابات تغطية • مقابلات</p>
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
                    : 'bg-[#F8FAFC] text-[#334155] rounded-tr-sm ring-1 ring-[#E2E8F0]'
                }`}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.role === 'assistant' && (
                    <button
                      onClick={() => copyText(message.content)}
                      className="absolute -bottom-6 left-1 hidden items-center gap-1 text-[10px] text-[#94A3B8] hover:text-[#0EA5A4] group-hover:flex"
                    >
                      <Copy className="h-3 w-3" /> نسخ
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
              <div className="flex items-center gap-1.5 rounded-2xl bg-[#F8FAFC] px-4 py-3 ring-1 ring-[#E2E8F0]">
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
            className="min-h-[52px] max-h-32 flex-1 resize-none rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm text-[#0F172A] outline-none transition focus:border-[#0EA5A4] focus:ring-2 focus:ring-[#0EA5A4]/20"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void sendMessage(input)
              }
            }}
            placeholder="اكتب سؤالك هنا... (Enter للإرسال، Shift+Enter للسطر الجديد)"
            rows={2}
          />
          <Button type="submit" disabled={!input.trim() || loading} loading={loading}>
            <Send className="h-4 w-4" />
            إرسال
          </Button>
        </form>
      </Card>
    </div>
  )
}
