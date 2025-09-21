// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App information
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Dialog methods
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

  // System methods
  requestElevation: () => ipcRenderer.invoke('request-elevation'),

  // Platform detection
  getPlatform: () => process.platform,
  getArch: () => process.arch,

  // Version info
  getVersion: () => process.versions,

  // Event listeners for main process communication
  onMainMessage: (callback) => {
    ipcRenderer.on('main-message', callback);
  },

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// Expose a limited API for the frontend to communicate with backend
contextBridge.exposeInMainWorld('backendAPI', {
  // License operations
  validateLicense: async (licenseData) => {
    try {
      const response = await fetch('http://localhost:3001/api/license/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(licenseData)
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  uploadLicense: async (licenseFile) => {
    try {
      const formData = new FormData();
      formData.append('license', licenseFile);
      
      const response = await fetch('http://localhost:3001/api/license/upload', {
        method: 'POST',
        body: formData
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  getLicenseStatus: async () => {
    try {
      const response = await fetch('http://localhost:3001/api/license/status');
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Drive operations
  getConnectedDrives: async () => {
    try {
      const response = await fetch('http://localhost:3001/api/drives');
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  refreshDrives: async () => {
    try {
      const response = await fetch('http://localhost:3001/api/drives/refresh', {
        method: 'POST'
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Erase operations
  startErase: async (eraseRequest) => {
    try {
      const response = await fetch('http://localhost:3001/api/erase/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eraseRequest)
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  getEraseStatus: async (jobId) => {
    try {
      const response = await fetch(`http://localhost:3001/api/erase/status/${jobId}`);
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  cancelErase: async (jobId) => {
    try {
      const response = await fetch(`http://localhost:3001/api/erase/cancel/${jobId}`, {
        method: 'POST'
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Audit operations
  getAuditLogs: async (filters) => {
    try {
      const queryParams = new URLSearchParams(filters || {});
      const response = await fetch(`http://localhost:3001/api/audit?${queryParams}`);
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  exportAuditLogs: async (format = 'json') => {
    try {
      const response = await fetch(`http://localhost:3001/api/audit/export?format=${format}`);
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // WebSocket connection for real-time updates
  createWebSocket: () => {
    return new WebSocket('ws://localhost:3001');
  }
});

// Security: Remove access to Node.js APIs
delete window.require;
delete window.exports;
delete window.module;

// Expose only safe process information
window.processInfo = {
  platform: process.platform,
  arch: process.arch,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
};

console.log('ShredSafe preload script loaded successfully');