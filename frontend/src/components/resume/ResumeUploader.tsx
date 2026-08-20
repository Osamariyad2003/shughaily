import { useState, useRef, type DragEvent } from 'react'
import { Upload, FileText, X } from 'lucide-react'
import Button from '@/components/ui/Button'

interface ResumeUploaderProps {
  onUpload: (file: File) => void
  loading?: boolean
}

export default function ResumeUploader({ onUpload, loading }: ResumeUploaderProps) {
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) setSelectedFile(file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setSelectedFile(file)
  }

  const handleSubmit = () => {
    if (selectedFile) onUpload(selectedFile)
  }

  if (selectedFile) {
    return (
      <div className="border-2 border-[#0EA5A4] border-dashed rounded-xl p-6 bg-[#CCFBF1]/30">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 bg-white rounded-lg">
              <FileText className="w-6 h-6 text-[#0EA5A4]" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[#0F172A] truncate">{selectedFile.name}</p>
              <p className="text-xs text-[#64748B]">
                {(selectedFile.size / 1024).toFixed(1)} كيلوبايت
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedFile(null)}
            className="p-2 text-[#64748B] hover:text-[#EF4444] transition-colors"
            aria-label="إزالة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={handleSubmit} loading={loading} className="flex-1">
            رفع السيرة الذاتية
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
        dragActive
          ? 'border-[#0EA5A4] bg-[#CCFBF1]/30'
          : 'border-[#E2E8F0] bg-[var(--rushd-surface-alt)] hover:border-[#0EA5A4] hover:bg-[#CCFBF1]/20'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        onChange={handleFileSelect}
        className="hidden"
      />
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-white mb-3">
        <Upload className="w-7 h-7 text-[#0EA5A4]" />
      </div>
      <p className="font-semibold text-[#0F172A] mb-1">اسحب سيرتك الذاتية هنا أو اضغط للرفع</p>
      <p className="text-sm text-[#64748B]">PDF أو DOCX — الحد الأقصى 5 ميجابايت</p>
    </div>
  )
}
