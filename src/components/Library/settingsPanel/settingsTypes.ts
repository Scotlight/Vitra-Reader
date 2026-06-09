import type { ReaderSettings } from '@/stores/useSettingsStore'

export interface SettingsFormStore extends ReaderSettings {
    updateSetting: <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => void
}
