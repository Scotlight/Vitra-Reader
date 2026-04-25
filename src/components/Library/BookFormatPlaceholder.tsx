import type { BookMeta } from '@/services/storageService'
import styles from './LibraryView.module.css'

type PlaceholderTheme = {
    label: string
    gradient: string
}

const DEFAULT_PLACEHOLDER_LABEL = 'BOOK'
const MAX_PLACEHOLDER_LABEL_LENGTH = 6
const FORMAT_PLACEHOLDER_GRADIENT: Partial<Record<NonNullable<BookMeta['format']>, string>> = {
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

const formatToPlaceholderLabel = (format?: string): string => {
    const cleaned = (format || '')
        .replace(/^\./, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase()
    return cleaned.slice(0, MAX_PLACEHOLDER_LABEL_LENGTH) || DEFAULT_PLACEHOLDER_LABEL
}

const getPlaceholderTheme = (format?: string): PlaceholderTheme => {
    const normalized = format?.toLowerCase() as NonNullable<BookMeta['format']> | undefined
    const gradient = (normalized && FORMAT_PLACEHOLDER_GRADIENT[normalized])
        || 'linear-gradient(180deg, #4f9ddf 0%, #2b78bf 100%)'
    return {
        label: formatToPlaceholderLabel(format),
        gradient,
    }
}

export const BookFormatPlaceholder = ({ format, compact = false }: { format?: string; compact?: boolean }) => {
    const theme = getPlaceholderTheme(format)
    const className = compact
        ? `${styles.placeholderCover} ${styles.placeholderCoverCompact}`
        : styles.placeholderCover

    return (
        <div className={className} style={{ background: theme.gradient }}>
            <span>{theme.label}</span>
        </div>
    )
}
