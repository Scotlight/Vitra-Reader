import type { PdfDocumentProxy } from '@/types/pdfjs'
import type { PdfJsRuntime, PdfRuntimeKind } from './pdfTypes'

const RECOVERABLE_LEGACY_ERROR_MARKERS = [
    'tohex is not a function',
    'unknownerrorexception',
] as const

type PdfOpenResult = {
    doc: PdfDocumentProxy
    kind: PdfRuntimeKind
}

const runtimeCache: Partial<Record<PdfRuntimeKind, PdfJsRuntime>> = {}
const runtimeLoaders: Partial<Record<PdfRuntimeKind, Promise<PdfJsRuntime>>> = {}
const loggedLegacyPromotions = new Set<string>()

function shouldLogPdfRuntimeFallback(): boolean {
    if (!import.meta.env.DEV) return false
    return Boolean((globalThis as typeof globalThis & { __VITRA_PDF_DEBUG_RUNTIME_FALLBACK__?: unknown }).__VITRA_PDF_DEBUG_RUNTIME_FALLBACK__)
}

function formatRuntimeError(error: unknown): string {
    const text = String(error instanceof Error ? error.message : error || '').trim()
    return text || 'unknown runtime error'
}

function buildWorkerSrc(kind: PdfRuntimeKind): string {
    const workerPath = kind === 'legacy'
        ? 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'
        : 'pdfjs-dist/build/pdf.worker.min.mjs'

    if (import.meta.env.DEV && typeof window !== 'undefined') {
        return new URL(`/node_modules/${workerPath}`, window.location.origin).toString()
    }

    return new URL(workerPath, import.meta.url).toString()
}

async function loadModernRuntime(): Promise<PdfJsRuntime> {
    const runtime = await import('pdfjs-dist') as unknown as PdfJsRuntime
    runtime.GlobalWorkerOptions.workerSrc = buildWorkerSrc('modern')
    runtimeCache.modern = runtime
    return runtime
}

async function loadLegacyRuntime(): Promise<PdfJsRuntime> {
    const runtime = await import('pdfjs-dist/legacy/build/pdf.min.mjs') as unknown as PdfJsRuntime
    runtime.GlobalWorkerOptions.workerSrc = buildWorkerSrc('legacy')
    runtimeCache.legacy = runtime
    return runtime
}

export function shouldFallbackToLegacy(error: unknown): boolean {
    const text = String(error instanceof Error ? error.message : error || '').toLowerCase()
    return RECOVERABLE_LEGACY_ERROR_MARKERS.some((marker) => text.includes(marker))
}

export function promoteLegacyRuntime(reason: string, error: unknown): void {
    const signature = `${reason}:${formatRuntimeError(error).toLowerCase()}`
    if (loggedLegacyPromotions.has(signature)) return
    loggedLegacyPromotions.add(signature)
    if (shouldLogPdfRuntimeFallback()) {
        console.info(`[PdfProvider] switch runtime to legacy: ${reason}`, error)
    }
}

export async function getPdfRuntime(kind: PdfRuntimeKind = 'modern'): Promise<PdfJsRuntime> {
    const cached = runtimeCache[kind]
    if (cached) {
        return cached
    }

    const inFlight = runtimeLoaders[kind]
    if (inFlight) {
        return inFlight
    }

    const loader = (kind === 'legacy' ? loadLegacyRuntime() : loadModernRuntime())
        .finally(() => {
            delete runtimeLoaders[kind]
        })
    runtimeLoaders[kind] = loader
    return loader
}

export async function openPdfDocument(sourceBytes: Uint8Array, kind: PdfRuntimeKind = 'modern'): Promise<PdfDocumentProxy> {
    const runtime = await getPdfRuntime(kind)
    return runtime.getDocument({
        data: sourceBytes.slice(),
        disableAutoFetch: true,
        disableStream: true,
    }).promise
}

export async function openPdfDocumentWithFallback(sourceBytes: Uint8Array): Promise<PdfOpenResult> {
    try {
        return {
            doc: await openPdfDocument(sourceBytes, 'modern'),
            kind: 'modern',
        }
    } catch (error) {
        if (!shouldFallbackToLegacy(error)) {
            throw error
        }
        promoteLegacyRuntime('document open parser error', error)
        return {
            doc: await openPdfDocument(sourceBytes, 'legacy'),
            kind: 'legacy',
        }
    }
}
