import { useState } from 'react'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { SyncSettingsTab } from './settingsPanel/SyncSettingsTab'
import { TranslateSettingsTab } from './settingsPanel/TranslateSettingsTab'
import styles from './LibraryView.module.css'

interface SettingsPanelProps {
    systemFonts: string[]
    loadingFonts: boolean
    onClose: () => void
}

export const SettingsPanel = ({ systemFonts, loadingFonts, onClose }: SettingsPanelProps) => {
    const settings = useSettingsStore()

    const [settingsTab, setSettingsTab] = useState<'theme' | 'ui' | 'reading' | 'sync' | 'translate'>('theme')
    const [tempTextColor, setTempTextColor] = useState<string | null>(null)

    const safeFontFamily = typeof settings.fontFamily === 'string' ? settings.fontFamily : 'inherit'
    const selectedFontValue =
        safeFontFamily === 'inherit'
            ? '系统默认'
            : safeFontFamily.replace(/^"([^"]+)".*$/, '$1')


    return (
        <div className={styles.settingsModalOverlay} onClick={onClose}>
            <div className={styles.settingsPanel} onClick={(event) => event.stopPropagation()}>
                <div className={styles.settingsHeader}>
                    <h3>主界面设置</h3>
                    <button className={styles.closeBtn} onClick={onClose}>×</button>
                </div>
                <div className={styles.tabRow}>
                    <button className={`${styles.tabBtn} ${settingsTab === 'theme' ? styles.tabBtnActive : ''}`} onClick={() => setSettingsTab('theme')}>主题</button>
                    <button className={`${styles.tabBtn} ${settingsTab === 'ui' ? styles.tabBtnActive : ''}`} onClick={() => setSettingsTab('ui')}>界面</button>
                    <button className={`${styles.tabBtn} ${settingsTab === 'reading' ? styles.tabBtnActive : ''}`} onClick={() => setSettingsTab('reading')}>阅读</button>
                    <button className={`${styles.tabBtn} ${settingsTab === 'sync' ? styles.tabBtnActive : ''}`} onClick={() => setSettingsTab('sync')}>同步和备份</button>
                    <button className={`${styles.tabBtn} ${settingsTab === 'translate' ? styles.tabBtnActive : ''}`} onClick={() => setSettingsTab('translate')}>翻译</button>
                </div>

                {settingsTab === 'theme' && (
                    <>
                        <div className={styles.themeRow}>
                            <button
                                className={`${styles.themeBtn} ${settings.themeId === 'light' ? styles.activeTheme : ''}`}
                                style={{ background: '#ffffff' }}
                                onClick={() => settings.updateSetting('themeId', 'light')}
                                title="浅色"
                            />
                            <button
                                className={`${styles.themeBtn} ${settings.themeId === 'dark' ? styles.activeTheme : ''}`}
                                style={{ background: '#1a1a2e' }}
                                onClick={() => settings.updateSetting('themeId', 'dark')}
                                title="深色"
                            />
                            <button
                                className={`${styles.themeBtn} ${settings.themeId === 'sepia' ? styles.activeTheme : ''}`}
                                style={{ background: '#f4ecd8' }}
                                onClick={() => settings.updateSetting('themeId', 'sepia')}
                                title="护眼"
                            />
                            <button
                                className={`${styles.themeBtn} ${settings.themeId === 'green' ? styles.activeTheme : ''}`}
                                style={{ background: '#c7edcc' }}
                                onClick={() => settings.updateSetting('themeId', 'green')}
                                title="绿色"
                            />
                        </div>
                        <label className={styles.settingRow}>
                            <span>{`字号 ${settings.fontSize}px`}</span>
                            <input
                                type="range"
                                min={13}
                                max={40}
                                value={settings.fontSize}
                                onChange={(event) => settings.updateSetting('fontSize', Number(event.target.value))}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>{`行距 ${settings.lineHeight.toFixed(1)}`}</span>
                            <input
                                type="range"
                                min={1}
                                max={3.5}
                                step={0.1}
                                value={settings.lineHeight}
                                onChange={(event) => settings.updateSetting('lineHeight', Number(event.target.value))}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>{`字距 ${settings.letterSpacing}px`}</span>
                            <input
                                type="range"
                                min={0}
                                max={20}
                                value={settings.letterSpacing}
                                onChange={(event) => settings.updateSetting('letterSpacing', Number(event.target.value))}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>{`段距 ${settings.paragraphSpacing}px`}</span>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={settings.paragraphSpacing}
                                onChange={(event) => settings.updateSetting('paragraphSpacing', Number(event.target.value))}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>背景色</span>
                            <input
                                type="color"
                                value={settings.customBgColor ?? '#ffffff'}
                                onChange={(event) => settings.updateSetting('customBgColor', event.target.value)}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>文字色</span>
                            <input
                                type="color"
                                value={tempTextColor ?? settings.customTextColor ?? '#1a1a1a'}
                                onChange={(event) => setTempTextColor(event.target.value)}
                                onMouseUp={(event) => {
                                    const target = event.target as HTMLInputElement
                                    settings.updateSetting('customTextColor', target.value)
                                    setTempTextColor(null)
                                }}
                            />
                        </label>
                        <div className={styles.rowActions}>
                            <button className={styles.smallBtn} onClick={() => {
                                settings.updateSetting('customBgColor', null)
                            }}>重置背景色</button>
                            <button className={styles.smallBtn} onClick={() => {
                                settings.updateSetting('customTextColor', null)
                                setTempTextColor(null)
                            }}>重置文字色</button>
                        </div>
                    </>
                )}

                {settingsTab === 'ui' && (
                    <>
                        <label className={styles.settingRow}>
                            <span>圆角</span>
                            <input
                                type="range"
                                min={0}
                                max={24}
                                value={settings.uiRoundness}
                                onChange={(event) => settings.updateSetting('uiRoundness', Number(event.target.value))}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>毛玻璃强度</span>
                            <input
                                type="range"
                                min={0}
                                max={40}
                                value={settings.uiBlurStrength}
                                onChange={(event) => settings.updateSetting('uiBlurStrength', Number(event.target.value))}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>透明度</span>
                            <input
                                type="range"
                                min={0.4}
                                max={1}
                                step={0.05}
                                value={settings.uiOpacity}
                                onChange={(event) => settings.updateSetting('uiOpacity', Number(event.target.value))}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>界面材质</span>
                            <select
                                value={settings.uiMaterial}
                                onChange={(event) => settings.updateSetting('uiMaterial', event.target.value as typeof settings.uiMaterial)}
                            >
                                <option value="default">默认</option>
                                <option value="mica">Mica</option>
                                <option value="acrylic">Acrylic</option>
                            </select>
                        </label>
                        <label className={styles.settingRow}>
                            <span>界面动画</span>
                            <input
                                type="checkbox"
                                checked={settings.uiAnimation}
                                onChange={(event) => settings.updateSetting('uiAnimation', event.target.checked)}
                            />
                        </label>
                    </>
                )}

                {settingsTab === 'reading' && (
                    <>
                        <label className={styles.settingRow}>
                            <span>字体</span>
                            {loadingFonts ? (
                                <span className={styles.fontLoading}>加载字体中...</span>
                            ) : (
                                <select
                                    value={selectedFontValue}
                                    onChange={(event) => {
                                        const selected = event.target.value
                                        if (selected === '系统默认') {
                                            settings.updateSetting('fontFamily', 'inherit')
                                        } else {
                                            settings.updateSetting('fontFamily', `"${selected}", sans-serif`)
                                        }
                                    }}
                                >
                                    {systemFonts.map((font) => (
                                        <option key={font} value={font}>{font}</option>
                                    ))}
                                </select>
                            )}
                        </label>
                        <label className={styles.settingRow}>
                            <span>正文首行缩进</span>
                            <input
                                type="checkbox"
                                checked={settings.paragraphIndentEnabled}
                                onChange={(event) => settings.updateSetting('paragraphIndentEnabled', event.target.checked)}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>{`页面宽度 ${settings.pageWidth.toFixed(1)}x`}</span>
                            <input
                                type="range"
                                min={0.5}
                                max={3}
                                step={0.1}
                                value={settings.pageWidth}
                                onChange={(event) => settings.updateSetting('pageWidth', Number(event.target.value))}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>{`屏幕亮度 ${Math.round(settings.brightness * 100)}%`}</span>
                            <input
                                type="range"
                                min={0.3}
                                max={1}
                                step={0.05}
                                value={settings.brightness}
                                onChange={(event) => settings.updateSetting('brightness', Number(event.target.value))}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>文字对齐</span>
                            <select
                                value={settings.textAlign}
                                onChange={(event) => settings.updateSetting('textAlign', event.target.value as typeof settings.textAlign)}
                            >
                                <option value="left">左对齐</option>
                                <option value="justify">两端对齐</option>
                                <option value="center">居中</option>
                            </select>
                        </label>
                        <label className={styles.settingRow}>
                            <span>翻页模式</span>
                            <select
                                value={settings.pageTurnMode}
                                onChange={(event) => settings.updateSetting('pageTurnMode', event.target.value as typeof settings.pageTurnMode)}
                            >
                                <option value="paginated-single">单页</option>
                                <option value="paginated-double">双页</option>
                                <option value="scrolled-continuous">连续滚动</option>
                            </select>
                        </label>
                        <label className={styles.settingRow}>
                            <span>翻页动画</span>
                            <select
                                value={settings.pageTurnAnimation}
                                onChange={(event) => settings.updateSetting('pageTurnAnimation', event.target.value as typeof settings.pageTurnAnimation)}
                            >
                                <option value="slide">滑动</option>
                                <option value="fade">渐变</option>
                                <option value="none">无</option>
                            </select>
                        </label>
                    </>
                )}

                {settingsTab === 'sync' && <SyncSettingsTab />}

                {settingsTab === 'translate' && <TranslateSettingsTab />}
                <div className={styles.rowActions}>
                    <button className={styles.smallBtn} onClick={settings.resetToDefaults}>恢复默认设置</button>
                </div>
            </div>
        </div>
    )
}
