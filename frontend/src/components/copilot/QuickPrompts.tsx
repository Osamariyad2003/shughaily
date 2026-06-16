interface QuickPromptsProps {
  prompts: readonly string[]
  onSelect: (prompt: string) => void
}

export default function QuickPrompts({ prompts, onSelect }: QuickPromptsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          onClick={() => onSelect(prompt)}
          className="flex-shrink-0 px-4 py-2 bg-white border border-[#E2E8F0] text-sm text-[#0F172A] rounded-full hover:border-[#0EA5A4] hover:bg-[#CCFBF1]/30 transition-all duration-200"
        >
          {prompt}
        </button>
      ))}
    </div>
  )
}
