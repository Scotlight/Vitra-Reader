import type { PdfDocumentProxy } from '../../../../types/pdfjs'
import type { PdfJsRuntime, PdfRuntimeKind } from './pdfTypes'

const RECOVERABLE_LEGACY_ERROR_MARKERS = [
    'tohex is not a function',
    'unknownerrorexception',
] as const

let cachedPdfRuntime: PdfJsRuntime | null = null
let cachedRuntimeKind: PdfRuntimeKind | null = null
let forceLegacyRuntime = false

function buildWorkerSrc(kind: PdfRuntimeKind): string {
    const workerPath = kind === 'legacy'
        ? 'pdfjs-dist/legacy/build/pdf.worker.mjs'
        : 'pdfjs-dist/build/pdf.worker.min.mjs'
    return new URL(workerPath, import.meta.url).toString()
}

async function loadModernRuntime(): Promise<PdfJsRuntime> {
    const runtime = await import('pdfjs-dist') as unknown as PdfJsRuntime
    runtime.GlobalWorkerOptions.workerSrc = buildWorkerSrc('modern')
    cachedPdfRuntime = runtime
    cachedRuntimeKind = 'modern'
    return runtime
}

async function loadLegacyRuntime(): Promise<PdfJsRuntime> {
    const runtime = await import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as PdfJsRuntime
    runtime.GlobalWorkerOptions.workerSrc = buildWorkerSrc('legacy')
    cachedPdfRuntime = runtime
    cachedRuntimeKind = 'legacy'
    return runtime
}

export function shouldFallbackToLegacy(error: unknown): boolean {
    const text = String(error instanceof Error ? error.message : error || '').toLowerCase()
    return RECOVERABLE_LEGACY_ERROR_MARKERS.some((marker) => text.includes(marker))
}

export function promoteLegacyRuntime(reason: string, error: unknown): void {
    if (!forceLegacyRuntime) {
        console.warn(`[PdfProvider] switch runtime to legacy: ${reason}`, error)
    }
    forceLegacyRuntime = true
    if (cachedRuntimeKind === 'modern') {
        cachedPdfRuntime = null
        cachedRuntimeKind = null
    }
}

export async function getPdfRuntime(forceLegacy = false): Promise<PdfJsRuntime> {
    const useLegacy = forceLegacy || forceLegacyRuntime
    if (cachedPdfRuntime && cachedRuntimeKind && (!useLegacy || cachedRuntimeKind === 'legacy')) {
        return cachedPdfRuntime
    }

    if (!useLegacy) {
        try {
            return await loadModernRuntime()
        } catch (error) {
            console.warn('[PdfProvider] modern runtime load failed, fallback to legacy:', error)
        }
    }

    return loadLegacyRuntime()
}

export async function openPdfDocument(sourceBytes: Uint8Array, forceLegacy = false): Promise<PdfDocumentProxy> {
    const runtime = await getPdfRuntime(forceLegacy || forceLegacyRuntime)
    return runtime.getDocument({
        data: sourceBytes,
        disableAutoFetch: true,
        disableStream: true,
    }).promise
}

export async function openPdfDocumentWithFallback(sourceBytes: Uint8Array): Promise<PdfDocumentProxy> {
    try {
        return await openPdfDocument(sourceBytes, false)
    } catch (error) {
        if (!shouldFallbackToLegacy(error)) {
            throw error
        }
        promoteLegacyRuntime('document open parser error', error)
        return openPdfDocument(sourceBytes, true)
    }
}
