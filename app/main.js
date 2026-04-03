const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let win;
let tray = null;
let isQuitting = false;
let currentProgress = 0;
let isOperationRunning = false;
let appPasswordSet = false;
let passwordWindow = null;
let passwordSetWindow = null;

function getAppDataPath() {
    return process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
}

function getTimeMachinePath() {
    const appDataPath = getAppDataPath();
    const timeMachinePath = path.join(appDataPath, 'TimeMachine');
    if (!fs.existsSync(timeMachinePath)) {
        fs.mkdirSync(timeMachinePath, { recursive: true });
    }
    return timeMachinePath;
}

function getSettingsPath() {
    return path.join(getTimeMachinePath(), 'settings.json');
}

function getDefaultSettings() {
    return {
        backupSource: '',
        backupDest: '',
        restoreSource: '',
        restoreDest: '',
        usbDrive: '',
        userProfile: '',
        useCompression: true,
        useEncryption: false,
        lastTab: 'backup',
        minimizeToTray: true,
        lastModified: null
    };
}

function loadSettings() {
    try {
        const settingsPath = getSettingsPath();
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf8');
            const settings = JSON.parse(data);
            return { ...getDefaultSettings(), ...settings };
        }
    } catch (err) {
        console.error('Error loading settings:', err);
    }
    return getDefaultSettings();
}

function saveSettings(settings) {
    try {
        const settingsPath = getSettingsPath();
        const fullSettings = {
            ...getDefaultSettings(),
            ...settings,
            lastModified: new Date().toISOString()
        };
        fs.writeFileSync(settingsPath, JSON.stringify(fullSettings, null, 2));
    } catch (err) {
        console.error('Error saving settings:', err);
    }
}

function showWindow() {
    if (!win || win.isDestroyed()) {
        createWindow();
    } else {
        win.show();
        win.focus();
    }
}

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 840,
        frame: false,
        transparent: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win.loadFile('index.html');

    win.webContents.on('did-finish-load', () => {
        const userFolder = autoDetectUserFolder();
        if (userFolder) {
            win.webContents.send('auto-user-folder', userFolder);
        }
        checkAppPasswordSet();
        
        const settings = loadSettings();
        win.webContents.send('load-settings', settings);
    });

    win.on('close', (event) => {
        if (isOperationRunning) {
            event.preventDefault();
            return false;
        }
        if (!isQuitting) {
            event.preventDefault();
            win.webContents.send('save-and-minimize');
            return false;
        }
    });

    win.on('minimize', (event) => {
        event.preventDefault();
        win.webContents.send('save-and-minimize');
    });
}

function createPasswordWindow(mode) {
    if (passwordWindow && !passwordWindow.isDestroyed()) {
        passwordWindow.focus();
        return;
    }

    passwordWindow = new BrowserWindow({
        width: 380,
        height: 380,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    passwordWindow.loadFile('password-entry.html');

    passwordWindow.webContents.on('did-finish-load', () => {
        passwordWindow.webContents.send('init-password-window', { mode, passwordSet: appPasswordSet });
    });

    passwordWindow.on('closed', () => {
        passwordWindow = null;
    });
}

function createPasswordSetWindow() {
    if (passwordSetWindow && !passwordSetWindow.isDestroyed()) {
        passwordSetWindow.focus();
        return;
    }

    passwordSetWindow = new BrowserWindow({
        width: 380,
        height: 420,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    passwordSetWindow.loadFile('password-set.html');

    passwordSetWindow.on('closed', () => {
        passwordSetWindow = null;
    });
}

function checkAppPasswordSet() {
    const passwordFile = path.join(getTimeMachinePath(), 'app_password.json');
    
    if (fs.existsSync(passwordFile)) {
        appPasswordSet = true;
        if (win && win.webContents) {
            win.webContents.send('app-password-status', true);
        }
    } else {
        appPasswordSet = false;
        if (win && win.webContents) {
            win.webContents.send('app-password-status', false);
        }
    }
}

function autoDetectUserFolder() {
    const possiblePaths = [
        process.env.USERPROFILE,
        process.env.HOME,
        path.join('C:', 'Users', process.env.USERNAME)
    ];

    for (const folderPath of possiblePaths) {
        if (folderPath && fs.existsSync(folderPath)) {
            return folderPath;
        }
    }

    try {
        const usersPath = path.join('C:', 'Users');
        if (fs.existsSync(usersPath)) {
            const users = fs.readdirSync(usersPath).filter(user => {
                const userPath = path.join(usersPath, user);
                return fs.statSync(userPath).isDirectory() && 
                       !['Public', 'Default', 'Default User', 'All Users'].includes(user);
            });
            
            if (users.length > 0) {
                return path.join(usersPath, users[0]);
            }
        }
    } catch (err) {
        console.error('Error scanning for user folder:', err);
    }

    return null;
}

function updateTrayProgress(percent, status) {
    if (!tray) return;
    
    currentProgress = percent;
    isOperationRunning = percent < 100 && percent > 0;
    
    let tooltip = 'Time Machine';
    if (isOperationRunning) {
        tooltip = `Time Machine - ${percent}% - ${status || 'Processing...'}`;
    } else if (percent === 100) {
        tooltip = 'Time Machine - Complete';
    } else {
        tooltip = 'Time Machine - Ready';
    }
    
    tray.setToolTip(tooltip);
}

function createTray() {
    const iconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVQ4T2NkYGD4z0AEYBwFgwlAAXJNGQVDBRBtANEmjIKhANEmjIKhAB7wABH0ADr1AAAAAElFTkSuQmCC';
    const trayIcon = nativeImage.createFromDataURL(iconDataUrl);
    
    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Show Time Machine', 
            click: () => {
                showWindow();
            }
        },
        { type: 'separator' },
        { 
            label: 'Quit', 
            click: () => {
                createPasswordWindow('quit');
            }
        }
    ]);

    tray.setToolTip('Time Machine - Ready');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        showWindow();
    });
}

function getEnginePath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'engine', 'TimeMachineEngine.exe');
    }
    return path.join(__dirname, '..', 'engine', 'bin', 'Debug', 'net8.0', 'win-x64', 'TimeMachineEngine.exe');
}

function parseEngineOutput(data) {
    try {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                try {
                    const json = JSON.parse(line);
                    if (win && win.webContents) {
                        win.webContents.send('engine-reply', json);
                    }
                    
                    if (json.type === 'progress') {
                        updateTrayProgress(parseInt(json.data), '');
                    } else if (json.type === 'status') {
                        updateTrayProgress(currentProgress, json.data);
                    } else if (json.type === 'complete') {
                        updateTrayProgress(100, 'Complete');
                        setTimeout(() => updateTrayProgress(0, ''), 3000);
                    }
                } catch (e) {
                }
            }
        });
    } catch (err) {
        console.error("Error parsing engine output:", err);
    }
}

// --- IPC Handlers ---

ipcMain.on('select-folder', async (event) => {
    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
        win.webContents.send('folder-selected', result.filePaths[0]);
    }
});

ipcMain.on('run-backup', (event, data) => {
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['backup', data.source, data.dest]);

    proc.stdout.on('data', parseEngineOutput);

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });

    proc.on('close', (code) => {
        console.log(`Engine process exited with code ${code}`);
    });
});

ipcMain.on('run-backup-compressed', (event, data) => {
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['backup-compressed', data.source, data.dest]);

    proc.stdout.on('data', parseEngineOutput);

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });

    proc.on('close', (code) => {
        console.log(`Engine process exited with code ${code}`);
    });
});

ipcMain.on('run-backup-encrypted', (event, data) => {
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['backup-encrypted', data.source, data.dest, data.password]);

    proc.stdout.on('data', parseEngineOutput);

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });

    proc.on('close', (code) => {
        console.log(`Engine process exited with code ${code}`);
    });
});

ipcMain.on('run-restore', (event, data) => {
    const enginePath = getEnginePath();
    let args = ['restore', data.source, data.dest];
    
    const proc = spawn(enginePath, args);

    proc.stdout.on('data', parseEngineOutput);

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });

    proc.on('close', (code) => {
        console.log(`Engine process exited with code ${code}`);
    });
});

ipcMain.on('run-restore-compressed', (event, data) => {
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['restore-compressed', data.source, data.dest]);

    proc.stdout.on('data', parseEngineOutput);

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });

    proc.on('close', (code) => {
        console.log(`Engine process exited with code ${code}`);
    });
});

ipcMain.on('run-restore-encrypted', (event, data) => {
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['restore-encrypted', data.source, data.dest, data.password]);

    proc.stdout.on('data', parseEngineOutput);

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });

    proc.on('close', (code) => {
        console.log(`Engine process exited with code ${code}`);
    });
});

ipcMain.on('run-hourly-backup', (event, data) => {
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['hourly', data.source, data.dest]);

    proc.stdout.on('data', parseEngineOutput);

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });

    proc.on('close', (code) => {
        console.log(`Engine process exited with code ${code}`);
    });
});

ipcMain.on('run-hourly-backup-compressed', (event, data) => {
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['hourly-compressed', data.source, data.dest]);

    proc.stdout.on('data', parseEngineOutput);

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });

    proc.on('close', (code) => {
        console.log(`Engine process exited with code ${code}`);
    });
});

ipcMain.on('run-rescue', (event, data) => {
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['rescue', data.drive, data.profile]);

    proc.stdout.on('data', parseEngineOutput);

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });

    proc.on('close', (code) => {
        console.log(`Engine process exited with code ${code}`);
    });
});

ipcMain.on('run-rescue-hourly', (event, data) => {
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['rescue-hourly', data.drive, data.profile]);

    proc.stdout.on('data', parseEngineOutput);

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });

    proc.on('close', (code) => {
        console.log(`Engine process exited with code ${code}`);
    });
});

ipcMain.on('get-storage-info', (event, data) => {
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['storage-info', data.path]);

    proc.stdout.on('data', parseEngineOutput);

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });
});

ipcMain.on('get-storage-all', (event) => {
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['storage-all']);

    proc.stdout.on('data', parseEngineOutput);

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });
});

ipcMain.on('set-app-password', (event, data) => {
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['set-app-password', data.password]);

    proc.stdout.on('data', (data) => {
        parseEngineOutput(data);
        checkAppPasswordSet();
    });

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });
});

ipcMain.on('check-app-password', (event, data) => {
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['check-app-password', data.password]);

    proc.stdout.on('data', parseEngineOutput);

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });
});

ipcMain.on('remove-app-password', (event) => {
    try {
        const passwordFile = path.join(getTimeMachinePath(), 'app_password.json');
        
        if (fs.existsSync(passwordFile)) {
            fs.unlinkSync(passwordFile);
            appPasswordSet = false;
            if (win && win.webContents) {
                win.webContents.send('engine-reply', { type: 'password-removed', data: 'true' });
                win.webContents.send('app-password-status', false);
            }
        }
    } catch (err) {
        console.error('Error removing password:', err);
        if (win && win.webContents) {
            win.webContents.send('engine-reply', { type: 'error', data: 'Failed to remove password' });
        }
    }
});

ipcMain.on('verify-password', (event, data) => {
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['verify-password', data.path, data.password]);

    proc.stdout.on('data', parseEngineOutput);

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });
});

ipcMain.on('preview-files', (event, data) => {
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['preview-files', data.path]);

    proc.stdout.on('data', parseEngineOutput);

    proc.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
        if (win) win.webContents.send('engine-reply', { type: 'error', data: data.toString() });
    });
});

ipcMain.on('confirm-quit', (event) => {
    isQuitting = true;
    app.quit();
});

ipcMain.on('save-settings', (event, data) => {
    saveSettings(data);
});

ipcMain.on('minimize-now', (event) => {
    if (win && !win.isDestroyed()) {
        win.hide();
    }
});

ipcMain.on('set-operation-running', (event, running) => {
    isOperationRunning = running;
});

ipcMain.on('open-password-entry', (event, data) => {
    createPasswordWindow(data.mode);
});

ipcMain.on('open-password-set', (event) => {
    createPasswordSetWindow();
});

ipcMain.on('password-submit', (event, data) => {
    const { password, mode } = data;
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['check-app-password', password]);

    let output = '';
    proc.stdout.on('data', (data) => {
        output += data.toString();
    });

    proc.on('close', (code) => {
        try {
            const lines = output.trim().split('\n');
            let result = null;
            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    if (json.type === 'password-result') {
                        result = json.data;
                        break;
                    }
                } catch (e) {}
            }

            if (result === 'true') {
                if (passwordWindow && !passwordWindow.isDestroyed()) {
                    passwordWindow.webContents.send('password-success');
                    setTimeout(() => {
                        if (passwordWindow && !passwordWindow.isDestroyed()) {
                            passwordWindow.close();
                        }
                    }, 1500);
                }

                if (mode === 'quit') {
                    isQuitting = true;
                    setTimeout(() => app.quit(), 1500);
                } else if (mode === 'change') {
                    if (passwordWindow && !passwordWindow.isDestroyed()) {
                        passwordWindow.webContents.send('proceed-to-new-password');
                    }
                } else if (mode === 'remove') {
                    const passwordFile = path.join(getTimeMachinePath(), 'app_password.json');
                    if (fs.existsSync(passwordFile)) {
                        fs.unlinkSync(passwordFile);
                        appPasswordSet = false;
                        if (win && win.webContents) {
                            win.webContents.send('engine-reply', { type: 'password-removed', data: 'true' });
                            win.webContents.send('app-password-status', false);
                        }
                    }
                }
            } else {
                if (passwordWindow && !passwordWindow.isDestroyed()) {
                    passwordWindow.webContents.send('password-error', { message: 'Incorrect password.' });
                }
            }
        } catch (err) {
            console.error('Error checking password:', err);
            if (passwordWindow && !passwordWindow.isDestroyed()) {
                passwordWindow.webContents.send('password-error', { message: 'Error verifying password.' });
            }
        }
    });
});

ipcMain.on('password-window-cancel', (event, data) => {
    if (passwordWindow && !passwordWindow.isDestroyed()) {
        passwordWindow.close();
    }
});

ipcMain.on('password-set-new', (event, data) => {
    const { password } = data;
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['set-app-password', password]);

    let output = '';
    proc.stdout.on('data', (chunk) => {
        output += chunk.toString();
    });

    proc.on('close', (code) => {
        try {
            const lines = output.trim().split('\n');
            let success = false;
            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    if (json.type === 'password-set' && json.data === 'true') {
                        success = true;
                        break;
                    }
                } catch (e) {}
            }

            if (success) {
                appPasswordSet = true;
                checkAppPasswordSet();

                if (win && win.webContents) {
                    win.webContents.send('engine-reply', { type: 'password-set', data: 'true' });
                }

                if (passwordWindow && !passwordWindow.isDestroyed()) {
                    passwordWindow.webContents.send('password-success');
                    setTimeout(() => {
                        if (passwordWindow && !passwordWindow.isDestroyed()) {
                            passwordWindow.close();
                        }
                    }, 1500);
                }
            } else {
                if (passwordWindow && !passwordWindow.isDestroyed()) {
                    passwordWindow.webContents.send('password-error', { message: 'Failed to set password.' });
                }
            }
        } catch (err) {
            console.error('Error setting password:', err);
            if (passwordWindow && !passwordWindow.isDestroyed()) {
                passwordWindow.webContents.send('password-error', { message: 'Error setting password.' });
            }
        }
    });
});

ipcMain.on('password-set-submit', (event, data) => {
    const { password } = data;
    const enginePath = getEnginePath();
    const proc = spawn(enginePath, ['set-app-password', password]);

    let output = '';
    proc.stdout.on('data', (chunk) => {
        output += chunk.toString();
    });

    proc.on('close', (code) => {
        try {
            const lines = output.trim().split('\n');
            let success = false;
            for (const line of lines) {
                try {
                    const json = JSON.parse(line);
                    if (json.type === 'password-set' && json.data === 'true') {
                        success = true;
                        break;
                    }
                } catch (e) {}
            }

            if (success) {
                appPasswordSet = true;
                checkAppPasswordSet();

                if (win && win.webContents) {
                    win.webContents.send('engine-reply', { type: 'password-set', data: 'true' });
                }

                if (passwordSetWindow && !passwordSetWindow.isDestroyed()) {
                    passwordSetWindow.webContents.send('password-set-success');
                    setTimeout(() => {
                        if (passwordSetWindow && !passwordSetWindow.isDestroyed()) {
                            passwordSetWindow.close();
                        }
                    }, 1000);
                }
            } else {
                if (passwordSetWindow && !passwordSetWindow.isDestroyed()) {
                    passwordSetWindow.webContents.send('password-set-error', { message: 'Failed to set password.' });
                }
            }
        } catch (err) {
            console.error('Error setting password:', err);
            if (passwordSetWindow && !passwordSetWindow.isDestroyed()) {
                passwordSetWindow.webContents.send('password-set-error', { message: 'Error setting password.' });
            }
        }
    });
});

ipcMain.on('password-set-cancel', (event) => {
    if (passwordSetWindow && !passwordSetWindow.isDestroyed()) {
        passwordSetWindow.close();
    }
});

ipcMain.on('confirm-quit-direct', (event) => {
    if (passwordWindow && !passwordWindow.isDestroyed()) {
        passwordWindow.close();
    }
    isQuitting = true;
    app.quit();
});

// --- App Lifecycle ---

app.whenReady().then(() => {
    createTray();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
    }
});

app.on('before-quit', () => {
    isQuitting = true;
});
