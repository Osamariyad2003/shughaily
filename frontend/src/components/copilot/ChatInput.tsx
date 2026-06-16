import { useState, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('')

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border border-[#E2E8F0] bg-white rounded-2xl p-2 flex items-end gap-2 focus-within:border-[#0EA5A4] transition-colors">
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
        }}
        onKeyDown={handleKeyDown}
        placeholder="اكتب رسالتك للشغيلي..."
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none bg-transparent px-3 py-2 text-sm focus:outline-none disabled:opacity-50 max-h-[120px]"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="p-2.5 bg-[#0EA5A4] text-white rounded-xl hover:bg-[#0F766E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="إرسال"
      >
        <Send className="w-4 h-4 rotate-180" />
      </button>
    </div>
  )
}
