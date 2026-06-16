import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import type { ParsedResume } from '@/lib/types'

interface ResumePreviewProps {
  parsed: ParsedResume
}

export default function ResumePreview({ parsed }: ResumePreviewProps) {
  return (
    <div className="space-y-4">
      {parsed.summary && (
        <Card>
          <h3 className="text-lg font-bold text-[#0F172A] mb-3">الملخص</h3>
          <p className="text-sm text-[#64748B] leading-relaxed">{parsed.summary}</p>
        </Card>
      )}

      {parsed.skills && parsed.skills.length > 0 && (
        <Card>
          <h3 className="text-lg font-bold text-[#0F172A] mb-3">المهارات</h3>
          <div className="flex flex-wrap gap-2">
            {parsed.skills.map((skill, idx) => (
              <Badge key={idx} variant="default">
                {skill}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {parsed.experience && parsed.experience.length > 0 && (
        <Card>
          <h3 className="text-lg font-bold text-[#0F172A] mb-3">الخبرات</h3>
          <div className="space-y-4">
            {parsed.experience.map((exp, idx) => {
              if (typeof exp === 'string') {
                return (
                  <p key={idx} className="text-sm text-[#64748B]">
                    {exp}
                  </p>
                )
              }
              return (
                <div key={idx} className="border-r-2 border-[#0EA5A4] pr-3">
                  {exp.title && (
                    <p className="font-semibold text-[#0F172A]">{exp.title}</p>
                  )}
                  {exp.company && (
                    <p className="text-sm text-[#64748B]">{exp.company}</p>
                  )}
                  {exp.duration && (
                    <p className="text-xs text-[#64748B] mt-1">{exp.duration}</p>
                  )}
                  {exp.description && (
                    <p className="text-sm text-[#64748B] mt-2">{exp.description}</p>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {parsed.education && parsed.education.length > 0 && (
        <Card>
          <h3 className="text-lg font-bold text-[#0F172A] mb-3">التعليم</h3>
          <div className="space-y-3">
            {parsed.education.map((edu, idx) => {
              if (typeof edu === 'string') {
                return (
                  <p key={idx} className="text-sm text-[#64748B]">
                    {edu}
                  </p>
                )
              }
              return (
                <div key={idx}>
                  {edu.degree && (
                    <p className="font-semibold text-[#0F172A]">{edu.degree}</p>
                  )}
                  {edu.institution && (
                    <p className="text-sm text-[#64748B]">{edu.institution}</p>
                  )}
                  {edu.year && <p className="text-xs text-[#64748B]">{edu.year}</p>}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {parsed.languages && parsed.languages.length > 0 && (
        <Card>
          <h3 className="text-lg font-bold text-[#0F172A] mb-3">اللغات</h3>
          <div className="flex flex-wrap gap-2">
            {parsed.languages.map((lang, idx) => (
              <Badge key={idx} variant="neutral">
                {lang}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
