import { PAGE_TURN_REALISTIC_MS } from './paginatedPageTurnAnimation'

/**
 * 仿真翻页的双面卡片层（替代旧"单容器半翻"实现）。
 *
 * why 换架构：单容器方案把真实内容容器整个旋转，掀开后底下是空背景、
 * 过 90° 又露出内容镜像，观感"假"。双面卡片层模拟真实书页物理：
 * - 底层：真实容器已（无动画地）换到目标页 —— 掀页过程中露出的就是真内容
 * - 上层：克隆旧页 DOM 做成一张"纸"（正面=旧页克隆，背面=纸色面板），
 *   前进 0°→-168° 掀走；后退时另有新页纸从 -168°→0° 盖回，旧页垫底遮罩
 * 每次翻页克隆一次章节 DOM（本项目章节 7~13KB，代价可接受），动画结束即销毁。
 */

const FLIP_EASING = 'cubic-bezier(0.3, 0.9, 0.25, 1)'
const FLIP_STAGE_Z = 8

export type RealisticFlipDirection = 'forward' | 'backward'

/** 纯函数关键帧（导出供单测锁方向/角度/投影节奏） */
export function buildRealisticFlipKeyframes(direction: RealisticFlipDirection) {
    const shadowStart = '0 0 0 rgba(0, 0, 0, 0)'
    const shadowPeak = '-18px 0 34px rgba(0, 0, 0, 0.28)'
    if (direction === 'forward') {
        return [
            { transform: 'rotateY(0deg)', boxShadow: shadowStart, offset: 0 },
            { transform: 'rotateY(-84deg)', boxShadow: shadowPeak, offset: 0.5 },
            { transform: 'rotateY(-168deg)', boxShadow: shadowStart, offset: 1 },
        ]
    }
    return [
        { transform: 'rotateY(-168deg)', boxShadow: shadowStart, offset: 0 },
        { transform: 'rotateY(-84deg)', boxShadow: shadowPeak, offset: 0.5 },
        { transform: 'rotateY(0deg)', boxShadow: shadowStart, offset: 1 },
    ]
}

interface SnapshotSheetInput {
    container: HTMLDivElement
    pageWidth: number
    /** 该纸正面显示的页码（容器克隆内容的取景窗口平移量由它决定） */
    page: number
}

/**
 * 从分页容器克隆出一张"纸"：正面是一个 pageWidth 宽的取景窗口，
 * 窗口内按页码平移克隆内容；背面是纸色面板（rotateY 180°，backface 互补）。
 */
function buildSnapshotSheet({ container, pageWidth, page }: SnapshotSheetInput): HTMLDivElement {
    const totalWidth = Math.max(container.scrollWidth, pageWidth)
    const snapshot = container.cloneNode(true) as HTMLDivElement
    // 克隆体带着原容器的 inline transform/transition/opacity —— 必须清掉，
    // 否则和取景窗口的平移叠加成双重位移；宽度显式钉成 scrollWidth 让多列完整铺开
    snapshot.style.width = `${totalWidth}px`
    snapshot.style.transform = ''
    snapshot.style.transition = ''
    snapshot.style.opacity = ''

    const sheet = document.createElement('div')
    sheet.style.cssText = 'position:absolute;inset:0;transform-origin:0 50%;transform-style:preserve-3d;'

    const front = document.createElement('div')
    front.style.cssText = [
        'position:absolute', 'top:0', 'left:0',
        `width:${pageWidth}px`, 'height:100%',
        'overflow:hidden', 'backface-visibility:hidden',
    ].join(';')
    const windowInner = document.createElement('div')
    windowInner.style.cssText = `width:${totalWidth}px;transform:translateX(${-page * pageWidth}px);`
    windowInner.appendChild(snapshot)
    front.appendChild(windowInner)

    const back = document.createElement('div')
    // 背面 = 纸：基色随阅读背景，叠一道沿书脊的暗渐变模拟受光
    back.style.cssText = [
        'position:absolute', 'top:0', 'left:0',
        `width:${pageWidth}px`, 'height:100%',
        'backface-visibility:hidden', 'transform:rotateY(180deg)',
        'background:var(--reader-bg-color, #f7f3ea)',
        'background-image:linear-gradient(to right, rgba(0,0,0,0.10), rgba(0,0,0,0) 18%)',
    ].join(';')

    sheet.appendChild(front)
    sheet.appendChild(back)
    return sheet
}

export interface PlayRealisticFlipInput {
    container: HTMLDivElement
    viewport: HTMLDivElement
    fromPage: number
    toPage: number
    pageWidth: number
}

/**
 * 播放一次仿真翻页。返回 cleanup（立即拆除层）——调用方在新翻页开始或卸载时调用。
 * 时序契约：本函数同步挂上"旧页遮罩层"（0° 盖满视口，视觉与翻页前完全一致），
 * 调用方随后才能提交 setDisplayPage 换页 —— 同一任务内无绘制机会，不会闪新页。
 */
export function playRealisticFlip({ container, viewport, fromPage, toPage, pageWidth }: PlayRealisticFlipInput): () => void {
    const forward = toPage > fromPage
    const stage = document.createElement('div')
    // stage 自带 perspective：viewport 的 perspective 只作用于直接子级，隔层会失效
    stage.style.cssText = [
        'position:absolute', 'inset:0',
        `z-index:${FLIP_STAGE_Z}`,
        'overflow:hidden', 'pointer-events:none',
        'perspective:1200px',
    ].join(';')

    // 旧页纸：永远先以 0° 盖住视口（前进时它是被掀走的页；后退时它是垫底背景）
    const oldSheet = buildSnapshotSheet({ container, pageWidth, page: fromPage })
    stage.appendChild(oldSheet)
    viewport.appendChild(stage)

    const animations: Animation[] = []
    let removed = false
    const dispose = () => {
        if (removed) return
        removed = true
        animations.forEach((animation) => animation.cancel())
        stage.remove()
    }

    if (forward) {
        // 前进：旧页掀走（0→-168），底下已换好的新页逐渐露出
        const animation = oldSheet.animate(buildRealisticFlipKeyframes('forward'), {
            duration: PAGE_TURN_REALISTIC_MS,
            easing: FLIP_EASING,
            fill: 'forwards',
        })
        animation.onfinish = dispose
        animations.push(animation)
        return dispose
    }

    // 后退：旧页垫底不动；等 React 提交换页后（下一帧）克隆新页纸从 -168° 盖回。
    // 新页纸在其越过 -90°（正面开始可见）之前必须就位——rAF 级延迟远小于半程时长
    requestAnimationFrame(() => {
        if (removed) return
        const newSheet = buildSnapshotSheet({ container, pageWidth, page: toPage })
        newSheet.style.zIndex = '1'
        stage.appendChild(newSheet)
        const animation = newSheet.animate(buildRealisticFlipKeyframes('backward'), {
            duration: PAGE_TURN_REALISTIC_MS,
            easing: FLIP_EASING,
            fill: 'forwards',
        })
        animation.onfinish = dispose
        animations.push(animation)
    })
    // 兜底清理：后退路径的动画句柄在 rAF 后才有，超时保险丝防止 stage 悬挂
    const fallbackTimer = window.setTimeout(dispose, PAGE_TURN_REALISTIC_MS + 400)
    const originalDispose = dispose
    return () => {
        window.clearTimeout(fallbackTimer)
        originalDispose()
    }
}
