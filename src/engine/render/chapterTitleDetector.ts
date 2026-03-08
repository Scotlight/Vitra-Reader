/**
 * 共享章节标题检测模块
 *
 * 合并 txtProvider 与 vitraSectionSplitter 的标题检测逻辑，
 * 供所有格式的章节分割器统一使用。
 */

// ─── 常量 ────────────────────────────────────────────

/** 标题候选行最大长度（超过即排除） */
export const TITLE_CANDIDATE_MAX_LENGTH = 42

/** 默认章节标签（无法提取标题时使用） */
export const DEFAULT_SECTION_LABEL = '未命名章节'

/** 空章节 HTML 占位（统一所有 Provider） */
export const EMPTY_SECTION_HTML = '<p>(空章节)</p>'

/** 默认文档标签（整本书无章节时的 fallback 标题） */
export const DEFAULT_DOCUMENT_LABEL = '正文'

// ─── 内部匹配规则 ───────────────────────────────────

/** 章/节/卷等关键词（简繁体） */
const CHAPTER_KEYWORDS = ['章', '节', '回', '節', '卷', '部', '輯', '辑', '話', '集', '话', '篇']

/** 特殊起始词（中英文简繁体） */
const SPECIAL_STARTS = [
    'CHAPTER',
    'Chapter',
    'Prologue',
    'Epilogue',
    '序章',
    '前言',
    '声明',
    '写在前面的话',
    '后记',
    '楔子',
    '后序',
    '章节目录',
    '尾声',
    '聲明',
    '寫在前面的話',
    '後記',
    '後序',
    '章節目錄',
    '尾聲',
]

/** 正文标点（出现即排除，仅 TXT 模式启用） */
const BODY_PUNCTUATION = /[。；;，,！!？?…—"""'''：:]/

/** 中文数字（含繁体大写） */
const ZH_NUM = /^[\u96f6\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u4ebf\u5146\u58f9\u8d30\u53c1\u8086\u4f0d\u9646\u67d2\u634c\u7396\u4e24\u842c\u5169]+$/

// ─── 公共函数 ────────────────────────────────────────

export interface ChapterTitleOptions {
    /** 启用正文标点排除（TXT 模式应设为 true，HTML 模式默认 false） */
    excludeBodyPunctuation?: boolean
    /** 自定义最大长度（默认 TITLE_CANDIDATE_MAX_LENGTH） */
    maxLength?: number
}

/**
 * 规范化标题行文本：去除换行/制表/装饰符号、压缩空格、截断
 */
export function normalizeTitleLine(line: string): string {
    return line
        .trim()
        .replace(/[\r\n\t]/g, '')
        .replace(/[=\-_+]/g, '')
        .replace(/\s+/g, ' ')
        .slice(0, 100)
}

/**
 * 判断一行文本是否为章节标题
 *
 * 合并规则：
 * 1. 长度检查
 * 2. （可选）正文标点排除
 * 3. 特殊起始词匹配
 * 4. 「第X章/节/卷...」模式（支持阿拉伯数字 + 中文数字含繁体大写）
 * 5. 「卷N」模式
 * 6. 英文 chapter N / prologue / epilogue 正则（来自 SectionSplitter）
 */
export function isChapterTitle(line: string, options?: ChapterTitleOptions): boolean {
    const maxLen = options?.maxLength ?? TITLE_CANDIDATE_MAX_LENGTH
    const cleaned = normalizeTitleLine(line)
    if (!cleaned || cleaned.length >= maxLen) return false

    // 特殊起始词（优先于标点排除，标题中允许含标点）
    if (SPECIAL_STARTS.some((prefix) => cleaned.startsWith(prefix))) return true

    // 「第X章/节/卷/部/篇/回/集...」模式（优先于标点排除）
    if (cleaned.startsWith('第')) {
        for (const keyword of CHAPTER_KEYWORDS) {
            const keywordIndex = cleaned.indexOf(keyword)
            if (keywordIndex <= 1) continue
            const mid = cleaned.substring(1, keywordIndex).trim()
            if (ZH_NUM.test(mid) || /^\d+$/.test(mid)) return true
        }
    }

    // 「卷N」模式（优先于标点排除）
    if (cleaned.startsWith('卷')) {
        const rest = cleaned.substring(1).trim().split(/\s+/)[0]
        if (rest && (ZH_NUM.test(rest) || /^\d+$/.test(rest))) return true
    }

    // 英文 chapter N / prologue / epilogue（优先于标点排除）
    if (/^chapter\s+\d+/i.test(cleaned)) return true

    // 正文标点排除（TXT 模式）—— 放在最后，仅过滤不匹配任何已知模式的行
    if (options?.excludeBodyPunctuation && BODY_PUNCTUATION.test(cleaned)) return false

    return false
}
