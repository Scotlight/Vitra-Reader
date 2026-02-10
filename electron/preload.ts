import { contextBridge, ipcRenderer, shell } from 'electron'

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    openEpub: () => ipcRenderer.invoke('dialog:openEpub'),
    readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
    listSystemFonts: () => ipcRenderer.invoke('system:listFonts'),
    setWindowTheme: (payload: { themeId: string; customBgColor?: string | null; customTextColor?: string | null }) => ipcRenderer.send('window:setTheme', payload),
    openExternal: (url: string) => shell.openExternal(url),
    webdavSync: (method: 'upload' | 'download', config: any) => ipcRenderer.invoke(`webdav:${method}`, config),
})
