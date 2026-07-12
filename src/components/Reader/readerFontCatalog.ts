export type ReaderFontCategory = 'sans' | 'serif' | 'handwriting'

export interface ReaderFontCatalogItem {
    readonly id: string
    readonly displayName: string
    readonly family: string
    readonly category: ReaderFontCategory
    readonly format: 'opentype' | 'truetype'
    readonly license: string
    readonly licenseUrl: string
    readonly sizeBytes: number
    readonly sourceUrl: string
    readonly url: string
    readonly version: string
    readonly sha256: string
}

const NOTO_COMMIT = 'f8d157532fbfaeda587e826d4cd5b21a49186f7c'
const LXGW_COMMIT = '923ba9324a3139b05fa8e23ec8ca02804cdf3dfa'

export const READER_FONT_CATALOG: readonly ReaderFontCatalogItem[] = Object.freeze([
    {
        id: 'noto-sans-cjk-sc-regular',
        displayName: '思源黑体',
        family: 'Vitra Noto Sans CJK SC',
        category: 'sans',
        format: 'opentype',
        license: 'SIL Open Font License 1.1',
        licenseUrl: 'https://openfontlicense.org/',
        sizeBytes: 16_437_364,
        sourceUrl: 'https://github.com/notofonts/noto-cjk',
        url: `https://raw.githubusercontent.com/notofonts/noto-cjk/${NOTO_COMMIT}/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf`,
        version: NOTO_COMMIT.slice(0, 8),
        sha256: '2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b',
    },
    {
        id: 'noto-serif-cjk-sc-regular',
        displayName: '思源宋体',
        family: 'Vitra Noto Serif CJK SC',
        category: 'serif',
        format: 'opentype',
        license: 'SIL Open Font License 1.1',
        licenseUrl: 'https://openfontlicense.org/',
        sizeBytes: 24_543_080,
        sourceUrl: 'https://github.com/notofonts/noto-cjk',
        url: `https://raw.githubusercontent.com/notofonts/noto-cjk/${NOTO_COMMIT}/Serif/OTF/SimplifiedChinese/NotoSerifCJKsc-Regular.otf`,
        version: NOTO_COMMIT.slice(0, 8),
        sha256: '2a2eae2628df83556c54018c41e20fa532c1b862c5256ae8b3f23feb918d12ca',
    },
    {
        id: 'lxgw-wenkai-regular',
        displayName: '霞鹜文楷',
        family: 'Vitra LXGW WenKai',
        category: 'handwriting',
        format: 'truetype',
        license: 'SIL Open Font License 1.1',
        licenseUrl: 'https://openfontlicense.org/',
        sizeBytes: 25_575_676,
        sourceUrl: 'https://github.com/lxgw/LxgwWenKai',
        url: `https://raw.githubusercontent.com/lxgw/LxgwWenKai/${LXGW_COMMIT}/fonts/TTF/LXGWWenKai-Regular.ttf`,
        version: LXGW_COMMIT.slice(0, 8),
        sha256: '39ad71264b588165b469e35e6afb162a378dacd1f95348160240ba9038ac3009',
    },
])

export function formatFontDownloadSize(sizeBytes: number): string {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}
