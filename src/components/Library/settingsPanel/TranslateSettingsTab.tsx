import type { TranslateProvider } from '@/services/translateService'
import { SelectControl, type SelectControlOption } from './SelectControl'
import { StepperControl } from './StepperControl'
import { ToggleControl } from './ToggleControl'
import { TranslateProviderFields } from './TranslateProviderFields'
import { useTranslateSettings } from './useTranslateSettings'
import styles from '../SettingsPanelV2.module.css'

const TRANSLATE_PROVIDER_OPTIONS: SelectControlOption[] = [
    { value: 'openai', label: 'OpenAI兼容' },
    { value: 'ollama', label: 'Ollama兼容' },
    { value: 'deepl', label: 'DeepL 官方' },
    { value: 'deeplx', label: 'DeepLX兼容' },
]

export function TranslateSettingsTab() {
    const {
        allowInsecureKeyStorage,
        handleClearTranslationCache,
        handleSaveTranslateConfig,
        handleTestTranslate,
        setAllowInsecureKeyStorage,
        setTranslateConfig,
        shouldShowKeyStorageWarning,
        translateConfig,
        translateSaving,
        translateStatus,
        translateTesting,
    } = useTranslateSettings()

    return (
        <div className={styles.syncPanel}>
            <div className={`${styles.syncStatus} ${styles.inlineStatus}`}>
                翻译服务配置（OpenAI/Ollama/DeepL/DeepLX 兼容）
            </div>
            <label className={styles.settingRow}>
                <span>翻译 Provider</span>
                <SelectControl
                    label="翻译 Provider"
                    value={translateConfig.provider}
                    options={TRANSLATE_PROVIDER_OPTIONS}
                    onChange={(value) => setTranslateConfig((prev) => ({ ...prev, provider: value as TranslateProvider }))}
                />
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

            <TranslateProviderFields
                translateConfig={translateConfig}
                setTranslateConfig={setTranslateConfig}
            />

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
                <ToggleControl
                    label="启用本地翻译缓存"
                    checked={translateConfig.cacheEnabled}
                    onChange={(checked) => setTranslateConfig((prev) => ({ ...prev, cacheEnabled: checked }))}
                />
            </label>
            <label className={styles.settingRow}>
                <span>缓存时长(小时)</span>
                <StepperControl
                    label="缓存时长"
                    min={1}
                    max={24 * 365}
                    step={1}
                    value={translateConfig.cacheTtlHours}
                    onChange={(value) => setTranslateConfig((prev) => ({ ...prev, cacheTtlHours: value || prev.cacheTtlHours }))}
                />
            </label>
            <label className={styles.settingRow}>
                <span>缓存上限</span>
                <StepperControl
                    label="缓存上限"
                    min={50}
                    max={5000}
                    step={50}
                    value={translateConfig.cacheMaxEntries}
                    onChange={(value) => setTranslateConfig((prev) => ({ ...prev, cacheMaxEntries: value || prev.cacheMaxEntries }))}
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
