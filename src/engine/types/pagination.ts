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

export interface PaginateOptions {
    gap?: number
    minBreakableSpaceRatio?: number
}
