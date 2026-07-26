import styles from '../SettingsPanelV2.module.css'

/**
 * 界面外观即时预览。
 * 故意不读 Zustand、不维护本地状态——直接继承 App 注入的全局 CSS 变量，
 * 这样圆角/模糊/透明度/材质一改，预览与真实表面同步变化。
 */
export function UIAppearancePreview() {
    return (
        <div className={styles.uiAppearancePreview} data-testid="ui-appearance-preview">
            <div className={styles.uiAppearancePreviewStage} aria-hidden="true">
                <div className={styles.uiAppearancePreviewPanel}>
                    <p className={styles.uiAppearancePreviewLabel}>效果预览</p>
                    <div className={styles.uiAppearancePreviewControls}>
                        <span className={styles.uiAppearancePreviewButton}>按钮</span>
                        <span className={styles.uiAppearancePreviewInput}>输入框</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
