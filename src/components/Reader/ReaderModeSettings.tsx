import { resolveReaderRenderMode } from '@/engine/core/readerRenderMode'
import { useSettingsStore, type PageTurnMode } from '@/stores/useSettingsStore'
import styles from './ReaderView.module.css'

interface ReaderModeSettingsProps {
    readonly bookFormat: string
    readonly onPageTurnModeChange: (mode: PageTurnMode) => void
}

export function ReaderModeSettings({ bookFormat, onPageTurnModeChange }: ReaderModeSettingsProps) {
    const settings = useSettingsStore()
    const modeDecision = resolveReaderRenderMode(bookFormat, settings.pageTurnMode)
    const effectivePageTurnMode = modeDecision.effectiveMode

    return (
        <div className={styles.settingsGroup}>
            <label>翻页模式</label>
            <div className={styles.toggleRow}>
                <ModeButton available={modeDecision.availableModes.includes('paginated-single')} active={effectivePageTurnMode === 'paginated-single'} label="单页" onClick={() => onPageTurnModeChange('paginated-single')} />
                <ModeButton available={modeDecision.availableModes.includes('paginated-double')} active={effectivePageTurnMode === 'paginated-double'} label="双页" onClick={() => onPageTurnModeChange('paginated-double')} />
                <ModeButton available={modeDecision.availableModes.includes('scrolled-continuous')} active={effectivePageTurnMode === 'scrolled-continuous'} label="连续滚动" onClick={() => onPageTurnModeChange('scrolled-continuous')} />
            </div>
            {modeDecision.forced && <div className={styles.modeHint}>{modeDecision.reason}</div>}
        </div>
    )
}

interface ModeButtonProps {
    readonly active: boolean
    readonly available: boolean
    readonly label: string
    readonly onClick: () => void
}

function ModeButton({ active, available, label, onClick }: ModeButtonProps) {
    return <button className={`${styles.toggleBtn} ${active ? styles.active : ''}`} disabled={!available} onClick={onClick}>{label}</button>
}
