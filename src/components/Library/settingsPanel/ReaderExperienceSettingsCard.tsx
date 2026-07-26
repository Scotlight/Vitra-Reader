import { SelectControl, type SelectControlOption } from './SelectControl'
import { SettingsCard } from './SettingsCard'
import { SettingRow } from './SettingRow'
import { StepperControl } from './StepperControl'
import { ToggleControl } from './ToggleControl'
import type { SettingsFormStore } from './settingsTypes'
import { useIsCoarsePointer } from '@/hooks/useIsCoarsePointer'

const TEXT_ALIGN_OPTIONS: SelectControlOption[] = [
    { value: 'left', label: '左对齐' },
    { value: 'justify', label: '两端对齐' },
    { value: 'center', label: '居中' },
]

const PAGE_TURN_MODE_OPTIONS: SelectControlOption[] = [
    { value: 'paginated-single', label: '单页' },
    { value: 'paginated-double', label: '双页' },
    { value: 'scrolled-continuous', label: '连续滚动' },
]

const PAGE_TURN_ANIMATION_OPTIONS: SelectControlOption[] = [
    { value: 'slide', label: '滑动' },
    { value: 'fade', label: '渐变' },
    { value: 'none', label: '无' },
]

function getFontSelectValue(fontFamily: string): string {
    if (fontFamily === 'inherit') return '系统默认'
    return fontFamily.replace(/^"([^"]+)".*$/, '$1')
}

interface ReaderExperienceSettingsCardProps {
    loadingFonts: boolean
    scope?: 'all' | 'font' | 'reading'
    settings: SettingsFormStore
    systemFonts: string[]
}

export function ReaderExperienceSettingsCard({
    loadingFonts,
    scope = 'all',
    settings,
    systemFonts,
}: ReaderExperienceSettingsCardProps) {
    // 屏幕亮度靠 app 内遮罩降亮，仅对触屏（手机/平板）有意义；桌面隐藏此项，值恒当 1 处理。
    const isCoarsePointer = useIsCoarsePointer()
    const selectedFontValue = getFontSelectValue(
        typeof settings.fontFamily === 'string' ? settings.fontFamily : 'inherit',
    )
    const fontOptions = Array.from(new Set(['系统默认', selectedFontValue, ...systemFonts]))
        .filter(Boolean)
        .map((font) => ({ value: font, label: font }))
    const showFont = scope !== 'reading'
    const showReading = scope !== 'font'
    const title = scope === 'font' ? '字体' : scope === 'reading' ? '阅读方式' : '阅读体验'

    return (
        <SettingsCard title={title}>
            {showFont && (
                <SettingRow label="字体">
                    {loadingFonts ? (
                        <span>加载字体中...</span>
                    ) : (
                        <SelectControl
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
                </SettingRow>
            )}
            {showReading && (
                <>
                    <SettingRow label="正文首行缩进">
                        <ToggleControl
                            label="正文首行缩进"
                            checked={settings.paragraphIndentEnabled}
                            onChange={(checked) => settings.updateSetting('paragraphIndentEnabled', checked)}
                        />
                    </SettingRow>
                    <SettingRow label="页面宽度">
                        <StepperControl
                            label="页面宽度"
                            min={0.5}
                            max={3}
                            step={0.1}
                            value={settings.pageWidth}
                            unit="x"
                            decimals={1}
                            onChange={(value) => settings.updateSetting('pageWidth', value)}
                        />
                    </SettingRow>
                    {isCoarsePointer && (
                        <SettingRow label="屏幕亮度">
                            <StepperControl
                                label="屏幕亮度"
                                min={30}
                                max={100}
                                step={5}
                                value={Math.round(settings.brightness * 100)}
                                unit="%"
                                onChange={(value) => settings.updateSetting('brightness', value / 100)}
                            />
                        </SettingRow>
                    )}
                    <SettingRow label="文字对齐">
                        <SelectControl
                            label="文字对齐"
                            value={settings.textAlign}
                            options={TEXT_ALIGN_OPTIONS}
                            onChange={(value) => settings.updateSetting('textAlign', value as typeof settings.textAlign)}
                        />
                    </SettingRow>
                    <SettingRow label="翻页模式">
                        <SelectControl
                            label="翻页模式"
                            value={settings.pageTurnMode}
                            options={PAGE_TURN_MODE_OPTIONS}
                            onChange={(value) => settings.updateSetting('pageTurnMode', value as typeof settings.pageTurnMode)}
                        />
                    </SettingRow>
                    <SettingRow label="翻页动画">
                        <SelectControl
                            label="翻页动画"
                            value={settings.pageTurnAnimation}
                            options={PAGE_TURN_ANIMATION_OPTIONS}
                            onChange={(value) => settings.updateSetting('pageTurnAnimation', value as typeof settings.pageTurnAnimation)}
                        />
                    </SettingRow>
                </>
            )}
        </SettingsCard>
    )
}
