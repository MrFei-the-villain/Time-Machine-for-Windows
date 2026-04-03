const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Senders
    runBackup: (source, dest) => ipcRenderer.send('run-backup', { source, dest }),
    runBackupCompressed: (source, dest) => ipcRenderer.send('run-backup-compressed', { source, dest }),
    runBackupEncrypted: (source, dest, password) => ipcRenderer.send('run-backup-encrypted', { source, dest, password }),
    runHourlyBackup: (source, dest) => ipcRenderer.send('run-hourly-backup', { source, dest }),
    runHourlyBackupCompressed: (source, dest) => ipcRenderer.send('run-hourly-backup-compressed', { source, dest }),
    runRestore: (source, dest) => ipcRenderer.send('run-restore', { source, dest }),
    runRestoreCompressed: (source, dest) => ipcRenderer.send('run-restore-compressed', { source, dest }),
    runRestoreEncrypted: (source, dest, password) => ipcRenderer.send('run-restore-encrypted', { source, dest, password }),
    runRescue: (drive, profile) => ipcRenderer.send('run-rescue', { drive, profile }),
    runRescueWithHourly: (drive, profile) => ipcRenderer.send('run-rescue-hourly', { drive, profile }),
    selectFolder: () => ipcRenderer.send('select-folder'),
    getStorageInfo: (path) => ipcRenderer.send('get-storage-info', { path }),
    getStorageAll: () => ipcRenderer.send('get-storage-all'),
    setAppPassword: (password) => ipcRenderer.send('set-app-password', { password }),
    checkAppPassword: (password) => ipcRenderer.send('check-app-password', { password }),
    removeAppPassword: () => ipcRenderer.send('remove-app-password'),
    verifyPassword: (path, password) => ipcRenderer.send('verify-password', { path, password }),
    previewFiles: (path) => ipcRenderer.send('preview-files', { path }),
    confirmQuit: () => ipcRenderer.send('confirm-quit'),
    
    // Settings
    saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
    minimizeNow: () => ipcRenderer.send('minimize-now'),
    setOperationRunning: (running) => ipcRenderer.send('set-operation-running', running),

    // Password Windows
    openPasswordEntry: (mode) => ipcRenderer.send('open-password-entry', { mode }),
    openPasswordSet: () => ipcRenderer.send('open-password-set'),

    // Receivers
    onReply: (callback) => ipcRenderer.on('engine-reply', (event, data) => callback(data)),
    onFolderSelected: (callback) => ipcRenderer.on('folder-selected', (event, path) => callback(path)),
    onAutoUserFolder: (callback) => ipcRenderer.on('auto-user-folder', (event, path) => callback(path)),
    onAppPasswordStatus: (callback) => ipcRenderer.on('app-password-status', (event, status) => callback(status)),
    onRequestPasswordForQuit: (callback) => ipcRenderer.on('request-password-for-quit', (event) => callback()),
    onLoadSettings: (callback) => ipcRenderer.on('load-settings', (event, settings) => callback(settings)),
    onSaveAndMinimize: (callback) => ipcRenderer.on('save-and-minimize', (event) => callback())
});
