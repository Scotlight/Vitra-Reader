import type { CSSProperties } from 'react'
import { SettingsCard } from './SettingsCard'
import type { SettingsFormStore } from './settingsTypes'
import styles from '../SettingsPanelV2.module.css'

/** 固定三段预览文案：避免随机内容导致测试/快照不稳定 */
const PREVIEW_PARAGRAPHS = [
    '清晨的光从窗边慢慢移进来，书页也跟着亮了一点。',
    '读到这里时，句子的停顿和段落之间的距离会更加明显。',
    '这段文字用来观察字体、字号、字距、行距与首行缩进。',
] as const

interface FontPreviewSettingsCardProps {
    settings: SettingsFormStore
}

export function FontPreviewSettingsCard({ settings }: FontPreviewSettingsCardProps) {
    // 自定义色为空时回退到主题变量，避免在设置面板再抄一份主题色表
    const previewStyle: CSSProperties = {
        fontFamily: typeof settings.fontFamily === 'string' ? settings.fontFamily : 'inherit',
        fontSize: `${settings.fontSize}px`,
        lineHeight: settings.lineHeight,
        letterSpacing: `${settings.letterSpacing}px`,
        textAlign: settings.textAlign,
        backgroundColor: settings.customBgColor || 'var(--reader-bg)',
        color: settings.customTextColor || 'var(--reader-text)',
        // 段距走 CSS 变量，让每段 margin 共用同一来源
        ['--font-preview-paragraph-spacing' as string]: `${settings.paragraphSpacing}px`,
        ['--font-preview-indent' as string]: settings.paragraphIndentEnabled ? '2em' : '0',
    }

    return (
        <SettingsCard title="字体预览">
            <div
                className={styles.fontPreviewViewport}
                data-testid="font-preview-viewport"
                style={previewStyle}
            >
                {PREVIEW_PARAGRAPHS.map((text) => (
                    <p key={text} className={styles.fontPreviewParagraph}>
                        {text}
                    </p>
                ))}
            </div>
        </SettingsCard>
    )
}
