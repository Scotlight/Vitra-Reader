// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { loadConfigFromFile } from 'vite'

// Vite 会按 cwd 解析配置路径；避免 Node 导入被 Electron renderer 插件改写。
const configFile = 'vite.config.ts'
const assets = ['assets/index.js', 'assets/react-vendor.js', 'assets/index.css']

describe('desktop build asset paths', () => {
    let base: string

    beforeAll(async () => {
        const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, configFile)
        expect(loaded).not.toBeNull()
        base = loaded!.config.base!
    })

    it('uses relative URLs for the packaged renderer', () => {
        expect(base).toBe('./')
    })

    it.each([
        'file:///C:/Program%20Files/Vitra%20Reader/resources/app.asar/dist/index.html',
        'file:///D:/Vitra%20Reader/dist/index.html',
        'file:///opt/Vitra/resources/app.asar/dist/index.html',
    ])('keeps scripts, preloads and styles next to %s', (documentUrl) => {
        for (const asset of assets) {
            // file:// 下的根路径会指向磁盘根目录，必须保留安装目录及 app.asar 路径。
            expect(new URL(`${base}${asset}`, documentUrl).href)
                .toBe(new URL(`./${asset}`, documentUrl).href)
        }
    })

    it('preserves the GitHub Pages deployment prefix', async () => {
        const loaded = await loadConfigFromFile({ command: 'build', mode: 'web' }, configFile)
        expect(loaded?.config.base).toBe('/Vitra-Reader/')
        for (const asset of assets) {
            expect(new URL(`${loaded!.config.base}${asset}`, 'https://example.com/Vitra-Reader/').pathname)
                .toBe(`/Vitra-Reader/${asset}`)
        }
    })
})
