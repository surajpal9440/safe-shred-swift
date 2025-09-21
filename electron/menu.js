// electron/menu.js

const { app, shell } = require('electron');

const menuTemplate = [
  {
    label: 'File',
    submenu: [
      { role: 'quit', label: 'Exit ShredSafe' } // Close the app
    ]
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo', label: 'Undo' },
      { role: 'redo', label: 'Redo' },
      { type: 'separator' },
      { role: 'cut', label: 'Cut' },
      { role: 'copy', label: 'Copy' },
      { role: 'paste', label: 'Paste' },
      { role: 'selectAll', label: 'Select All' }
    ]
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload', label: 'Reload' },
      { role: 'forceReload', label: 'Force Reload' },
      { role: 'toggleDevTools', label: 'Toggle Developer Tools' },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Reset Zoom' },
      { role: 'zoomIn', label: 'Zoom In' },
      { role: 'zoomOut', label: 'Zoom Out' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Toggle Fullscreen' }
    ]
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'Learn More',
        click: async () => {
          await shell.openExternal('https://github.com/surajpal9440/safe-shred-swift');
        }
      }
    ]
  }
];

module.exports = menuTemplate;
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const isDev = require('electron-is-dev');
const { startServer, stopServer } = require('./server');            