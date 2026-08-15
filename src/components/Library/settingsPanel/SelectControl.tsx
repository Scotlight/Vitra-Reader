import { useEffect, useId, useRef, useState } from 'react'
import chevronDownIcon from '@/assets/icons/chevron-down.svg'
import styles from '../SettingsPanelV2.module.css'

export interface SelectControlOption {
    value: string
    label: string
    disabled?: boolean
}

interface SelectControlProps {
    value: string
    options: SelectControlOption[]
    onChange: (value: string) => void
    label: string
    /** 选项内容自绘（字体列表需要每项按自身字体渲染）。不传则渲染 label 文本 */
    renderOption?: (option: SelectControlOption) => React.ReactNode
}

/**
 * 自绘下拉：外观沿用原胶囊行 + chevron，点击展开自绘菜单浮层。
 * why 不用原生 select：Electron/Windows 的 Chromium 弹系统方框列表，
 * 与设置面板视觉割裂；且字体列表需要每项按自身字体渲染，原生 option 做不到跨平台稳定。
 * 交互契约：点外部 / Esc 关闭；菜单在视口内放不下时自动向上翻。
 */
export function SelectControl({ value, options, onChange, label, renderOption }: SelectControlProps) {
    const [open, setOpen] = useState(false)
    const [flipUp, setFlipUp] = useState(false)
    const rootRef = useRef<HTMLSpanElement>(null)
    const menuId = useId()

    useEffect(() => {
        if (!open) return
        // 菜单上限 320px（CSS max-height），下方剩余空间不足时整体向上弹
        const rect = rootRef.current?.getBoundingClientRect()
        if (rect && window.innerHeight - rect.bottom < 330 && rect.top > 330) {
            setFlipUp(true)
        } else {
            setFlipUp(false)
        }
        const handlePointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation()
                setOpen(false)
            }
        }
        // pointerdown 而不是 click：菜单项点击在 mousedown 阶段就可能与外部判定竞争，
        // contains 判定对两者都成立，pointerdown 更早收口
        document.addEventListener('pointerdown', handlePointerDown)
        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [open])

    const selected = options.find((option) => option.value === value)
    // 宽度以"行内当前值"为基（原行为），菜单最小跟触发器等宽、内容更宽时撑开
    const menuMinWidth = rootRef.current?.offsetWidth ?? 0

    return (
        <span
            ref={rootRef}
            className={`${styles.selectControl} ${open ? styles.selectControlOpen : ''}`}
            data-open={open ? 'true' : 'false'}
            data-flip={flipUp ? 'true' : 'false'}
        >
            <button
                type="button"
                className={styles.selectTrigger}
                aria-label={label}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={menuId}
                onClick={() => setOpen((current) => !current)}
            >
                <span className={styles.selectValue}>
                    {selected ? (renderOption ? renderOption(selected) : selected.label) : value}
                </span>
                <img src={chevronDownIcon} alt="" className={styles.selectChevronInner} />
            </button>

            {open && (
                <ul id={menuId} role="listbox" aria-label={label} className={styles.selectMenu} style={{ minWidth: menuMinWidth }}>
                    {options.map((option) => {
                        const active = option.value === value
                        return (
                            <li key={option.value} role="option" aria-selected={active}>
                                <button
                                    type="button"
                                    role="presentation"
                                    className={`${styles.selectMenuItem} ${active ? styles.selectMenuItemActive : ''}`}
                                    disabled={option.disabled}
                                    onClick={() => {
                                        setOpen(false)
                                        if (!active) onChange(option.value)
                                    }}
                                >
                                    <span className={styles.selectMenuItemLabel}>
                                        {renderOption ? renderOption(option) : option.label}
                                    </span>
                                    {active && <span className={styles.selectMenuItemCheck} aria-hidden="true">✓</span>}
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}
        </span>
    )
}
