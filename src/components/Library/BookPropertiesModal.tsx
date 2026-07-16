import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
    BOOK_SHELF_LABEL,
    BOOK_SHELF_LABEL_DISPLAY,
    BOOK_SHELF_LABEL_VALUES,
    db,
    normalizeShelfLabel,
    type BookMeta,
    type BookShelfLabel,
} from '@/services/storageService'
import { parseBookMetadata } from '@/engine/core/contentProviderFactory'
import type { GroupItem } from '@/hooks/groupManagerState'
import styles from './LibraryView.module.css'

type BookPropertiesDraft = {
    id: string
    title: string
    author: string
    description: string
    cover: string
    format: string
    publisher: string
    language: string
    shelfLabel: BookShelfLabel
    groupIds: string[]
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

const LANGUAGE_OPTIONS = [
    { value: '', label: '未指定' },
    { value: 'zh', label: '中文' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'es', label: 'Español' },
    { value: 'ru', label: 'Русский' },
    { value: 'other', label: '其他…' },
] as const

const BookFormatPlaceholder = ({ format }: BookFormatPlaceholderProps) => {
    const label = (format || '').replace(/^\./, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6) || 'BOOK'
    const gradient = FORMAT_PLACEHOLDER_GRADIENT[format?.toLowerCase() || ''] || 'linear-gradient(180deg, #4f9ddf 0%, #2b78bf 100%)'
    return (
        <div className={styles.placeholderCover} style={{ background: gradient }}>
            <span>{label}</span>
        </div>
    )
}

function resolveGroupIdsForBook(bookId: string, groupBookMap: Record<string, string[]>): string[] {
    return Object.entries(groupBookMap)
        .filter(([, ids]) => ids.includes(bookId))
        .map(([groupId]) => groupId)
}

interface BookPropertiesModalProps {
    book: BookMeta
    books: BookMeta[]
    groups: GroupItem[]
    groupBookMap: Record<string, string[]>
    onClose: () => void
    onSaved: () => Promise<void>
    onSaveGroupMembership: (bookId: string, groupIds: string[]) => Promise<void>
}

export const BookPropertiesModal = ({
    book,
    books,
    groups,
    groupBookMap,
    onClose,
    onSaved,
    onSaveGroupMembership,
}: BookPropertiesModalProps) => {
    const initialGroupIds = useMemo(
        () => resolveGroupIdsForBook(book.id, groupBookMap),
        [book.id, groupBookMap],
    )
    const knownLanguage = LANGUAGE_OPTIONS.some((item) => item.value === (book.language || ''))
        ? (book.language || '')
        : (book.language ? 'other' : '')
    const [draft, setDraft] = useState<BookPropertiesDraft>({
        id: book.id,
        title: book.title || '',
        author: book.author || '',
        description: book.description || '',
        cover: book.cover || '',
        format: book.format || 'epub',
        publisher: book.publisher || '',
        language: book.language || '',
        shelfLabel: normalizeShelfLabel(book.shelfLabel),
        groupIds: initialGroupIds,
    })
    const [languageSelect, setLanguageSelect] = useState(knownLanguage)
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
        // 恢复默认只回滚解析元数据，不改固定标签与自定义分组。
        publisher: b.publisher || '',
        language: b.language || '',
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
                        publisher: (typeof metaRecord.publisher === 'string' ? metaRecord.publisher : defaults.publisher) || '',
                        language: (typeof metaRecord.language === 'string' ? metaRecord.language : defaults.language) || '',
                    }
                }
            } catch {
                // fallback to current/original snapshot
            }
        }

        const nextLanguageSelect = LANGUAGE_OPTIONS.some((item) => item.value === defaults.language)
            ? defaults.language
            : (defaults.language ? 'other' : '')
        setLanguageSelect(nextLanguageSelect)
        setDraft((prev) => ({
            ...prev,
            title: defaults.title,
            author: defaults.author,
            description: defaults.description,
            cover: defaults.cover,
            publisher: defaults.publisher,
            language: defaults.language,
            // shelfLabel / groupIds 故意不动
        }))
        setStatus('已恢复默认值（点击"保存属性"生效；标签与分组未改动）')
    }

    const toggleGroupId = (groupId: string) => {
        setDraft((prev) => {
            const exists = prev.groupIds.includes(groupId)
            return {
                ...prev,
                groupIds: exists
                    ? prev.groupIds.filter((id) => id !== groupId)
                    : [...prev.groupIds, groupId],
            }
        })
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
        const publisher = draft.publisher.trim()
        const language = draft.language.trim()
        const currentBook = books.find((item) => item.id === draft.id)
        const now = Date.now()
        const shelfLabel = normalizeShelfLabel(draft.shelfLabel, BOOK_SHELF_LABEL.TO_READ)
        const shelfLabelChanged = normalizeShelfLabel(currentBook?.shelfLabel) !== shelfLabel

        const patch: Partial<BookMeta> = {
            title,
            author,
            cover: draft.cover,
            description,
            publisher: publisher || undefined,
            language: language || undefined,
            shelfLabel,
            metadataUpdatedAt: now,
        }
        if (shelfLabelChanged) {
            patch.shelfLabelUpdatedAt = now
        }
        if (currentBook) {
            if (!currentBook.originalTitle) patch.originalTitle = currentBook.title || title
            if (!currentBook.originalAuthor) patch.originalAuthor = currentBook.author || author
            if (currentBook.originalDescription === undefined) patch.originalDescription = currentBook.description || ''
            if (currentBook.originalCover === undefined) patch.originalCover = currentBook.cover || ''
        }

        setSaving(true)
        setStatus('保存中...')
        try {
            // 元数据与分组分表存储：先写 books，再写分组 map；任一步失败都会在 catch 暴露。
            await db.books.update(draft.id, patch)
            await onSaveGroupMembership(draft.id, draft.groupIds)
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

                    <label className={styles.settingRow}>
                        <span>出版社</span>
                        <input
                            className={styles.textInput}
                            type="text"
                            value={draft.publisher}
                            placeholder="可选"
                            onChange={(event) => setDraft((prev) => ({ ...prev, publisher: event.target.value }))}
                        />
                    </label>

                    <label className={styles.settingRow}>
                        <span>语言</span>
                        <div className={styles.languageField}>
                            <select
                                value={languageSelect}
                                onChange={(event) => {
                                    const next = event.target.value
                                    setLanguageSelect(next)
                                    if (next === 'other') {
                                        setDraft((prev) => ({ ...prev, language: prev.language || '' }))
                                        return
                                    }
                                    setDraft((prev) => ({ ...prev, language: next }))
                                }}
                            >
                                {LANGUAGE_OPTIONS.map((option) => (
                                    <option key={option.value || 'empty'} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            {languageSelect === 'other' && (
                                <input
                                    className={styles.textInput}
                                    type="text"
                                    value={draft.language}
                                    placeholder="输入语言代码或名称"
                                    onChange={(event) => setDraft((prev) => ({ ...prev, language: event.target.value }))}
                                />
                            )}
                        </div>
                    </label>

                    <div className={`${styles.settingRow} ${styles.settingRowTop}`}>
                        <span>固定标签</span>
                        <div className={styles.shelfLabelRadioGroup} role="radiogroup" aria-label="固定标签">
                            {BOOK_SHELF_LABEL_VALUES.map((label) => (
                                <label key={label} className={styles.shelfLabelRadio}>
                                    <input
                                        type="radio"
                                        name="shelfLabel"
                                        value={label}
                                        checked={draft.shelfLabel === label}
                                        onChange={() => setDraft((prev) => ({ ...prev, shelfLabel: label }))}
                                    />
                                    <span className={`${styles.shelfLabelChip} ${styles[`shelfLabelChip_${label}`]}`}>
                                        {BOOK_SHELF_LABEL_DISPLAY[label]}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className={`${styles.settingRow} ${styles.settingRowTop}`}>
                        <span>自定义分组</span>
                        {groups.length === 0 ? (
                            <span className={styles.mutedHint}>暂无分组，可在空白处右键新建</span>
                        ) : (
                            <div className={styles.groupCheckboxList}>
                                {groups.map((group) => (
                                    <label key={group.id} className={styles.groupCheckboxItem}>
                                        <input
                                            type="checkbox"
                                            checked={draft.groupIds.includes(group.id)}
                                            onChange={() => toggleGroupId(group.id)}
                                        />
                                        <span>{group.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

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
