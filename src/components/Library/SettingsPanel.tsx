import { useState } from 'react'
import { useSettingsStore } from '../../stores/useSettingsStore'
import { useSyncStore } from '../../stores/useSyncStore'
import {
    DEFAULT_TRANSLATE_CONFIG,
    clearTranslationCache,
    getProviderLabel,
    loadTranslateConfig,
    saveTranslateConfig,
    translateText,
    type TranslateConfig,
    type TranslateProvider,
} from '../../services/translateService'
import styles from './LibraryView.module.css'

interface SettingsPanelProps {
    systemFonts: string[]
    loadingFonts: boolean
    onClose: () => void
}

export const SettingsPanel = ({ systemFonts, loadingFonts, onClose }: SettingsPanelProps) => {
    const settings = useSettingsStore()
    const syncStore = useSyncStore()

    const [settingsTab, setSettingsTab] = useState<'theme' | 'ui' | 'reading' | 'sync' | 'translate'>('theme')
    const [tempTextColor, setTempTextColor] = useState<string | null>(null)
    const [translateConfig, setTranslateConfig] = useState<TranslateConfig>(DEFAULT_TRANSLATE_CONFIG)
    const [translateSaving, setTranslateSaving] = useState(false)
    const [translateTesting, setTranslateTesting] = useState(false)
    const [translateStatus, setTranslateStatus] = useState('')
    const [configLoaded, setConfigLoaded] = useState(false)

    // 懒加载翻译配置（仅在首次渲染时加载）
    if (!configLoaded) {
        setConfigLoaded(true)
        void loadTranslateConfig().then(setTranslateConfig)
    }

    const safeFontFamily = typeof settings.fontFamily === 'string' ? settings.fontFamily : 'inherit'
    const selectedFontValue =
        safeFontFamily === 'inherit'
            ? '系统默认'
            : safeFontFamily.replace(/^"([^"]+)".*$/, '$1')

    const handleSaveTranslateConfig = async () => {
        setTranslateSaving(true)
        setTranslateStatus('保存翻译配置中...')
        try {
            const saved = await saveTranslateConfig(translateConfig)
            setTranslateConfig(saved)
            setTranslateStatus('翻译配置已保存')
        } catch (error: unknown) {
            setTranslateStatus(`保存失败: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
            setTranslateSaving(false)
        }
    }

    const handleTestTranslate = async () => {
        setTranslateTesting(true)
        setTranslateStatus('测试翻译中...')
        try {
            const result = await translateText('Hello world', translateConfig)
            if (!result.ok) {
                setTranslateStatus(`测试失败: ${result.error || '未知错误'}`)
                return
            }
            setTranslateStatus(`测试成功 (${getProviderLabel(result.provider)}${result.fromCache ? '，缓存命中' : ''}): ${result.translatedText}`)
        } catch (error: unknown) {
            setTranslateStatus(`测试失败: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
            setTranslateTesting(false)
        }
    }

    const handleClearTranslationCache = async () => {
        try {
            await clearTranslationCache()
            setTranslateStatus('翻译缓存已清空')
        } catch (error: unknown) {
            setTranslateStatus(`清空缓存失败: ${error instanceof Error ? error.message : String(error)}`)
        }
    }

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

                {settingsTab === 'sync' && (
                    <div className={styles.syncPanel}>
                        <label className={styles.settingRow}>
                            <span>同步模式</span>
                            <select
                                value={syncStore.syncMode}
                                onChange={(event) => void syncStore.setConfig({ syncMode: event.target.value as 'full' | 'data' | 'files' })}
                            >
                                <option value="full">完整备份（文件+数据+设置）</option>
                                <option value="data">仅数据（进度/笔记/设置）</option>
                                <option value="files">仅文件（书籍实体文件）</option>
                            </select>
                        </label>
                        <label className={styles.settingRow}>
                            <span>恢复模式</span>
                            <select
                                value={syncStore.restoreMode}
                                onChange={(event) => void syncStore.setConfig({ restoreMode: event.target.value as 'auto' | 'full' | 'data' | 'files' })}
                            >
                                <option value="auto">自动（跟随备份包）</option>
                                <option value="full">强制完整恢复</option>
                                <option value="data">强制仅数据恢复</option>
                                <option value="files">强制仅文件恢复</option>
                            </select>
                        </label>
                        <label className={styles.settingRow}>
                            <span>恢复前处理</span>
                            <label className={styles.checkboxRow}>
                                <input
                                    type="checkbox"
                                    checked={syncStore.replaceBeforeRestore}
                                    onChange={(event) => void syncStore.setConfig({ replaceBeforeRestore: event.target.checked })}
                                />
                                先清空对应本地数据
                            </label>
                        </label>
                        <label className={styles.settingRow}>
                            <span>服务器地址</span>
                            <input
                                className={styles.textInput}
                                type="text"
                                placeholder="示例: https://example.com/dav"
                                value={syncStore.webdavUrl}
                                onChange={(event) => void syncStore.setConfig({ webdavUrl: event.target.value })}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>服务器文件夹</span>
                            <input
                                className={styles.textInput}
                                type="text"
                                placeholder="示例: VitraReader 或 backups/reader"
                                value={syncStore.webdavPath}
                                onChange={(event) => void syncStore.setConfig({ webdavPath: event.target.value })}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>用户名</span>
                            <input
                                className={styles.textInput}
                                type="text"
                                value={syncStore.webdavUser}
                                onChange={(event) => void syncStore.setConfig({ webdavUser: event.target.value })}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>密码</span>
                            <input
                                className={styles.textInput}
                                type="password"
                                value={syncStore.webdavPass}
                                onChange={(event) => void syncStore.setConfig({ webdavPass: event.target.value })}
                            />
                        </label>

                        <div className={styles.syncActions}>
                            <button className={styles.smallBtn} onClick={() => void syncStore.testConnection()} disabled={syncStore.isTesting}>
                                {syncStore.isTesting ? '测试中...' : '测试'}
                            </button>
                            <button className={styles.smallBtn} onClick={() => void syncStore.restoreData()} disabled={syncStore.isRestoring}>
                                {syncStore.isRestoring ? '恢复中...' : '恢复'}
                            </button>
                            <button className={styles.syncPrimaryBtn} onClick={() => void syncStore.syncData()} disabled={syncStore.isSyncing}>
                                {syncStore.isSyncing ? '同步中...' : '绑定并同步'}
                            </button>
                        </div>
                        {syncStore.syncStatus && <div className={styles.syncStatus}>{syncStore.syncStatus}</div>}
                        {syncStore.lastSyncTime && (
                            <div className={styles.syncStatus}>
                                上次同步: {new Date(syncStore.lastSyncTime).toLocaleString()}
                            </div>
                        )}

                    </div>
                )}

                {settingsTab === 'translate' && (
                    <div className={styles.syncPanel}>
                        <div className={styles.syncStatus} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            翻译服务配置（OpenAI/Gemini/Claude/Ollama/DeepL/DeepLX 兼容）
                        </div>
                        <label className={styles.settingRow}>
                            <span>翻译 Provider</span>
                            <select
                                value={translateConfig.provider}
                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, provider: event.target.value as TranslateProvider }))}
                            >
                                <option value="openai">OpenAI兼容</option>
                                <option value="gemini">Gemini兼容</option>
                                <option value="claude">Claude兼容</option>
                                <option value="ollama">Ollama兼容</option>
                                <option value="deepl">DeepL 官方</option>
                                <option value="deeplx">DeepLX兼容</option>
                            </select>
                        </label>
                        <label className={styles.settingRow}>
                            <span>源语言</span>
                            <input
                                className={styles.textInput}
                                type="text"
                                value={translateConfig.sourceLang}
                                placeholder="auto"
                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, sourceLang: event.target.value }))}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>目标语言</span>
                            <input
                                className={styles.textInput}
                                type="text"
                                value={translateConfig.targetLang}
                                placeholder="zh-CN"
                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, targetLang: event.target.value }))}
                            />
                        </label>

                        {translateConfig.provider === 'deepl' && (
                            <>
                                <label className={styles.settingRow}>
                                    <span>DeepL API Key</span>
                                    <input
                                        className={styles.textInput}
                                        type="password"
                                        value={translateConfig.deeplApiKey}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, deeplApiKey: event.target.value }))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>DeepL Endpoint</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        value={translateConfig.deeplEndpoint}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, deeplEndpoint: event.target.value }))}
                                    />
                                </label>
                            </>
                        )}

                        {translateConfig.provider === 'openai' && (
                            <>
                                <label className={styles.settingRow}>
                                    <span>OpenAI兼容 API Key</span>
                                    <input
                                        className={styles.textInput}
                                        type="password"
                                        value={translateConfig.openaiApiKey}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, openaiApiKey: event.target.value }))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>OpenAI兼容 Endpoint</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        value={translateConfig.openaiEndpoint}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, openaiEndpoint: event.target.value }))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>Model</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        value={translateConfig.openaiModel}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, openaiModel: event.target.value }))}
                                    />
                                </label>
                            </>
                        )}

                        {translateConfig.provider === 'gemini' && (
                            <>
                                <label className={styles.settingRow}>
                                    <span>Gemini API Key</span>
                                    <input
                                        className={styles.textInput}
                                        type="password"
                                        value={translateConfig.geminiApiKey}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, geminiApiKey: event.target.value }))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>Gemini Endpoint</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        value={translateConfig.geminiEndpoint}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, geminiEndpoint: event.target.value }))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>Gemini Model</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        value={translateConfig.geminiModel}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, geminiModel: event.target.value }))}
                                    />
                                </label>
                            </>
                        )}

                        {translateConfig.provider === 'claude' && (
                            <>
                                <label className={styles.settingRow}>
                                    <span>Claude API Key</span>
                                    <input
                                        className={styles.textInput}
                                        type="password"
                                        value={translateConfig.claudeApiKey}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, claudeApiKey: event.target.value }))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>Claude Endpoint</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        value={translateConfig.claudeEndpoint}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, claudeEndpoint: event.target.value }))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>Claude Model</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        value={translateConfig.claudeModel}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, claudeModel: event.target.value }))}
                                    />
                                </label>
                            </>
                        )}

                        {translateConfig.provider === 'ollama' && (
                            <>
                                <label className={styles.settingRow}>
                                    <span>Ollama Endpoint</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        value={translateConfig.ollamaEndpoint}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, ollamaEndpoint: event.target.value }))}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>Ollama Model</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        value={translateConfig.ollamaModel}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, ollamaModel: event.target.value }))}
                                    />
                                </label>
                            </>
                        )}

                        {translateConfig.provider === 'deeplx' && (
                            <>
                                <label className={styles.settingRow}>
                                    <span>DeepLX Endpoint</span>
                                    <input
                                        className={styles.textInput}
                                        type="text"
                                        value={translateConfig.deeplxEndpoint}
                                        onChange={(event) => setTranslateConfig((prev) => ({ ...prev, deeplxEndpoint: event.target.value }))}
                                    />
                                </label>
                            </>
                        )}

                        <label className={styles.settingRow}>
                            <span>启用缓存</span>
                            <label className={styles.checkboxRow}>
                                <input
                                    type="checkbox"
                                    checked={translateConfig.cacheEnabled}
                                    onChange={(event) => setTranslateConfig((prev) => ({ ...prev, cacheEnabled: event.target.checked }))}
                                />
                                本地缓存翻译结果
                            </label>
                        </label>
                        <label className={styles.settingRow}>
                            <span>缓存时长(小时)</span>
                            <input
                                className={styles.textInput}
                                type="number"
                                min={1}
                                max={24 * 365}
                                value={translateConfig.cacheTtlHours}
                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, cacheTtlHours: Number(event.target.value) || prev.cacheTtlHours }))}
                            />
                        </label>
                        <label className={styles.settingRow}>
                            <span>缓存上限</span>
                            <input
                                className={styles.textInput}
                                type="number"
                                min={50}
                                max={5000}
                                value={translateConfig.cacheMaxEntries}
                                onChange={(event) => setTranslateConfig((prev) => ({ ...prev, cacheMaxEntries: Number(event.target.value) || prev.cacheMaxEntries }))}
                            />
                        </label>
                        <div className={styles.syncActions}>
                            <button className={styles.smallBtn} onClick={handleSaveTranslateConfig} disabled={translateSaving}>
                                {translateSaving ? '保存中...' : '保存翻译配置'}
                            </button>
                            <button className={styles.smallBtn} onClick={handleTestTranslate} disabled={translateTesting}>
                                {translateTesting ? '测试中...' : '测试翻译'}
                            </button>
                            <button className={styles.smallBtn} onClick={() => void handleClearTranslationCache()}>
                                清空缓存
                            </button>
                        </div>
                        {translateStatus && <div className={styles.syncStatus}>{translateStatus}</div>}
                    </div>
                )}
                <div className={styles.rowActions}>
                    <button className={styles.smallBtn} onClick={settings.resetToDefaults}>恢复默认设置</button>
                </div>
            </div>
        </div>
    )
}
