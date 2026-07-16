import { useState } from 'react'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { toReaderFontDisplayName, toReaderFontFamily } from './readerFonts'
import { useReaderSystemFonts } from './useReaderSystemFonts'
import { formatFontDownloadSize } from './readerFontCatalog'
import { toStoredReaderFontFamily } from './readerFontService'
import { useIsCoarsePointer } from '@/hooks/useIsCoarsePointer'
import styles from './ReaderView.module.css'

const THEME_IDS = ['light', 'dark', 'sepia', 'green'] as const
const THEME_LABELS: Record<(typeof THEME_IDS)[number], string> = {
    light: '亮色',
    dark: '深色',
    sepia: '护眼',
    green: '青绿',
}
const TEXT_ALIGN_OPTIONS = [
    { label: '左对齐', value: 'left' as const },
    { label: '两端对齐', value: 'justify' as const },
    { label: '居中', value: 'center' as const },
] as const

export function ReaderAppearanceSettings() {
    const settings = useSettingsStore()
    // 屏幕亮度靠 app 内遮罩降亮，仅对触屏有意义；桌面隐藏此滑块，值恒当 1。
    const isCoarsePointer = useIsCoarsePointer()
    const {
        catalog,
        downloadFont,
        fontError,
        fontOperationId,
        importFont,
        loadingFonts,
        removeFont,
        storedFonts,
        systemFonts,
    } = useReaderSystemFonts()
    const [tempTextColor, setTempTextColor] = useState<string | null>(null)
    const [textPickerDirty, setTextPickerDirty] = useState(false)
    const [tempBgColor, setTempBgColor] = useState<string | null>(null)
    const [bgPickerDirty, setBgPickerDirty] = useState(false)
    const currentFontName = toReaderFontDisplayName(settings.fontFamily)
    const selectedStoredFont = storedFonts.find((font) => settings.fontFamily.includes(`"${font.family}"`))
    const importedFonts = storedFonts.filter((font) => font.source === 'import')

    const selectStoredFont = (font: (typeof storedFonts)[number]) => {
        settings.updateSetting('fontFamily', toStoredReaderFontFamily(font))
    }

    const deleteStoredFont = async (font: (typeof storedFonts)[number]) => {
        await removeFont(font.id)
        if (settings.fontFamily.includes(`"${font.family}"`)) {
            settings.updateSetting('fontFamily', 'inherit')
        }
    }

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
                        >
                            <span className={styles.themeLabel}>{THEME_LABELS[themeId]}</span>
                        </button>
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
                <label>系统字体</label>
                {loadingFonts ? (
                    <div className={styles.fontLoading}>加载字体列表中...</div>
                ) : (
                    <select
                        className={styles.fontSelect}
                        value={selectedStoredFont ? '' : currentFontName}
                        onChange={(event) => settings.updateSetting('fontFamily', toReaderFontFamily(event.target.value))}
                    >
                        {selectedStoredFont && <option value="">当前：{selectedStoredFont.displayName}</option>}
                        {systemFonts.map((fontName) => (
                            <option key={fontName} value={fontName} style={{ fontFamily: fontName === '系统默认' ? 'inherit' : fontName }}>
                                {fontName}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            <div className={styles.settingsGroup}>
                <label>可下载字体</label>
                <div className={styles.fontLibrary}>
                    {catalog.map((font) => {
                        const installed = storedFonts.find((entry) => entry.catalogId === font.id)
                        const busy = fontOperationId === font.id || fontOperationId === installed?.id
                        const selected = installed ? settings.fontFamily.includes(`"${installed.family}"`) : false
                        return (
                            <div key={font.id} className={`${styles.fontLibraryItem} ${selected ? styles.fontLibraryItemActive : ''}`}>
                                <div className={styles.fontLibraryMeta}>
                                    <strong style={{ fontFamily: installed ? toStoredReaderFontFamily(installed) : undefined }}>{font.displayName}</strong>
                                    <span>{formatFontDownloadSize(font.sizeBytes)} · {font.license}</span>
                                </div>
                                <div className={styles.fontLibraryActions}>
                                    {installed ? (
                                        <>
                                            <button type="button" onClick={() => selectStoredFont(installed)} disabled={selected || busy}>{selected ? '使用中' : '使用'}</button>
                                            <button type="button" onClick={() => void deleteStoredFont(installed)} disabled={busy}>删除</button>
                                        </>
                                    ) : (
                                        <button type="button" onClick={() => void downloadFont(font.id)} disabled={busy}>{busy ? '下载中…' : '下载'}</button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className={styles.settingsGroup}>
                <div className={styles.fontSectionHeader}>
                    <label>我的字体</label>
                    <button type="button" className={styles.importFontBtn} onClick={() => void importFont()} disabled={fontOperationId === 'import'}>
                        {fontOperationId === 'import' ? '导入中…' : '导入字体'}
                    </button>
                </div>
                {importedFonts.length === 0 ? (
                    <p className={styles.fontEmpty}>可从“文件”导入 TTF、OTF、WOFF 或 WOFF2 字体。</p>
                ) : (
                    <div className={styles.fontLibrary}>
                        {importedFonts.map((font) => {
                            const selected = settings.fontFamily.includes(`"${font.family}"`)
                            const busy = fontOperationId === font.id
                            return (
                                <div key={font.id} className={`${styles.fontLibraryItem} ${selected ? styles.fontLibraryItemActive : ''}`}>
                                    <div className={styles.fontLibraryMeta}>
                                        <strong style={{ fontFamily: toStoredReaderFontFamily(font) }}>{font.displayName}</strong>
                                        <span>{formatFontDownloadSize(font.sizeBytes)} · {font.format.toUpperCase()}</span>
                                    </div>
                                    <div className={styles.fontLibraryActions}>
                                        <button type="button" onClick={() => selectStoredFont(font)} disabled={selected || busy}>{selected ? '使用中' : '使用'}</button>
                                        <button type="button" onClick={() => void deleteStoredFont(font)} disabled={busy}>删除</button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
                {fontError && <p className={styles.fontError} role="alert">{fontError}</p>}
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
            {isCoarsePointer && (
                <RangeControl label={`屏幕亮度: ${settings.brightness.toFixed(2)}`} min={0.3} max={1} step={0.05} value={settings.brightness} onChange={(value) => settings.updateSetting('brightness', value)} />
            )}

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

            <div className={styles.settingsGroup}>
                <label>状态栏内容</label>
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
