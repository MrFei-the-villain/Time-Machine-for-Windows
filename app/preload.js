const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Senders
    runBackup: (source, dest) => ipcRenderer.send('run-backup', { source, dest }),
    runHourlyBackup: (source, dest) => ipcRenderer.send('run-hourly-backup', { source, dest }),
    runRestore: (source, dest) => ipcRenderer.send('run-restore', { source, dest }),
    runRescue: (drive, profile) => ipcRenderer.send('run-rescue', { drive, profile }),
    runRescueWithHourly: (drive, profile) => ipcRenderer.send('run-rescue-hourly', { drive, profile }),
    selectFolder: () => ipcRenderer.send('select-folder'),

    // Receivers
    onReply: (callback) => ipcRenderer.on('engine-reply', (event, data) => callback(data)),
    onFolderSelected: (callback) => ipcRenderer.on('folder-selected', (event, path) => callback(path)),
    onAutoUserFolder: (callback) => ipcRenderer.on('auto-user-folder', (event, path) => callback(path))
});
