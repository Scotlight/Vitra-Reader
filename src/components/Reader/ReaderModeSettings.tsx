import { clampDecimal, clampInt } from '../../utils/mathUtils'
import { resolveReaderRenderMode } from '../../engine'
import { useSettingsStore, type PageTurnMode } from '../../stores/useSettingsStore'
import styles from './ReaderView.module.css'

const SMOOTH_DEFAULTS = Object.freeze({
    stepSizePx: 120,
    animationTimeMs: 360,
    accelerationDeltaMs: 70,
    accelerationMax: 7,
    tailToHeadRatio: 3,
    easing: true,
    reverseWheelDirection: false,
})

interface ReaderModeSettingsProps {
    readonly bookFormat: string
}

export function ReaderModeSettings({ bookFormat }: ReaderModeSettingsProps) {
    const settings = useSettingsStore()
    const modeDecision = resolveReaderRenderMode(bookFormat, settings.pageTurnMode)
    const effectivePageTurnMode = modeDecision.effectiveMode

    const resetSmoothSettings = () => {
        settings.updateSetting('smoothStepSizePx', SMOOTH_DEFAULTS.stepSizePx)
        settings.updateSetting('smoothAnimationTimeMs', SMOOTH_DEFAULTS.animationTimeMs)
        settings.updateSetting('smoothAccelerationDeltaMs', SMOOTH_DEFAULTS.accelerationDeltaMs)
        settings.updateSetting('smoothAccelerationMax', SMOOTH_DEFAULTS.accelerationMax)
        settings.updateSetting('smoothTailToHeadRatio', SMOOTH_DEFAULTS.tailToHeadRatio)
        settings.updateSetting('smoothAnimationEasing', SMOOTH_DEFAULTS.easing)
        settings.updateSetting('smoothReverseWheelDirection', SMOOTH_DEFAULTS.reverseWheelDirection)
    }

    return (
        <>
            <div className={styles.settingsGroup}>
                <label>翻页模式</label>
                <div className={styles.toggleRow}>
                    <ModeButton available={modeDecision.availableModes.includes('paginated-single')} active={effectivePageTurnMode === 'paginated-single'} label="单页" onClick={() => settings.updateSetting('pageTurnMode', 'paginated-single' as PageTurnMode)} />
                    <ModeButton available={modeDecision.availableModes.includes('paginated-double')} active={effectivePageTurnMode === 'paginated-double'} label="双页" onClick={() => settings.updateSetting('pageTurnMode', 'paginated-double' as PageTurnMode)} />
                    <ModeButton available={modeDecision.availableModes.includes('scrolled-continuous')} active={effectivePageTurnMode === 'scrolled-continuous'} label="连续滚动" onClick={() => settings.updateSetting('pageTurnMode', 'scrolled-continuous' as PageTurnMode)} />
                </div>
                {modeDecision.forced && <div className={styles.modeHint}>{modeDecision.reason}</div>}
            </div>

            {effectivePageTurnMode === 'scrolled-continuous' && (
                <>
                    <div className={styles.divider} />
                    <div className={styles.settingsGroup}>
                        <div className={styles.smoothHeader}>
                            <span className={styles.smoothTitle}>平滑滚动</span>
                            <label className={styles.smoothToggle}>
                                <input type="checkbox" checked={settings.smoothScrollEnabled} onChange={(event) => settings.updateSetting('smoothScrollEnabled', event.target.checked)} />
                                <span className={styles.smoothToggleTrack} />
                            </label>
                        </div>
                    </div>

                    <SmoothRange label={`步长: ${settings.smoothStepSizePx}px`} value={settings.smoothStepSizePx} min={20} max={300} step={1} enabled={settings.smoothScrollEnabled} onChange={(value) => settings.updateSetting('smoothStepSizePx', clampInt(value, 20, 300))} />
                    <SmoothRange label={`动画时长: ${settings.smoothAnimationTimeMs}ms`} value={settings.smoothAnimationTimeMs} min={120} max={1200} step={10} enabled={settings.smoothScrollEnabled} onChange={(value) => settings.updateSetting('smoothAnimationTimeMs', clampInt(value, 120, 1200))} />
                    <SmoothRange label={`加速间隔: ${settings.smoothAccelerationDeltaMs}ms`} value={settings.smoothAccelerationDeltaMs} min={10} max={400} step={5} enabled={settings.smoothScrollEnabled} onChange={(value) => settings.updateSetting('smoothAccelerationDeltaMs', clampInt(value, 10, 400))} />
                    <SmoothRange label={`加速上限: ${settings.smoothAccelerationMax}x`} value={settings.smoothAccelerationMax} min={1} max={12} step={0.1} enabled={settings.smoothScrollEnabled} onChange={(value) => settings.updateSetting('smoothAccelerationMax', clampDecimal(value, 1, 12, 1))} />
                    <SmoothRange label={`尾首比值: ${settings.smoothTailToHeadRatio}x`} value={settings.smoothTailToHeadRatio} min={1} max={8} step={0.1} enabled={settings.smoothScrollEnabled} onChange={(value) => settings.updateSetting('smoothTailToHeadRatio', clampDecimal(value, 1, 8, 1))} />

                    <div className={styles.smoothCheckList}>
                        <label className={styles.smoothCheckItem}>
                            <input type="checkbox" checked={settings.smoothAnimationEasing} disabled={!settings.smoothScrollEnabled} onChange={(event) => settings.updateSetting('smoothAnimationEasing', event.target.checked)} />
                            缓动曲线
                        </label>
                        <label className={styles.smoothCheckItem}>
                            <input type="checkbox" checked={settings.smoothReverseWheelDirection} disabled={!settings.smoothScrollEnabled} onChange={(event) => settings.updateSetting('smoothReverseWheelDirection', event.target.checked)} />
                            反转滚轮方向
                        </label>
                    </div>

                    <button className={styles.smallActionBtn} onClick={resetSmoothSettings} disabled={!settings.smoothScrollEnabled}>重置为推荐值</button>
                </>
            )}

            <div className={styles.divider} />
            <div className={styles.settingsGroup}>
                <label>背景模糊: {settings.uiBlurStrength}px</label>
                <input type="range" min="0" max="40" step="1" value={settings.uiBlurStrength} onChange={(event) => settings.updateSetting('uiBlurStrength', Number(event.target.value))} />
            </div>
            <div className={styles.settingsGroup}>
                <label>面板透明: {Math.round(settings.uiOpacity * 100)}%</label>
                <input type="range" min="0.5" max="1" step="0.05" value={settings.uiOpacity} onChange={(event) => settings.updateSetting('uiOpacity', Number(event.target.value))} />
            </div>
        </>
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

interface SmoothRangeProps {
    readonly enabled: boolean
    readonly label: string
    readonly max: number
    readonly min: number
    readonly onChange: (value: number) => void
    readonly step: number
    readonly value: number
}

function SmoothRange({ enabled, label, max, min, onChange, step, value }: SmoothRangeProps) {
    return (
        <div className={styles.settingsGroup}>
            <label>{label}</label>
            <input type="range" min={min} max={max} step={step} value={value} disabled={!enabled} onChange={(event) => onChange(Number(event.target.value))} />
        </div>
    )
}
