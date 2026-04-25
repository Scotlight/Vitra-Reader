import { useRef, useState, type ChangeEvent } from 'react'
import { db, type BookMeta } from '@/services/storageService'
import { parseBookMetadata } from '@/engine/core/contentProviderFactory'
import styles from './LibraryView.module.css'

type BookPropertiesDraft = {
    id: string
    title: string
    author: string
    description: string
    cover: string
    format: string
}

interface BookFormatPlaceholderProps {
    format?: string
}

const FORMAT_PLACEHOLDER_GRADIENT: Partial<Record<string, string>> = {
    epub: 'linear-gradient(180deg, #4f9ddf 0%, #2b78bf 100%)',
    pdf: 'linear-gradient(180deg, #f25f74 0%, #cd3b57 100%)',
    txt: 'linear-gradient(180deg, #7b8aa1 0%, #516178 100%)',
    mobi: 'linear-gradient(180deg, #8f7ce8 0%, #6a5bc3 100%)',
    azw: 'linear-gradient(180deg, #f2a75f 0%, #d68439 100%)',
    azw3: 'linear-gradient(180deg, #f09a4c 0%, #c9752f 100%)',
    html: 'linear-gradient(180deg, #3ebcb2 0%, #278f86 100%)',
    xml: 'linear-gradient(180deg, #5ca4d7 0%, #3e78b7 100%)',
    md: 'linear-gradient(180deg, #6bc48f 0%, #3c9964 100%)',
    fb2: 'linear-gradient(180deg, #9980d9 0%, #705bb8 100%)',
}

const BookFormatPlaceholder = ({ format }: BookFormatPlaceholderProps) => {
    const label = (format || '').replace(/^\./, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) || 'BOOK'
    const gradient = FORMAT_PLACEHOLDER_GRADIENT[format?.toLowerCase() || ''] || 'linear-gradient(180deg, #4f9ddf 0%, #2b78bf 100%)'
    return (
        <div className={styles.placeholderCover} style={{ background: gradient }}>
            <span>{label}</span>
        </div>
    )
}

interface BookPropertiesModalProps {
    book: BookMeta
    books: BookMeta[]
    onClose: () => void
    onSaved: () => Promise<void>
}

export const BookPropertiesModal = ({ book, books, onClose, onSaved }: BookPropertiesModalProps) => {
    const [draft, setDraft] = useState<BookPropertiesDraft>({
        id: book.id,
        title: book.title || '',
        author: book.author || '',
        description: book.description || '',
        cover: book.cover || '',
        format: book.format || 'epub',
    })
    const [saving, setSaving] = useState(false)
    const [status, setStatus] = useState('')
    const coverInputRef = useRef<HTMLInputElement | null>(null)

    const fileToDataUrl = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result)
                    return
                }
                reject(new Error('封面读取失败'))
            }
            reader.onerror = () => reject(new Error('封面读取失败'))
            reader.readAsDataURL(file)
        })
    }

    const handleCoverFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return
        try {
            const coverDataUrl = await fileToDataUrl(file)
            setDraft((prev) => ({ ...prev, cover: coverDataUrl }))
            setStatus('')
        } catch (error: unknown) {
            setStatus(`封面读取失败: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
            event.target.value = ''
        }
    }

    const getDefaultBookProperties = (b: BookMeta) => ({
        title: (b.originalTitle || b.title || '').trim(),
        author: (b.originalAuthor || b.author || '未知作者').trim() || '未知作者',
        description: b.originalDescription ?? b.description ?? '',
        cover: b.originalCover ?? b.cover ?? '',
    })

    const handleRestore = async () => {
        if (!draft.id) return
        const currentBook = books.find((item) => item.id === draft.id)
        if (!currentBook) {
            setStatus('未找到图书，无法恢复默认')
            return
        }

        setStatus('恢复默认中...')
        let defaults = getDefaultBookProperties(currentBook)
        const hasOriginalSnapshot = Boolean(
            currentBook.originalTitle
            || currentBook.originalAuthor
            || currentBook.originalDescription !== undefined
            || currentBook.originalCover !== undefined
        )

        if (!hasOriginalSnapshot) {
            try {
                const file = await db.bookFiles.get(currentBook.id)
                if (file?.data) {
                    const format = currentBook.format || 'epub'
                    const parsed = await parseBookMetadata(format, file.data, `${currentBook.title || 'book'}.${format}`)
                    const metaRecord = parsed as Record<string, unknown>
                    defaults = {
                        title: (parsed.title || defaults.title || '').trim(),
                        author: (parsed.author || defaults.author || '未知作者').trim() || '未知作者',
                        description: (typeof metaRecord.description === 'string' ? metaRecord.description : '') || '',
                        cover: (typeof metaRecord.cover === 'string' ? metaRecord.cover : '') || '',
                    }
                }
            } catch {
                // fallback to current/original snapshot
            }
        }

        setDraft((prev) => ({ ...prev, ...defaults }))
        setStatus('已恢复默认值（点击"保存属性"生效）')
    }

    const handleSave = async () => {
        if (!draft.id) return
        const title = draft.title.trim()
        if (!title) {
            setStatus('书名不能为空')
            return
        }

        const author = draft.author.trim() || '未知作者'
        const description = draft.description.trim()
        const currentBook = books.find((item) => item.id === draft.id)
        const patch: Partial<BookMeta> = { title, author, cover: draft.cover, description }
        if (currentBook) {
            if (!currentBook.originalTitle) patch.originalTitle = currentBook.title || title
            if (!currentBook.originalAuthor) patch.originalAuthor = currentBook.author || author
            if (currentBook.originalDescription === undefined) patch.originalDescription = currentBook.description || ''
            if (currentBook.originalCover === undefined) patch.originalCover = currentBook.cover || ''
        }

        setSaving(true)
        setStatus('保存中...')
        try {
            await db.books.update(draft.id, patch)
            await onSaved()
            onClose()
        } catch (error: unknown) {
            setStatus(`保存失败: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className={styles.settingsModalOverlay} onClick={onClose}>
            <div className={`${styles.dialogPanel} ${styles.bookPropertiesPanel}`} onClick={(event) => event.stopPropagation()}>
                <div className={styles.settingsHeader}>
                    <h3>图书属性</h3>
                    <button className={styles.closeBtn} onClick={onClose}>×</button>
                </div>

                <div className={styles.bookPropertiesBody}>
                    <div className={styles.bookCoverEditor}>
                        <div className={styles.bookCoverPreview}>
                            {draft.cover ? (
                                <img src={draft.cover} alt={draft.title || '封面'} />
                            ) : (
                                <BookFormatPlaceholder format={draft.format} />
                            )}
                        </div>
                        <div className={styles.rowActions}>
                            <input
                                ref={coverInputRef}
                                type="file"
                                accept="image/*"
                                className={styles.hiddenFileInput}
                                onChange={(event) => void handleCoverFileChange(event)}
                            />
                            <button className={styles.smallBtn} onClick={() => coverInputRef.current?.click()}>
                                更换封面
                            </button>
                            <button
                                className={styles.smallBtn}
                                onClick={() => setDraft((prev) => ({ ...prev, cover: '' }))}
                            >
                                移除封面
                            </button>
                        </div>
                    </div>

                    <label className={styles.settingRow}>
                        <span>书名</span>
                        <input
                            className={styles.textInput}
                            type="text"
                            value={draft.title}
                            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                        />
                    </label>

                    <label className={styles.settingRow}>
                        <span>作者</span>
                        <input
                            className={styles.textInput}
                            type="text"
                            value={draft.author}
                            onChange={(event) => setDraft((prev) => ({ ...prev, author: event.target.value }))}
                        />
                    </label>

                    <label className={`${styles.settingRow} ${styles.settingRowTop}`}>
                        <span>简介</span>
                        <textarea
                            className={styles.textAreaInput}
                            value={draft.description}
                            placeholder="输入图书简介..."
                            onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
                        />
                    </label>
                </div>

                {status && <div className={styles.syncStatus}>{status}</div>}
                <div className={styles.rowActions}>
                    <button className={styles.smallBtn} onClick={() => void handleRestore()} disabled={saving}>恢复默认</button>
                    <button className={styles.smallBtn} onClick={onClose} disabled={saving}>取消</button>
                    <button className={styles.syncPrimaryBtn} onClick={() => void handleSave()} disabled={saving}>
                        {saving ? '保存中...' : '保存属性'}
                    </button>
                </div>
            </div>
        </div>
    )
}
