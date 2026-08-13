import { useState } from 'react'
import type { ReactNode } from 'react'
import styles from './ReaderSettingsSection.module.css'

interface ReaderSettingsSectionProps {
    readonly title: string
    /** 默认收起（用户要求"需要再点击展开"）；个别分区想默认展开时显式传 true */
    readonly defaultOpen?: boolean
    readonly children: ReactNode
}

/**
 * 阅读器设置面板的可折叠分区。
 *
 * 展开状态是组件内部 useState、不持久化：设置面板是短生命周期弹层，
 * 记住"上次展开了哪些区"带来的心智负担大于收益（面板重开即回到全收起的目录态）。
 * 内容收起时直接不渲染——分区内都是受控控件（值在 settings store），无本地状态可丢。
 */
export function ReaderSettingsSection({ title, defaultOpen = false, children }: ReaderSettingsSectionProps) {
    const [open, setOpen] = useState(defaultOpen)

    return (
        <section className={`${styles.section} ${open ? styles.sectionOpen : ''}`}>
            <button
                type="button"
                className={styles.header}
                onClick={() => setOpen((current) => !current)}
                aria-expanded={open}
            >
                <span>{title}</span>
                <span className={styles.chevron} aria-hidden="true">▸</span>
            </button>
            {open && <div className={styles.content}>{children}</div>}
        </section>
    )
}
