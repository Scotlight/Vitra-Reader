import type { Dispatch, SetStateAction } from 'react'
import type { TranslateConfig } from '@/services/translateService'
import styles from '../SettingsPanelV2.module.css'

interface TranslateProviderFieldsProps {
    readonly translateConfig: TranslateConfig
    readonly setTranslateConfig: Dispatch<SetStateAction<TranslateConfig>>
}

export function TranslateProviderFields({
    translateConfig,
    setTranslateConfig,
}: TranslateProviderFieldsProps) {
    if (translateConfig.provider === 'deepl') {
        return (
            <>
                <TranslateTextField
                    label="DeepL API Key"
                    type="password"
                    value={translateConfig.deeplApiKey}
                    onChange={(value) => setTranslateConfig((prev) => ({ ...prev, deeplApiKey: value }))}
                />
                <TranslateTextField
                    label="DeepL Endpoint"
                    value={translateConfig.deeplEndpoint}
                    onChange={(value) => setTranslateConfig((prev) => ({ ...prev, deeplEndpoint: value }))}
                />
            </>
        )
    }

    if (translateConfig.provider === 'openai') {
        return (
            <>
                <TranslateTextField
                    label="OpenAI兼容 API Key"
                    type="password"
                    value={translateConfig.openaiApiKey}
                    onChange={(value) => setTranslateConfig((prev) => ({ ...prev, openaiApiKey: value }))}
                />
                <TranslateTextField
                    label="OpenAI兼容 Endpoint"
                    value={translateConfig.openaiEndpoint}
                    onChange={(value) => setTranslateConfig((prev) => ({ ...prev, openaiEndpoint: value }))}
                />
                <TranslateTextField
                    label="Model"
                    value={translateConfig.openaiModel}
                    onChange={(value) => setTranslateConfig((prev) => ({ ...prev, openaiModel: value }))}
                />
            </>
        )
    }

    if (translateConfig.provider === 'ollama') {
        return (
            <>
                <TranslateTextField
                    label="Ollama Endpoint"
                    value={translateConfig.ollamaEndpoint}
                    onChange={(value) => setTranslateConfig((prev) => ({ ...prev, ollamaEndpoint: value }))}
                />
                <TranslateTextField
                    label="Ollama Model"
                    value={translateConfig.ollamaModel}
                    onChange={(value) => setTranslateConfig((prev) => ({ ...prev, ollamaModel: value }))}
                />
            </>
        )
    }

    if (translateConfig.provider === 'deeplx') {
        return (
            <TranslateTextField
                label="DeepLX Endpoint"
                value={translateConfig.deeplxEndpoint}
                onChange={(value) => setTranslateConfig((prev) => ({ ...prev, deeplxEndpoint: value }))}
            />
        )
    }

    return null
}

function TranslateTextField({
    label,
    onChange,
    type = 'text',
    value,
}: {
    readonly label: string
    readonly onChange: (value: string) => void
    readonly type?: 'password' | 'text'
    readonly value: string
}) {
    return (
        <label className={styles.settingRow}>
            <span>{label}</span>
            <input
                className={styles.textInput}
                type={type}
                value={value}
                onChange={(event) => onChange(event.target.value)}
            />
        </label>
    )
}
