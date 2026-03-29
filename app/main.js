const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let win;
let tray = null;
let isQuitting = false;
let currentProgress = 0;
let isOperationRunning = false;

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
    });

    win.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            win.hide();
            return false;
        }
    });

    win.on('minimize', (event) => {
        event.preventDefault();
        win.hide();
    });
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
            click: async () => {
                const result = await dialog.showMessageBox({
                    type: 'warning',
                    buttons: ['Yes', 'No'],
                    defaultId: 1,
                    title: 'Confirm Exit',
                    message: 'Are you sure you want to quit Time Machine?',
                    detail: 'Hourly backups will stop running if you quit the application.'
                });
                
                if (result.response === 0) {
                    isQuitting = true;
                    app.quit();
                }
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
    return path.join(__dirname, '..', 'engine', 'bin', 'Debug', 'net8.0', 'TimeMachineEngine.exe');
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
                    
                    // Update tray progress
                    if (json.type === 'progress') {
                        updateTrayProgress(parseInt(json.data), '');
                    } else if (json.type === 'status') {
                        updateTrayProgress(currentProgress, json.data);
                    } else if (json.type === 'complete') {
                        updateTrayProgress(100, 'Complete');
                    }
                } catch (e) {
                    // Ignore lines that aren't valid JSON
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
        // App stays running in tray
    }
});

app.on('before-quit', () => {
    isQuitting = true;
});
