import styles from './ReaderView.module.css'

interface ReaderFooterProps {
    readonly bgColor: string
    readonly chapterLabel: string
    readonly clockText: string
    readonly footerHeight: number
    readonly progressLabel: string
    readonly showChapter: boolean
    readonly showProgress: boolean
    readonly showTime: boolean
    readonly textColor: string
    readonly themeId: string
}

export function ReaderFooter({
    bgColor,
    chapterLabel,
    clockText,
    footerHeight,
    progressLabel,
    showChapter,
    showProgress,
    showTime,
    textColor,
    themeId,
}: ReaderFooterProps) {
    return (
        <div
            className={styles.footerBar}
            style={{
                height: `${footerHeight}px`,
                background: bgColor,
                color: textColor,
                borderTop: `1px solid ${themeId === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
            }}
        >
            <div className={styles.footerMeta}>
                {showProgress && <span>{`进度 ${progressLabel}`}</span>}
                {showChapter && <span>{chapterLabel || '章节加载中'}</span>}
                {showTime && <span>{clockText}</span>}
            </div>
        </div>
    )
}
