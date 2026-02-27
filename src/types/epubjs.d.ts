/** epub.js 内部类型的最小声明，供 epub 相关模块使用 */

export interface EpubSpineItem {
    index: number
    href: string
    idref?: string
    id?: string
    linear: boolean
    url?: string
    document?: Document
    load(loader: (url: string) => Promise<unknown>): Promise<void>
    unload(): void
    find?(keyword: string): unknown[]
    serialize?(): string
    output?(): string
}

export interface EpubArchive {
    createUrl(path: string): Promise<string | null>
}

export interface EpubSpine {
    spineItems: EpubSpineItem[]
    get(target: string | number): EpubSpineItem | undefined
}

export interface EpubManifestItem {
    href?: string
    [key: string]: unknown
}

export interface EpubPackageMetadata {
    title?: string
    creator?: string
    description?: string
    publisher?: string
    language?: string
}

export interface EpubPackaging {
    manifest: Record<string, EpubManifestItem>
}

/**
 * epub.js Book 的内部扩展接口
 * Book 公开类型不暴露 spine.spineItems / archive / packaging 等属性，
 * 此接口用于通过 `book as unknown as EpubBookInternal` 安全访问。
 */
export interface EpubBookInternal {
    ready: Promise<void>
    spine: EpubSpine
    archive: EpubArchive
    packaging: EpubPackaging
    /** epub.js 旧版 package 属性（同 packaging） */
    package: {
        metadata: EpubPackageMetadata
    }
    load(url: string): Promise<unknown>
    resolve(href: string): string | undefined
    destroy(): void
}
