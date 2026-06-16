import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

import AppLayout from '@/components/layout/AppLayout'
import AuthLayout from '@/components/layout/AuthLayout'

import AuthPage from '@/pages/AuthPage'
import OnboardingPage from '@/pages/OnboardingPage'
import DashboardPage from '@/pages/DashboardPage'
import JobsPage from '@/pages/JobsPage'
import JobDetailPage from '@/pages/JobDetailPage'
import SavedJobsPage from '@/pages/SavedJobsPage'
import ApplicationsPage from '@/pages/ApplicationsPage'
import ResumePage from '@/pages/ResumePage'
import CopilotPage from '@/pages/CopilotPage'
import SettingsPage from '@/pages/SettingsPage'
import GoogleCallbackPage from '@/pages/GoogleCallbackPage'
import BillingPage from '@/pages/BillingPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
})

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/auth" replace />
  return <>{children}</>
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { isAuthenticated, loadUser } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) {
      loadUser()
    }
  }, [isAuthenticated, loadUser])

  return (
    <Routes>
      <Route path="/" element={
        <GuestRoute><Navigate to="/auth" replace /></GuestRoute>
      } />

      <Route element={<AuthLayout />}>
        <Route path="/login" element={
          <Navigate to="/auth" replace />
        } />
        <Route path="/signup" element={
          <Navigate to="/auth?mode=signup" replace />
        } />
        <Route path="/auth" element={
          <GuestRoute><AuthPage /></GuestRoute>
        } />
      </Route>

      <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />

      <Route path="/onboarding" element={
        <ProtectedRoute><OnboardingPage /></ProtectedRoute>
      } />

      <Route element={
        <ProtectedRoute><AppLayout /></ProtectedRoute>
      }>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route path="/saved" element={<SavedJobsPage />} />
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/resume" element={<ResumePage />} />
        <Route path="/copilot" element={<CopilotPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/billing" element={<BillingPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
