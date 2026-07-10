import { useEffect, useMemo, useState } from 'react'
import {
    DEFAULT_TRANSLATE_CONFIG,
    clearTranslationCache,
    getProviderLabel,
    loadTranslateConfig,
    saveTranslateConfig,
    translateText,
    type TranslateConfig,
} from '@/services/translateService'
import { safeStorageIsAvailable } from '@/services/platform/platformBridge'

export function useTranslateSettings() {
    const [translateConfig, setTranslateConfig] = useState<TranslateConfig>(DEFAULT_TRANSLATE_CONFIG)
    const [translateSaving, setTranslateSaving] = useState(false)
    const [translateTesting, setTranslateTesting] = useState(false)
    const [translateStatus, setTranslateStatus] = useState('')
    const [safeStorageAvailable, setSafeStorageAvailable] = useState<boolean | null>(null)
    const [allowInsecureKeyStorage, setAllowInsecureKeyStorage] = useState(false)

    useEffect(() => {
        let active = true
        void loadTranslateConfig().then((config) => {
            if (active) setTranslateConfig(config)
        })
        void safeStorageIsAvailable().then((available) => {
            if (active) setSafeStorageAvailable(available)
        })
        return () => { active = false }
    }, [])

    const hasTranslateApiKey = useMemo(() => (
        translateConfig.deeplApiKey.trim().length > 0 || translateConfig.openaiApiKey.trim().length > 0
    ), [translateConfig.deeplApiKey, translateConfig.openaiApiKey])
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

    return {
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
    }
}
