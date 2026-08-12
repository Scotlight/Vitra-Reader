import type { MouseEvent as ReactMouseEvent } from 'react'
import { emitBookOpen } from './BookOpenTransition'

/**
 * 从被点击的卡片元素发起共享元素转场。
 *
 * why 抽成 helper：MobileHomeView / MobileShelfView / MobileNotesView 都需要
 * "量卡片位置 + 从 DOM 取已加载的封面 URL + emitBookOpen" 这 14 行相同逻辑。
 * 第三处消费者（Phase 4 笔记页）已在路上，现在抽正好。
 *
 * 调用方必须确保卡片内有 <img> 元素（LazyCoverImage 组件）且已加载完成。
 * 如果取不到 src，此函数不发射转场，调用方仍需调 onOpenBook 以无转场方式打开书。
 */
export function emitBookOpenFromCard(
    event: ReactMouseEvent<HTMLElement>,
    bookId: string,
    onOpenBook: (id: string) => void,
): void {
    const cardEl = event.currentTarget
    const coverEl = cardEl.querySelector('img')
    const coverSrc = coverEl?.currentSrc || coverEl?.src
    if (coverSrc) {
        const rect = cardEl.getBoundingClientRect()
        emitBookOpen({
            bookId,
            cover: coverSrc,
            cardRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        })
    }
    onOpenBook(bookId)
}
