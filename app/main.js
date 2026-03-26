const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let win;
let tray = null;
let isQuitting = false;

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

    // Send auto-detected user folder path to renderer
    win.webContents.on('did-finish-load', () => {
        const userFolder = autoDetectUserFolder();
        if (userFolder) {
            win.webContents.send('auto-user-folder', userFolder);
        }
    });

    // Minimize to tray when closing (instead of quitting)
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
    // Try to find the user folder on C: drive
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

    // Fallback: scan C:\Users for user folders
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

function createTray() {
    // Create a simple icon for the tray (a small colored square)
    const icon = nativeImage.createEmpty();
    const size = 16;
    const canvas = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${size}" height="${size}" fill="#3b82f6" rx="2"/>
        </svg>
    `;
    const trayIcon = nativeImage.createFromBuffer(Buffer.from(canvas));
    
    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Show Time Machine', 
            click: () => {
                win.show();
                win.focus();
            }
        },
        { type: 'separator' },
        { 
            label: 'Quit', 
            click: async () => {
                const result = await dialog.showMessageBox(win, {
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

    tray.setToolTip('Time Machine - Hourly backups running in background');
    tray.setContextMenu(contextMenu);

    // Show window when clicking tray icon
    tray.on('click', () => {
        win.show();
        win.focus();
    });
}

// Resolve path to C# Engine
function getEnginePath() {
    if (app.isPackaged) {
        // In production: looks inside resources/engine/
        return path.join(process.resourcesPath, 'engine', 'TimeMachineEngine.exe');
    }
    // In development: looks inside engine/bin/Debug/net8.0/
    // Make sure you have run 'dotnet build' in the engine folder
    return path.join(__dirname, '..', 'engine', 'bin', 'Debug', 'net8.0', 'TimeMachineEngine.exe');
}

// Helper to parse JSON lines from C# stdout
function parseEngineOutput(data) {
    try {
        // C# outputs lines of JSON. Split by newline to be safe.
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                try {
                    const json = JSON.parse(line);
                    if (win && win.webContents) {
                        win.webContents.send('engine-reply', json);
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

// 1. Open Folder Dialog
ipcMain.on('select-folder', async (event) => {
    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
        win.webContents.send('folder-selected', result.filePaths[0]);
    }
});

// 2. Run Backup
ipcMain.on('run-backup', (event, data) => {
    const enginePath = getEnginePath();
    // Args: backup [source] [dest]
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

// 3. Run Restore
ipcMain.on('run-restore', (event, data) => {
    const enginePath = getEnginePath();
    
    // Handle the "Original Location" logic
    // If the frontend sends "ORIGINAL_LOCATION_FLAG", we might need specific C# logic
    // For now, we pass the arguments directly.
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

// 4. Run Hourly Backup
ipcMain.on('run-hourly-backup', (event, data) => {
    const enginePath = getEnginePath();
    // Args: hourly [source] [dest]
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

// 4. Create Rescue USB
ipcMain.on('run-rescue', (event, data) => {
    const enginePath = getEnginePath();
    // Args: rescue [drive] [userProfile]
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

// 5. Create Rescue USB with Hourly Backup
ipcMain.on('run-rescue-hourly', (event, data) => {
    const enginePath = getEnginePath();
    // Args: rescue-hourly [drive] [userProfile]
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

// --- App Lifecycle ---

app.whenReady().then(() => {
    createTray();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    // Don't quit on window close - minimize to tray instead
    // On macOS, keep the app running
    if (process.platform !== 'darwin') {
        // App stays running in tray
    }
});

app.on('before-quit', () => {
    isQuitting = true;
});
