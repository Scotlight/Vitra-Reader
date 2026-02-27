export interface BlockMetrics {
    element: string
    offsetTop: number
    height: number
    isBreakable: boolean
}

export interface PageBoundary {
    sectionIndex: number
    startBlock: number
    endBlock: number
    startOffset: number
    endOffset: number
}

export interface VitraPaginateOptions {
    gap?: number
    minBreakableSpaceRatio?: number
}
