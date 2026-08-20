import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, LogOut, Menu, User } from 'lucide-react'
import Sidebar from './Sidebar'
import Avatar from '../ui/Avatar'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from '@/store/i18nStore'

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const { t, dir } = useTranslation()

  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-[var(--rushd-surface-alt)]" dir={dir}>
      <Sidebar
        currentPath={location.pathname}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#E2E8F0] bg-white px-4 lg:px-6">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="cursor-pointer rounded-lg p-2 text-[#64748B] hover:bg-[var(--rushd-surface-alt)] hover:text-[var(--rushd-ink-soft)] lg:hidden"
            aria-label={t('sidebar.brand')}
          >
            <Menu className="h-5 w-5" />
          </button>

          <h1 className="text-lg font-bold text-[#0EA5A4] lg:hidden">{t('sidebar.brand')}</h1>
          <div className="hidden lg:block" />

          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((open) => !open)}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--rushd-surface-alt)]"
            >
              <Avatar name={user?.name ?? t('common.user')} size="sm" />
              <span className="hidden text-sm font-medium text-[#0F172A] sm:block">
                {user?.name ?? t('common.user')}
              </span>
              <ChevronDown className="h-4 w-4 text-[#64748B]" />
            </button>

            {userMenuOpen && (
              <>
                <button
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setUserMenuOpen(false)}
                  aria-label={t('common.close')}
                />
                <div className="absolute start-0 top-full z-20 mt-1 w-48 rounded-lg border border-[#E2E8F0] bg-white py-1 shadow-lg">
                  <Link
                    to="/settings"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-[#0F172A] hover:bg-[var(--rushd-surface-alt)]"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <User className="h-4 w-4" />
                    {t('sidebar.settings')}
                  </Link>
                  <button
                    className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-sm text-[#EF4444] hover:bg-red-50"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" />
                    {t('sidebar.logout')}
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
