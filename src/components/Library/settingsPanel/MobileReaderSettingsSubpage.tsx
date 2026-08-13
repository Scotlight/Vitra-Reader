import type { CSSProperties, ReactNode } from 'react'
import {
    MobileColorRow,
    MobileSelectRow,
    MobileSettingsGroup,
    MobileSettingsRow,
    MobileStepperRow,
    MobileToggleRow,
} from './MobileSettingsList'
import type { SettingsFormStore } from './settingsTypes'
import type { MobileSettingsPage } from './mobileSettings'
import { useIsCoarsePointer } from '@/hooks/useIsCoarsePointer'
import styles from './MobileReaderSettingsSubpage.module.css'

/**
 * 字体 / 排版 / 主题 三个移动端设置子页面的统一实现
 *
 * 与桌面端 ReaderExperienceSettingsCard / ThemeTypographySettingsCard / FontPreviewSettingsCard 的关系：
 * - 桌面端继续走原组件（SettingsCard 包装），零改动
 * - 移动端走本组件，由 SettingsPanel.renderMobileContent 按 mobilePage 分发
 *
 * 布局原则（Readest / iOS）：
 * - 预览钉顶部：改字体/字号实时生效，所见即所得
 * - Boxed list：圆角卡片 + 56px 等高行 + 行内 0.5px 发丝线
 * - 控件 end-aligned：stepper/select/toggle/color 都靠右
 * - 触控目标 ≥ 40px
 */

const TEXT_ALIGN_OPTIONS = [
    { value: 'left', label: '左对齐' },
    { value: 'justify', label: '两端对齐' },
    { value: 'center', label: '居中' },
] as const

const PAGE_TURN_ANIMATION_OPTIONS = [
    { value: 'slide', label: '滑动' },
    { value: 'fade', label: '渐变' },
    { value: 'realistic', label: '仿真' },
    { value: 'none', label: '无' },
] as const

const THEME_SWATCHES = [
    { id: 'light', color: '#ffffff', label: '浅色' },
    { id: 'dark', color: '#1a1a2e', label: '深色' },
    { id: 'sepia', color: '#f4ecd8', label: '护眼' },
    { id: 'green', color: '#c7edcc', label: '绿色' },
] as const

/* 强调色四色板（原型 1a）+ 跟随主题。auto 的圆点直接显示当前主题 accent，
   让"跟随"选项也有实色可看，而不是一个抽象图标 */
const ACCENT_SWATCHES = [
    { id: 'auto', color: 'var(--accent-color)', label: '跟随主题' },
    { id: 'ember', color: 'oklch(0.63 0.14 48)', label: '炭橙' },
    { id: 'tide', color: 'oklch(0.60 0.12 210)', label: '海青' },
    { id: 'moss', color: 'oklch(0.58 0.13 145)', label: '苔绿' },
    { id: 'plum', color: 'oklch(0.58 0.15 340)', label: '梅紫' },
] as const

const PREVIEW_PARAGRAPHS = [
    '清晨的光从窗边慢慢移进来，书页也跟着亮了一点。',
    '读到这里时，句子的停顿和段落之间的距离会更加明显。',
] as const

interface MobileReaderSettingsSubpageProps {
    page: Extract<MobileSettingsPage, 'font' | 'typography' | 'theme' | 'readingMode'>
    settings: SettingsFormStore
    systemFonts: string[]
    loadingFonts: boolean
    tempTextColor: string | null
    onTempTextColorChange: (value: string | null) => void
}

/* ===== 翻页模式可视化图标 =====
 * 用 SVG 画 3 种模式的"书页示意"：
 * - 单页：一整块文字
 * - 双页：左右两块文字中间留缝
 * - 滚动：连续一长条带上下箭头暗示可滚动
 */
function SinglePageIcon() {
    return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
            <rect x="8" y="6" width="48" height="52" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="16" y1="18" x2="48" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="16" y1="26" x2="48" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="16" y1="34" x2="48" y2="34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="16" y1="42" x2="40" y2="42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    )
}

function DoublePageIcon() {
    return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
            <rect x="4" y="6" width="26" height="52" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
            <rect x="34" y="6" width="26" height="52" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="10" y1="18" x2="24" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="10" y1="26" x2="24" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="10" y1="34" x2="24" y2="34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="40" y1="18" x2="54" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="40" y1="26" x2="54" y2="26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="40" y1="34" x2="54" y2="34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    )
}

function ScrollIcon() {
    return (
        <svg viewBox="0 0 64 64" aria-hidden="true">
            {/* 上箭头 */}
            <path d="M32 4l-6 6h12l-6-6z" fill="currentColor" />
            {/* 连续长文 */}
            <rect x="14" y="14" width="36" height="36" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
            <line x1="20" y1="22" x2="44" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="20" y1="28" x2="44" y2="28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="20" y1="34" x2="44" y2="34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="20" y1="40" x2="38" y2="40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            {/* 下箭头 */}
            <path d="M32 60l6-6H26l6 6z" fill="currentColor" />
        </svg>
    )
}

interface PageModeOptionProps {
    icon: ReactNode
    label: string
    active: boolean
    onClick: () => void
}

function PageModeOption({ icon, label, active, onClick }: PageModeOptionProps) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            className={`${styles.pageModeOption} ${active ? styles.pageModeOptionActive : ''}`}
            onClick={onClick}
        >
            <span className={styles.pageModeIcon}>{icon}</span>
            <span className={styles.pageModeLabel}>{label}</span>
        </button>
    )
}

export function MobileReaderSettingsSubpage({
    page,
    settings,
    systemFonts,
    loadingFonts,
    tempTextColor,
    onTempTextColorChange,
}: MobileReaderSettingsSubpageProps) {
    const isCoarsePointer = useIsCoarsePointer()

    const selectedFontValue = (() => {
        const v = settings.fontFamily
        if (v === 'inherit') return '系统默认'
        return typeof v === 'string' ? v.replace(/^"([^"]+)".*$/, '$1') : '系统默认'
    })()
    const fontOptions = Array.from(new Set(['系统默认', selectedFontValue, ...systemFonts]))
        .filter(Boolean)
        .map((font) => ({ value: font, label: font }))

    const previewStyle: CSSProperties = {
        fontFamily: typeof settings.fontFamily === 'string' ? settings.fontFamily : 'inherit',
        fontSize: `${settings.fontSize}px`,
        lineHeight: settings.lineHeight,
        letterSpacing: `${settings.letterSpacing}px`,
        textAlign: settings.textAlign,
        ['--preview-paragraph-spacing' as string]: `${settings.paragraphSpacing}px`,
        ['--preview-indent' as string]: settings.paragraphIndentEnabled ? '2em' : '0',
    }

    // 预览只在跟字体/排版直接相关的页面显示；阅读方式页的设置跟文字渲染无关，放预览是噪音
    const showPreview = page !== 'readingMode'

    return (
        <div className={styles.subpage}>
            {showPreview && (
                <div className={styles.previewCard} style={previewStyle} data-testid="mobile-font-preview">
                    {PREVIEW_PARAGRAPHS.map((text) => (
                        <p key={text} className={styles.previewParagraph}>{text}</p>
                    ))}
                </div>
            )}

            {page === 'font' && (
                <>
                    <MobileSettingsGroup label="字体">
                        {loadingFonts ? (
                            <MobileSettingsRow label="字体">
                                <span className={styles.loadingText}>加载中…</span>
                            </MobileSettingsRow>
                        ) : (
                            <MobileSelectRow
                                label="字体"
                                value={selectedFontValue}
                                options={fontOptions}
                                onChange={(value) => {
                                    settings.updateSetting(
                                        'fontFamily',
                                        value === '系统默认' ? 'inherit' : `"${value}", sans-serif`,
                                    )
                                }}
                            />
                        )}
                    </MobileSettingsGroup>

                    <MobileSettingsGroup label="字号与间距">
                        <MobileStepperRow
                            label="字号"
                            min={13}
                            max={40}
                            step={1}
                            value={settings.fontSize}
                            unit="px"
                            onChange={(v) => settings.updateSetting('fontSize', v)}
                        />
                        <MobileStepperRow
                            label="行距"
                            min={1}
                            max={3.5}
                            step={0.1}
                            value={settings.lineHeight}
                            decimals={1}
                            onChange={(v) => settings.updateSetting('lineHeight', v)}
                        />
                        <MobileStepperRow
                            label="字距"
                            min={0}
                            max={20}
                            step={1}
                            value={settings.letterSpacing}
                            unit="px"
                            onChange={(v) => settings.updateSetting('letterSpacing', v)}
                        />
                        <MobileStepperRow
                            label="段距"
                            min={0}
                            max={100}
                            step={1}
                            value={settings.paragraphSpacing}
                            unit="px"
                            onChange={(v) => settings.updateSetting('paragraphSpacing', v)}
                        />
                    </MobileSettingsGroup>
                </>
            )}

            {page === 'typography' && (
                <>
                    <MobileSettingsGroup label="段落">
                        <MobileToggleRow
                            label="正文首行缩进"
                            checked={settings.paragraphIndentEnabled}
                            onChange={(checked) => settings.updateSetting('paragraphIndentEnabled', checked)}
                        />
                        <MobileSelectRow
                            label="文字对齐"
                            value={settings.textAlign}
                            options={TEXT_ALIGN_OPTIONS}
                            onChange={(v) => settings.updateSetting('textAlign', v as typeof settings.textAlign)}
                        />
                        <MobileStepperRow
                            label="段距"
                            min={0}
                            max={100}
                            step={1}
                            value={settings.paragraphSpacing}
                            unit="px"
                            onChange={(v) => settings.updateSetting('paragraphSpacing', v)}
                        />
                    </MobileSettingsGroup>

                    <MobileSettingsGroup label="页面">
                        <MobileStepperRow
                            label="页面宽度"
                            min={0.5}
                            max={3}
                            step={0.1}
                            value={settings.pageWidth}
                            unit="x"
                            decimals={1}
                            onChange={(v) => settings.updateSetting('pageWidth', v)}
                        />
                        {isCoarsePointer && (
                            <MobileStepperRow
                                label="屏幕亮度"
                                min={30}
                                max={100}
                                step={5}
                                value={Math.round(settings.brightness * 100)}
                                unit="%"
                                onChange={(v) => settings.updateSetting('brightness', v / 100)}
                            />
                        )}
                    </MobileSettingsGroup>
                </>
            )}

            {page === 'readingMode' && (
                <>
                    <MobileSettingsGroup label="翻页模式">
                        {/* 可视化选择：3 个图标 preview 直接展示"单页/双页/连续滚动"长什么样，
                            比抽象文字 label 更直观。active 加蓝色描边。 */}
                        <div className={styles.pageModeRow} role="radiogroup" aria-label="翻页模式">
                            <PageModeOption
                                icon={<SinglePageIcon />}
                                label="单页"
                                active={settings.pageTurnMode === 'paginated-single'}
                                onClick={() => settings.updateSetting('pageTurnMode', 'paginated-single')}
                            />
                            <PageModeOption
                                icon={<DoublePageIcon />}
                                label="双页"
                                active={settings.pageTurnMode === 'paginated-double'}
                                onClick={() => settings.updateSetting('pageTurnMode', 'paginated-double')}
                            />
                            <PageModeOption
                                icon={<ScrollIcon />}
                                label="滚动"
                                active={settings.pageTurnMode === 'scrolled-continuous'}
                                onClick={() => settings.updateSetting('pageTurnMode', 'scrolled-continuous')}
                            />
                        </div>
                    </MobileSettingsGroup>

                    <MobileSettingsGroup label="翻页动画">
                        <MobileSelectRow
                            label="动画效果"
                            value={settings.pageTurnAnimation}
                            options={PAGE_TURN_ANIMATION_OPTIONS.map((option) => ({
                                ...option,
                                // 仿真与双页组合未定义（单容器翻转轴按单页视口算），置灰
                                disabled: option.value === 'realistic' && settings.pageTurnMode === 'paginated-double',
                            }))}
                            onChange={(v) => settings.updateSetting('pageTurnAnimation', v as typeof settings.pageTurnAnimation)}
                        />
                    </MobileSettingsGroup>

                    <MobileSettingsGroup label="沉浸">
                        <MobileToggleRow
                            label="沉浸模式"
                            hint="进书 2.5 秒后自动隐藏工具栏"
                            checked={settings.immersiveMode}
                            onChange={(checked) => settings.updateSetting('immersiveMode', checked)}
                        />
                    </MobileSettingsGroup>
                </>
            )}

            {page === 'theme' && (
                <>
                    <MobileSettingsGroup label="主题">
                        <div className={styles.themeSwatchRow} role="radiogroup" aria-label="主题">
                            {THEME_SWATCHES.map((theme) => {
                                const active = settings.themeId === theme.id
                                return (
                                    <button
                                        key={theme.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        aria-label={theme.label}
                                        title={theme.label}
                                        className={`${styles.themeSwatch} ${active ? styles.themeSwatchActive : ''}`}
                                        style={{ background: theme.color }}
                                        onClick={() => settings.updateSetting('themeId', theme.id)}
                                    />
                                )
                            })}
                        </div>
                    </MobileSettingsGroup>

                    <MobileSettingsGroup label="强调色">
                        <div className={styles.themeSwatchRow} role="radiogroup" aria-label="强调色">
                            {ACCENT_SWATCHES.map((accent) => {
                                const active = settings.mobileAccent === accent.id
                                return (
                                    <button
                                        key={accent.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        aria-label={accent.label}
                                        title={accent.label}
                                        className={`${styles.themeSwatch} ${active ? styles.themeSwatchActive : ''}`}
                                        style={{ background: accent.color }}
                                        onClick={() => settings.updateSetting('mobileAccent', accent.id)}
                                    />
                                )
                            })}
                        </div>
                    </MobileSettingsGroup>

                    <MobileSettingsGroup label="自定义颜色">
                        <MobileColorRow
                            label="背景色"
                            value={settings.customBgColor ?? '#ffffff'}
                            onChange={(v) => settings.updateSetting('customBgColor', v)}
                            onReset={() => settings.updateSetting('customBgColor', null)}
                        />
                        <MobileColorRow
                            label="文字色"
                            value={tempTextColor ?? settings.customTextColor ?? '#1a1a1a'}
                            onChange={onTempTextColorChange}
                            onReset={() => {
                                settings.updateSetting('customTextColor', null)
                                onTempTextColorChange(null)
                            }}
                        />
                    </MobileSettingsGroup>
                </>
            )}
        </div>
    )
}
