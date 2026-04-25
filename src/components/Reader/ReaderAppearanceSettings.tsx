import { useState } from 'react'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { toReaderFontDisplayName, toReaderFontFamily } from './readerFonts'
import { useReaderSystemFonts } from './useReaderSystemFonts'
import styles from './ReaderView.module.css'

const THEME_IDS = ['light', 'dark', 'sepia', 'green'] as const
const TEXT_ALIGN_OPTIONS = [
    { label: '左对齐', value: 'left' as const },
    { label: '两端对齐', value: 'justify' as const },
    { label: '居中', value: 'center' as const },
] as const

export function ReaderAppearanceSettings() {
    const settings = useSettingsStore()
    const { loadingFonts, systemFonts } = useReaderSystemFonts()
    const [tempTextColor, setTempTextColor] = useState<string | null>(null)
    const [textPickerDirty, setTextPickerDirty] = useState(false)
    const [tempBgColor, setTempBgColor] = useState<string | null>(null)
    const [bgPickerDirty, setBgPickerDirty] = useState(false)
    const currentFontName = toReaderFontDisplayName(settings.fontFamily)

    return (
        <>
            <div className={styles.settingsGroup}>
                <label>主题模式</label>
                <div className={styles.themeGrid}>
                    {THEME_IDS.map((themeId) => (
                        <button
                            key={themeId}
                            className={`${styles.themeBtn} ${settings.themeId === themeId ? styles.activeTheme : ''}`}
                            onClick={() => settings.updateSetting('themeId', themeId)}
                            data-theme-preview={themeId}
                        />
                    ))}
                </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.settingsGroup}>
                <label>文字颜色</label>
                <div className={styles.colorPalette}>
                    <label className={styles.colorPickerCircle} style={tempTextColor ? { borderColor: tempTextColor } : undefined} title="自定义颜色">
                        <input
                            type="color"
                            value={tempTextColor ?? settings.customTextColor ?? (settings.themeId === 'dark' ? '#e0e0e0' : '#1a1a1a')}
                            onInput={(event) => {
                                setTempTextColor((event.target as HTMLInputElement).value)
                                setTextPickerDirty(true)
                            }}
                            onChange={() => {}}
                        />
                        {textPickerDirty ? <span className={styles.pickerPreview} style={{ background: tempTextColor! }} /> : <span>+</span>}
                    </label>
                    {textPickerDirty && (
                        <button
                            className={styles.confirmBtn}
                            title="确认颜色"
                            onClick={() => {
                                if (tempTextColor) {
                                    settings.updateSetting('customTextColor', tempTextColor)
                                    settings.addSavedColor('text', tempTextColor)
                                }
                                setTextPickerDirty(false)
                            }}
                        >✓</button>
                    )}
                    {textPickerDirty && (
                        <button
                            className={styles.cancelBtn}
                            title="取消"
                            onClick={() => {
                                setTempTextColor(settings.customTextColor)
                                setTextPickerDirty(false)
                            }}
                        >✕</button>
                    )}
                    <button
                        className={`${styles.colorCircle} ${!settings.customTextColor ? styles.colorCircleActive : ''}`}
                        title="默认"
                        onClick={() => {
                            settings.updateSetting('customTextColor', null)
                            setTempTextColor(null)
                            setTextPickerDirty(false)
                        }}
                    >
                        <span className={styles.circleInner} style={{ background: settings.themeId === 'dark' ? '#e0e0e0' : '#1a1a1a' }} />
                        {!settings.customTextColor && <span className={styles.checkMark}>✓</span>}
                    </button>
                    {settings.savedTextColors.map((color) => (
                        <button
                            key={color}
                            className={`${styles.colorCircle} ${settings.customTextColor?.toLowerCase() === color.toLowerCase() ? styles.colorCircleActive : ''}`}
                            title={color}
                            onClick={() => {
                                setTempTextColor(color)
                                settings.updateSetting('customTextColor', color)
                                setTextPickerDirty(false)
                            }}
                        >
                            <span className={styles.circleInner} style={{ background: color }} />
                            {settings.customTextColor?.toLowerCase() === color.toLowerCase() && <span className={styles.checkMark}>✓</span>}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.settingsGroup}>
                <label>背景颜色</label>
                <div className={styles.colorPalette}>
                    <label className={styles.colorPickerCircle} style={tempBgColor ? { borderColor: tempBgColor } : undefined} title="自定义颜色">
                        <input
                            type="color"
                            value={tempBgColor ?? settings.customBgColor ?? '#ffffff'}
                            onInput={(event) => {
                                setTempBgColor((event.target as HTMLInputElement).value)
                                setBgPickerDirty(true)
                            }}
                            onChange={() => {}}
                        />
                        {bgPickerDirty ? <span className={styles.pickerPreview} style={{ background: tempBgColor! }} /> : <span>+</span>}
                    </label>
                    {bgPickerDirty && (
                        <button
                            className={styles.confirmBtn}
                            title="确认颜色"
                            onClick={() => {
                                if (tempBgColor) {
                                    settings.updateSetting('customBgColor', tempBgColor)
                                    settings.addSavedColor('bg', tempBgColor)
                                }
                                setBgPickerDirty(false)
                            }}
                        >✓</button>
                    )}
                    {bgPickerDirty && (
                        <button
                            className={styles.cancelBtn}
                            title="取消"
                            onClick={() => {
                                setTempBgColor(settings.customBgColor)
                                setBgPickerDirty(false)
                            }}
                        >✕</button>
                    )}
                    <button
                        className={`${styles.colorCircle} ${!settings.customBgColor ? styles.colorCircleActive : ''}`}
                        title="默认"
                        onClick={() => {
                            settings.updateSetting('customBgColor', null)
                            setTempBgColor(null)
                            setBgPickerDirty(false)
                        }}
                    >
                        <span className={styles.circleInner} style={{ background: '#ffffff' }} />
                        {!settings.customBgColor && <span className={styles.checkMark}>✓</span>}
                    </button>
                    {settings.savedBgColors.map((color) => (
                        <button
                            key={color}
                            className={`${styles.colorCircle} ${settings.customBgColor?.toLowerCase() === color.toLowerCase() ? styles.colorCircleActive : ''}`}
                            title={color}
                            onClick={() => {
                                settings.updateSetting('customBgColor', color)
                                setTempBgColor(null)
                                setBgPickerDirty(false)
                            }}
                        >
                            <span className={styles.circleInner} style={{ background: color }} />
                            {settings.customBgColor?.toLowerCase() === color.toLowerCase() && <span className={styles.checkMark}>✓</span>}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.settingsGroup}>
                <label>字体风格</label>
                {loadingFonts ? (
                    <div className={styles.fontLoading}>加载字体列表中...</div>
                ) : (
                    <select className={styles.fontSelect} value={currentFontName} onChange={(event) => settings.updateSetting('fontFamily', toReaderFontFamily(event.target.value))}>
                        {systemFonts.map((fontName) => (
                            <option key={fontName} value={fontName} style={{ fontFamily: fontName === '系统默认' ? 'inherit' : fontName }}>
                                {fontName}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            <RangeControl label={`字号: ${settings.fontSize}px`} min={12} max={36} step={1} value={settings.fontSize} onChange={(value) => settings.updateSetting('fontSize', value)} />
            <RangeControl label={`行距: ${settings.lineHeight.toFixed(1)}`} min={1} max={3.5} step={0.1} value={settings.lineHeight} onChange={(value) => settings.updateSetting('lineHeight', value)} />
            <RangeControl label={`字间距: ${settings.letterSpacing}`} min={0} max={20} step={1} value={settings.letterSpacing} onChange={(value) => settings.updateSetting('letterSpacing', value)} />
            <RangeControl label={`段间距: ${settings.paragraphSpacing}`} min={0} max={120} step={1} value={settings.paragraphSpacing} onChange={(value) => settings.updateSetting('paragraphSpacing', value)} />

            <div className={styles.settingsGroup}>
                <label>正文首行缩进</label>
                <div className={styles.toggleRow}>
                    <button className={`${styles.toggleBtn} ${!settings.paragraphIndentEnabled ? styles.active : ''}`} onClick={() => settings.updateSetting('paragraphIndentEnabled', false)}>关闭</button>
                    <button className={`${styles.toggleBtn} ${settings.paragraphIndentEnabled ? styles.active : ''}`} onClick={() => settings.updateSetting('paragraphIndentEnabled', true)}>开启</button>
                </div>
            </div>

            <RangeControl label={`页面宽度: ${settings.pageWidth.toFixed(1)}`} min={0.5} max={3} step={0.1} value={settings.pageWidth} onChange={(value) => settings.updateSetting('pageWidth', value)} />
            <RangeControl label={`屏幕亮度: ${settings.brightness.toFixed(2)}`} min={0.3} max={1} step={0.05} value={settings.brightness} onChange={(value) => settings.updateSetting('brightness', value)} />

            <div className={styles.settingsGroup}>
                <label>对齐方式</label>
                <div className={styles.toggleRow}>
                    {TEXT_ALIGN_OPTIONS.map((option) => (
                        <button key={option.value} className={`${styles.toggleBtn} ${settings.textAlign === option.value ? styles.active : ''}`} onClick={() => settings.updateSetting('textAlign', option.value)}>
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            <RangeControl label={`顶部栏高度: ${settings.headerHeight}px`} min={0} max={96} step={4} value={settings.headerHeight} onChange={(value) => settings.updateSetting('headerHeight', value)} />
            <RangeControl label={`底部栏高度: ${settings.footerHeight}px`} min={0} max={96} step={4} value={settings.footerHeight} onChange={(value) => settings.updateSetting('footerHeight', value)} />

            <div className={styles.settingsGroup}>
                <label>底部栏内容</label>
                <div className={styles.toggleColumn}>
                    <FooterToggle label="显示阅读进度" checked={settings.showFooterProgress} onChange={(checked) => settings.updateSetting('showFooterProgress', checked)} />
                    <FooterToggle label="显示章节名称" checked={settings.showFooterChapter} onChange={(checked) => settings.updateSetting('showFooterChapter', checked)} />
                    <FooterToggle label="显示时间" checked={settings.showFooterTime} onChange={(checked) => settings.updateSetting('showFooterTime', checked)} />
                </div>
            </div>
        </>
    )
}

interface RangeControlProps {
    readonly label: string
    readonly min: number
    readonly max: number
    readonly step: number
    readonly value: number
    readonly onChange: (value: number) => void
}

function RangeControl({ label, min, max, step, value, onChange }: RangeControlProps) {
    return (
        <div className={styles.settingsGroup}>
            <label>{label}</label>
            <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        </div>
    )
}

interface FooterToggleProps {
    readonly checked: boolean
    readonly label: string
    readonly onChange: (checked: boolean) => void
}

function FooterToggle({ checked, label, onChange }: FooterToggleProps) {
    return (
        <label className={styles.checkboxLabel}>
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
            {label}
        </label>
    )
}
