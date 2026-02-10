import { create } from 'zustand'

interface ReaderStore {
    currentBookId: string | null
    isLoading: boolean
    isTocOpen: boolean
    isSettingsOpen: boolean
    currentChapter: string
    progress: number   // 0-100

    setBook: (id: string) => void
    setLoading: (loading: boolean) => void
    toggleToc: () => void
    toggleSettings: () => void
    updateProgress: (chapter: string, percentage: number) => void
}

export const useReaderStore = create<ReaderStore>((set) => ({
    currentBookId: null,
    isLoading: false,
    isTocOpen: false,
    isSettingsOpen: false,
    currentChapter: '',
    progress: 0,

    setBook: (id) => set({ currentBookId: id, isLoading: true }),
    setLoading: (loading) => set({ isLoading: loading }),
    toggleToc: () => set((s) => ({ isTocOpen: !s.isTocOpen, isSettingsOpen: false })),
    toggleSettings: () => set((s) => ({ isSettingsOpen: !s.isSettingsOpen, isTocOpen: false })),
    updateProgress: (chapter, percentage) =>
        set({ currentChapter: chapter, progress: percentage }),
}))
