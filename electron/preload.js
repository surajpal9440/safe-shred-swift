const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Device detection
  getDevices: () => fetch('http://localhost:3001/api/drives').then(res => res.json()),
  
  // Erasure operations
  startErasure: (device, token) => {
    return fetch('http://localhost:3001/api/erase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ device, token }),
    }).then(res => res.json());
  },
  
  // WebSocket for real-time progress
  connectWebSocket: (onMessage, onError, onClose) => {
    const ws = new WebSocket('ws://localhost:3001');
    ws.onmessage = onMessage;
    ws.onerror = onError;
    ws.onclose = onClose;
    return ws;
  },
  
  // Token validation
  validateToken: (token) => {
    return fetch('http://localhost:3001/api/validate-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    }).then(res => res.json());
  },
  
  // License server mock
  getLicenseInfo: () => fetch('http://localhost:3001/api/license').then(res => res.json()),
  
  // Platform detection
  platform: process.platform,
  isWindows: process.platform === 'win32',
  isMacOS: process.platform === 'darwin',
  isLinux: process.platform === 'linux',
});