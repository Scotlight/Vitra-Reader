import { SelectControl, type SelectControlOption } from './SelectControl'
import { SettingsCard } from './SettingsCard'
import { SettingRow } from './SettingRow'
import { StepperControl } from './StepperControl'
import { ToggleControl } from './ToggleControl'
import { UIAppearancePreview } from './UIAppearancePreview'
import type { SettingsFormStore } from './settingsTypes'
import styles from '../SettingsPanelV2.module.css'

const UI_MATERIAL_OPTIONS: SelectControlOption[] = [
    { value: 'default', label: '默认 · 无模糊' },
    { value: 'mica', label: 'Mica · 柔和染色' },
    { value: 'acrylic', label: 'Acrylic · 强透明模糊' },
]

interface GeneralSettingsCardsProps {
    onClose: () => void
    onReset: () => void
    settings: SettingsFormStore
}

export function GeneralSettingsCards({ onClose, onReset, settings }: GeneralSettingsCardsProps) {
    const isDefaultMaterial = settings.uiMaterial === 'default'

    return (
        <div className={styles.cardGrid}>
            <SettingsCard title="界面外观">
                <UIAppearancePreview />
                <SettingRow label="圆角">
                    <StepperControl
                        label="圆角"
                        min={0}
                        max={24}
                        step={1}
                        value={settings.uiRoundness}
                        unit="px"
                        onChange={(value) => settings.updateSetting('uiRoundness', value)}
                    />
                </SettingRow>
                <SettingRow label="毛玻璃强度">
                    <StepperControl
                        label="毛玻璃强度"
                        min={0}
                        max={40}
                        step={1}
                        value={settings.uiBlurStrength}
                        onChange={(value) => settings.updateSetting('uiBlurStrength', value)}
                    />
                </SettingRow>
                {isDefaultMaterial && (
                    <p className={styles.uiAppearanceHint} data-testid="ui-default-blur-hint">
                        默认材质不使用背景模糊；切换到 Mica / Acrylic 后生效。
                    </p>
                )}
                <SettingRow label="透明度">
                    <StepperControl
                        label="透明度"
                        min={40}
                        max={100}
                        step={5}
                        value={Math.round(settings.uiOpacity * 100)}
                        unit="%"
                        onChange={(value) => settings.updateSetting('uiOpacity', value / 100)}
                    />
                </SettingRow>
                <SettingRow label="界面材质">
                    <SelectControl
                        label="界面材质"
                        value={settings.uiMaterial}
                        options={UI_MATERIAL_OPTIONS}
                        onChange={(value) => settings.updateSetting('uiMaterial', value as typeof settings.uiMaterial)}
                    />
                </SettingRow>
                <SettingRow label="界面动画">
                    <ToggleControl
                        label="界面动画"
                        checked={settings.uiAnimation}
                        onChange={(checked) => settings.updateSetting('uiAnimation', checked)}
                    />
                </SettingRow>
            </SettingsCard>
            <SettingsCard title="快速操作">
                <SettingRow label="恢复默认">
                    <button type="button" className={styles.miniButton} onClick={onReset}>
                        恢复所有设置
                    </button>
                </SettingRow>
                <SettingRow label="关闭面板">
                    <button type="button" className={styles.miniButton} onClick={onClose}>
                        返回书库
                    </button>
                </SettingRow>
            </SettingsCard>
        </div>
    )
}
