import { MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatBubbleProps {
  content: string
  isUser: boolean
  timestamp?: string
}

export default function ChatBubble({ content, isUser, timestamp }: ChatBubbleProps) {
  if (isUser) {
    return (
      <div className="flex justify-start mb-4">
        <div className="max-w-[80%]">
          <div className="bg-[#0EA5A4] text-white rounded-2xl rounded-tr-sm px-4 py-3">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
          </div>
          {timestamp && (
            <p className="text-xs text-[#64748B] mt-1 text-start">{timestamp}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-end mb-4">
      <div className="max-w-[80%]">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-6 h-6 rounded-full bg-[#0EA5A4] flex items-center justify-center">
            <MessageSquare className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-bold text-[#0EA5A4]">المساعد</span>
        </div>
        <div
          className={cn(
            'bg-[var(--rushd-surface-alt)] border border-[#E2E8F0] rounded-2xl rounded-tl-sm px-4 py-3'
          )}
        >
          <p className="text-sm leading-relaxed text-[#0F172A] whitespace-pre-wrap">{content}</p>
        </div>
        {timestamp && (
          <p className="text-xs text-[#64748B] mt-1 text-end">{timestamp}</p>
        )}
      </div>
    </div>
  )
}
