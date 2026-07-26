export type MobileSettingsPage =
    | 'readingMode'
    | 'font'
    | 'typography'
    | 'theme'
    | 'appearance'
    | 'stats'
    | 'translateService'
    | 'translateCache'
    | 'data'
    | 'about'

export const MOBILE_SETTINGS_PAGE_TITLES: Record<MobileSettingsPage, string> = {
    readingMode: '阅读方式',
    font: '字体',
    typography: '排版',
    theme: '主题与配色',
    appearance: '界面外观',
    stats: '阅读统计',
    translateService: '翻译服务',
    translateCache: '翻译缓存',
    data: '同步与备份',
    about: '关于 Vitra',
}
