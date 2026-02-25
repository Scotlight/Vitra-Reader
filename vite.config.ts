import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path'

export default defineConfig({
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

                    if (
                        normalizedId.includes('/epubjs/')
                    ) {
                        return 'epub-vendor'
                    }

                    if (normalizedId.includes('/pdfjs-dist/')) {
                        return 'pdf-vendor'
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
