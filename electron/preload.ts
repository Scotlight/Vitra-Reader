import { contextBridge, ipcRenderer } from 'electron'

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    openEpub: () => ipcRenderer.invoke('dialog:openEpub'),
    readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
    listSystemFonts: () => ipcRenderer.invoke('system:listFonts'),
    getProcessMemoryInfo: () => ipcRenderer.invoke('system:getProcessMemoryInfo'),
    getAutoStartOnLogin: () => ipcRenderer.invoke('system:getAutoStartOnLogin'),
    setAutoStartOnLogin: (enabled: boolean) => ipcRenderer.invoke('system:setAutoStartOnLogin', enabled),
    setWindowTheme: (payload: { themeId: string; customBgColor?: string | null; customTextColor?: string | null }) => ipcRenderer.send('window:setTheme', payload),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    webdavSync: (method: 'upload' | 'download' | 'test' | 'head', config: { url: string; username: string; password: string; data?: string; ifMatch?: string; ifNoneMatch?: string }) => ipcRenderer.invoke(`webdav:${method}`, config),
    translateRequest: (payload: { url: string; method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string }) =>
        ipcRenderer.invoke('translate:request', payload),
    safeStorageEncrypt: (plaintext: string) => ipcRenderer.invoke('safeStorage:encrypt', plaintext),
    safeStorageDecrypt: (cipherBase64: string) => ipcRenderer.invoke('safeStorage:decrypt', cipherBase64),
    safeStorageIsAvailable: () => ipcRenderer.invoke('safeStorage:isAvailable'),
})
