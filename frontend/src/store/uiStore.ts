import { create } from 'zustand'

interface UIState {
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void

  jobFilters: {
    search: string
    workType: string
    location: string
  }
  setJobFilters: (filters: Partial<UIState['jobFilters']>) => void
  resetJobFilters: () => void

  copilotOpen: boolean
  toggleCopilot: () => void
}

const defaultFilters = {
  search: '',
  workType: '',
  location: '',
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  jobFilters: { ...defaultFilters },
  setJobFilters: (filters) =>
    set((state) => ({
      jobFilters: { ...state.jobFilters, ...filters },
    })),
  resetJobFilters: () => set({ jobFilters: { ...defaultFilters } }),

  copilotOpen: false,
  toggleCopilot: () => set((state) => ({ copilotOpen: !state.copilotOpen })),
}))
