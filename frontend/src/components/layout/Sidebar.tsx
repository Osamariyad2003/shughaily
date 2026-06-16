import { Link } from 'react-router-dom'
import {
  Bookmark,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  FileUp,
  LayoutDashboard,
  MessageCircle,
  Settings,
  X,
} from 'lucide-react'
import { cn } from '../../lib/utils'

interface SidebarProps {
  currentPath: string
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  mobileOpen?: boolean
  onMobileClose?: () => void
}

const navItems = [
  { label: 'الرئيسية', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'الوظائف', icon: Briefcase, path: '/jobs' },
  { label: 'طلباتي', icon: FileText, path: '/applications' },
  { label: 'سيرتي الذاتية', icon: FileUp, path: '/resume' },
  { label: 'المحفوظات', icon: Bookmark, path: '/saved' },
  { label: 'المساعد', icon: MessageCircle, path: '/copilot' },
  { label: 'الفوترة', icon: CreditCard, path: '/billing' },
  { label: 'الإعدادات', icon: Settings, path: '/settings' },
]

export default function Sidebar({
  currentPath,
  collapsed = false,
  onCollapsedChange,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const isActive = (path: string) => currentPath === path || currentPath.startsWith(`${path}/`)

  const sidebarContent = (
    <div
      className={cn(
        'flex h-full flex-col border-l border-[#E2E8F0] bg-white transition-all duration-200',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
      dir="rtl"
    >
      <div className="flex h-16 items-center justify-between border-b border-[#E2E8F0] px-4">
        {!collapsed && <h1 className="text-xl font-bold text-[#0EA5A4]">الشغيلي</h1>}
        <button
          onClick={() => onCollapsedChange?.(!collapsed)}
          className="hidden cursor-pointer rounded-lg p-1.5 text-[#64748B] transition-colors hover:bg-[#F8FAFC] lg:flex"
          aria-label={collapsed ? 'توسيع القائمة' : 'تصغير القائمة'}
        >
          {collapsed ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </button>

        {mobileOpen && (
          <button
            onClick={onMobileClose}
            className="cursor-pointer rounded-lg p-1.5 text-[#64748B] hover:bg-[#F8FAFC] lg:hidden"
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {navItems.map((item) => {
          const Icon = item.icon

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onMobileClose}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive(item.path)
                  ? 'bg-[#CCFBF1] text-[#0F766E]'
                  : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]',
                collapsed && 'justify-center px-2',
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>
    </div>
  )

  return (
    <>
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebarContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/30" onClick={onMobileClose} aria-label="إغلاق" />
          <aside className="absolute right-0 top-0 z-50 h-full shadow-xl">{sidebarContent}</aside>
        </div>
      )}
    </>
  )
}
