import { useEffect, useState } from 'react'
import {
    DEFAULT_TRANSLATE_CONFIG,
    clearTranslationCache,
    getProviderLabel,
    loadTranslateConfig,
    saveTranslateConfig,
    translateText,
    type TranslateConfig,
    type TranslateProvider,
} from '@/services/translateService'
import styles from '../LibraryView.module.css'

export function TranslateSettingsTab() {
    const [translateConfig, setTranslateConfig] = useState<TranslateConfig>(DEFAULT_TRANSLATE_CONFIG)
    const [translateSaving, setTranslateSaving] = useState(false)
    const [translateTesting, setTranslateTesting] = useState(false)
    const [translateStatus, setTranslateStatus] = useState('')
    const [safeStorageAvailable, setSafeStorageAvailable] = useState<boolean | null>(null)
    const [allowInsecureKeyStorage, setAllowInsecureKeyStorage] = useState(false)

    useEffect(() => {
        let active = true
        const api = window.electronAPI
        void loadTranslateConfig().then((config) => {
            if (active) setTranslateConfig(config)
        })
        if (api?.safeStorageIsAvailable) {
            void api.safeStorageIsAvailable()
                .then((available) => {
                    if (active) setSafeStorageAvailable(available)
                })
                .catch(() => {
                    if (active) setSafeStorageAvailable(false)
                })
        } else {
            setSafeStorageAvailable(false)
        }
        return () => { active = false }
    }, [])

    const hasTranslateApiKey = translateConfig.deeplApiKey.trim().length > 0 || translateConfig.openaiApiKey.trim().length > 0
    const shouldShowKeyStorageWarning = safeStorageAvailable === false && hasTranslateApiKey

    const handleSaveTranslateConfig = async () => {
        setTranslateSaving(true)
        setTranslateStatus('保存翻译配置中...')
        try {
            const saved = await saveTranslateConfig(translateConfig, { allowInsecureKeyStorage })
            setTranslateConfig(saved)
            if (safeStorageAvailable === false && hasTranslateApiKey && !allowInsecureKeyStorage) {
                setTranslateStatus('翻译配置已保存，API Key 未写入本地')
            } else {
                setTranslateStatus('翻译配置已保存')
            }
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
        <div className={styles.syncPanel}>
            <div className={styles.syncStatus} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                翻译服务配置（OpenAI/Ollama/DeepL/DeepLX 兼容）
            </div>
            <label className={styles.settingRow}>
                <span>翻译 Provider</span>
                <select
                    value={translateConfig.provider}
                    onChange={(event) => setTranslateConfig((prev) => ({ ...prev, provider: event.target.value as TranslateProvider }))}
                >
                    <option value="openai">OpenAI兼容</option>
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

            {shouldShowKeyStorageWarning && (
                <div className={styles.settingRow}>
                    <span>密钥保存</span>
                    <div>
                        <div className={styles.syncStatus}>当前系统无法安全保存 API Key，默认不写入本地。</div>
                        <label className={styles.checkboxRow}>
                            <input
                                type="checkbox"
                                checked={allowInsecureKeyStorage}
                                onChange={(event) => setAllowInsecureKeyStorage(event.target.checked)}
                            />
                            我了解风险，仍在本地保存
                        </label>
                    </div>
                </div>
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
    )
}
