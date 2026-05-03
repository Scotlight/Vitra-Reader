interface ReaderDebugFlags {
    __VITRA_DEBUG_SHADOW_RENDERER__?: unknown
    __VITRA_DEBUG_SCROLL_READER__?: unknown
    __VITRA_DEBUG_CONTENT_ADAPTER__?: unknown
}

function debugFlags(): ReaderDebugFlags {
    return globalThis as typeof globalThis & ReaderDebugFlags
}

export function shouldLogShadowRendererDebug(): boolean {
    return import.meta.env.DEV && Boolean(debugFlags().__VITRA_DEBUG_SHADOW_RENDERER__)
}

export function shouldLogScrollReaderDebug(): boolean {
    return import.meta.env.DEV && Boolean(debugFlags().__VITRA_DEBUG_SCROLL_READER__)
}

export function shouldLogContentAdapterDebug(): boolean {
    return import.meta.env.DEV && Boolean(debugFlags().__VITRA_DEBUG_CONTENT_ADAPTER__)
}
