import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path'

const EVENTS_BROWSER_ENTRY = path.resolve(__dirname, 'node_modules/events/events.js')
const STREAM_BROWSER_ENTRY = path.resolve(__dirname, 'node_modules/stream-browserify/index.js')

const DOCX_ARCHIVE_VENDOR_PACKAGES = [
    '/jszip/',
    '/pako/',
    '/lie/',
    '/immediate/',
] as const

const DOCX_SUPPORT_VENDOR_PACKAGES = [
    '/@xmldom/xmldom/',
    '/base64-js/',
    '/bluebird/',
    '/dingbat-to-unicode/',
    '/lop/',
    '/path-is-absolute/',
    '/underscore/',
    '/xmlbuilder/',
] as const

function includesAnyPackage(id: string, packages: readonly string[]): boolean {
    return packages.some((packagePath) => id.includes(`/node_modules${packagePath}`))
}

export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        exclude: ['node_modules', 'dist', 'dist-electron', 'electron'],
    },
    plugins: [
        react(),
        electron([
            {
                // Main process entry
                entry: 'electron/main.ts',
                vite: {
                    build: {
                        outDir: 'dist-electron',
                    },
                },
            },
            {
                // Preload script
                entry: 'electron/preload.ts',
                onstart(args) {
                    args.reload()
                },
                vite: {
                    build: {
                        outDir: 'dist-electron',
                    },
                },
            },
        ]),
        renderer(),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            events: EVENTS_BROWSER_ENTRY,
            stream: STREAM_BROWSER_ENTRY,
        },
    },
    server: {
        port: 5173,
        strictPort: true,
        host: 'localhost',
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    const normalizedId = id.replace(/\\/g, '/').toLowerCase()
                    if (!normalizedId.includes('/node_modules/')) return

                    if (normalizedId.includes('/pdfjs-dist/legacy/')) {
                        return 'pdf-legacy-vendor'
                    }

                    if (normalizedId.includes('/pdfjs-dist/')) {
                        return 'pdf-modern-vendor'
                    }

                    if (normalizedId.includes('/mammoth/')) {
                        return 'docx-vendor'
                    }

                    if (includesAnyPackage(normalizedId, DOCX_ARCHIVE_VENDOR_PACKAGES)) {
                        return 'archive-vendor'
                    }

                    if (includesAnyPackage(normalizedId, DOCX_SUPPORT_VENDOR_PACKAGES)) {
                        return 'docx-support-vendor'
                    }

                    if (
                        normalizedId.includes('/epubjs/')
                    ) {
                        return 'epub-vendor'
                    }

                    if (normalizedId.includes('/mobi/')) {
                        return 'mobi-vendor'
                    }

                    if (normalizedId.includes('/marked/')) {
                        return 'markdown-vendor'
                    }

                    if (
                        normalizedId.includes('/react/')
                        || normalizedId.includes('/react-dom/')
                        || normalizedId.includes('/framer-motion/')
                        || normalizedId.includes('/zustand/')
                    ) {
                        return 'react-vendor'
                    }

                    if (normalizedId.includes('/dexie/')) {
                        return 'data-vendor'
                    }
                },
            },
        },
    },
})
