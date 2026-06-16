import { MessageCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function FAB() {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate('/copilot')}
      className="fixed bottom-6 left-6 w-14 h-14 rounded-full bg-gradient-to-br from-[#0EA5A4] to-[#06B6D4] text-white shadow-lg shadow-[#0EA5A4]/30 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center z-40"
      aria-label="المساعد"
    >
      <MessageCircle className="w-6 h-6" />
      <span className="absolute top-0 right-0 w-3 h-3 bg-[#22C55E] rounded-full border-2 border-white animate-pulse" />
    </button>
  )
}
