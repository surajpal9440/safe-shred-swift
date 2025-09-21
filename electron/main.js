// electron/main.js
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const isDev = process.env.NODE_ENV === 'development';

// Import backend server
const { startServer, stopServer } = require('../backend/server');

let mainWindow = null;
let serverInstance = null;

const createWindow = () => {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../build/icon.png'),
    show: false,
    title: 'ShredSafe - Secure Data Destruction'
  });

  // Load the frontend
  if (isDev) {
    mainWindow.loadURL('http://localhost:8080');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Focus on window (bring to front)
    if (isDev) {
      mainWindow.focus();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Security: Prevent new window creation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    return { action: 'deny' };
  });

  // Security: Prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // Allow localhost for development
    if (parsedUrl.origin !== 'http://localhost:8080' && parsedUrl.origin !== 'file://') {
      event.preventDefault();
    }
  });
};

// App event handlers
app.whenReady().then(async () => {
  // Start backend server
  try {
    serverInstance = await startServer();
    console.log('Backend server started successfully');
  } catch (error) {
    console.error('Failed to start backend server:', error);
    app.quit();
    return;
  }

  // Create main window
  createWindow();

  // Set up application menu
  const menu = require('./menu');
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));

  // Handle app activation (macOS)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Handle all windows closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app quit
app.on('before-quit', async () => {
  console.log('Shutting down backend server...');
  if (serverInstance) {
    await stopServer(serverInstance);
  }
});

// IPC Handlers for enhanced functionality
ipcMain.handle('show-message-box', async (event, options) => {
  const { response } = await dialog.showMessageBox(mainWindow, options);
  return response;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, options);
  return { canceled, filePaths };
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, options);
  return { canceled, filePath };
});

// Handle elevation request for Windows
ipcMain.handle('request-elevation', async (event) => {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      resolve({ success: false, error: 'Elevation only supported on Windows' });
      return;
    }

    // Check if already elevated
    const child = spawn('net', ['session'], { 
      shell: true,
      stdio: 'pipe'
    });

    child.on('exit', (code) => {
      if (code === 0) {
        // Already elevated
        resolve({ success: true, elevated: true });
      } else {
        // Need elevation - restart app with elevation
        const exe = process.execPath;
        const args = process.argv.slice(1);
        
        spawn('powershell', [
          '-Command',
          `Start-Process "${exe}" -ArgumentList "${args.join(' ')}" -Verb runAs`
        ], { 
          shell: true,
          detached: true,
          stdio: 'ignore'
        });
        
        // Close current instance
        setTimeout(() => {
          app.quit();
        }, 1000);
        
        resolve({ success: true, elevated: false, restarting: true });
      }
    });

    child.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });
  });
});

// Handle app info
ipcMain.handle('get-app-info', () => {
  return {
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isDev: isDev
  };
});

// Security: Disable node integration in renderer
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});

// Handle protocol for deep linking (future feature)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('shredsafe', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('shredsafe');
}

// Handle single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}