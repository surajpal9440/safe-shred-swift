const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const sudo = require('sudo-prompt');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// Store active WebSocket connections
const clients = new Set();

// WebSocket connection handling
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Client connected to WebSocket');
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected from WebSocket');
  });
});

// Broadcast message to all connected clients
function broadcast(message) {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Device detection using PowerShell and WMI
async function detectDevices() {
  const devices = [];
  
  try {
    if (process.platform === 'win32') {
      // Get disk information using PowerShell
      const diskCommand = `Get-Disk | Select-Object Number, FriendlyName, Size, PartitionStyle, OperationalStatus | ConvertTo-Json`;
      const volumeCommand = `Get-Volume | Where-Object {$_.DriveLetter -ne $null} | Select-Object DriveLetter, FileSystemLabel, Size, FileSystem, DriveType | ConvertTo-Json`;
      
      const [diskResult, volumeResult] = await Promise.all([
        execPowerShell(diskCommand),
        execPowerShell(volumeCommand)
      ]);
      
      const disks = JSON.parse(diskResult || '[]');
      const volumes = JSON.parse(volumeResult || '[]');
      
      // Combine disk and volume information
      if (Array.isArray(volumes)) {
        volumes.forEach(volume => {
          const sizeGB = Math.round(volume.Size / (1024 * 1024 * 1024));
          const device = {
            id: `drive-${volume.DriveLetter}`,
            name: volume.FileSystemLabel || `Local Disk (${volume.DriveLetter}:)`,
            type: volume.DriveType === 'Removable' ? 'removable' : 'internal',
            size: `${sizeGB} GB`,
            status: volume.DriveLetter === 'C' ? 'system' : 'ready',
            serialNumber: `DRIVE-${volume.DriveLetter}-${Date.now()}`,
            fileSystem: volume.FileSystem,
            driveLetter: volume.DriveLetter,
            encryption: false // Would need additional WMI query for BitLocker status
          };
          devices.push(device);
        });
      }
    } else {
      // Mock devices for non-Windows platforms
      devices.push({
        id: 'mock-001',
        name: 'Mock USB Drive',
        type: 'removable',
        size: '32 GB',
        status: 'ready',
        serialNumber: 'MOCK-USB-001',
        fileSystem: 'FAT32',
        driveLetter: null,
        encryption: false
      });
    }
  } catch (error) {
    console.error('Error detecting devices:', error);
  }
  
  return devices;
}

// Execute PowerShell command
function execPowerShell(command) {
  return new Promise((resolve, reject) => {
    exec(`powershell -Command "${command}"`, (error, stdout, stderr) => {
      if (error) {
        console.error('PowerShell error:', error);
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

// Validate device is safe to erase (not system disk)
function validateDevice(device) {
  if (!device || !device.id) {
    return { valid: false, reason: 'Invalid device' };
  }
  
  if (device.status === 'system' || device.driveLetter === 'C') {
    return { valid: false, reason: 'Cannot erase system drive' };
  }
  
  if (device.type === 'internal' && process.platform === 'win32') {
    return { valid: false, reason: 'Internal drives require special handling' };
  }
  
  return { valid: true };
}

// Generate job ID and audit log
async function createAuditLog(jobId, device, status, details = {}) {
  const logEntry = {
    jobId,
    timestamp: new Date().toISOString(),
    device: {
      id: device.id,
      name: device.name,
      serialNumber: device.serialNumber,
      size: device.size
    },
    status,
    platform: process.platform,
    ...details
  };
  
  const logPath = path.join(__dirname, '../../logs');
  try {
    await fs.mkdir(logPath, { recursive: true });
    await fs.writeFile(
      path.join(logPath, `${jobId}.json`),
      JSON.stringify(logEntry, null, 2)
    );
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
  
  return logEntry;
}

// Mock token validation
async function validateToken(token) {
  // In production, this would call your license server
  if (!token || token.length < 8) {
    return { valid: false, reason: 'Invalid token format' };
  }
  
  // Mock validation - tokens starting with 'demo-' are valid
  if (token.startsWith('demo-')) {
    return {
      valid: true,
      tokenType: 'single-use',
      remainingUses: 1,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
  }
  
  return { valid: false, reason: 'Token not found or expired' };
}

// Execute eraser with UAC elevation
async function executeEraser(device, jobId) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      // Mock execution for non-Windows
      const operations = [
        'Requesting administrative privileges...',
        'Analyzing device structure...',
        'Beginning secure overwrite...',
        'Verifying erasure completion...',
        'Generating completion certificate...'
      ];
      
      let currentOp = 0;
      const interval = setInterval(() => {
        if (currentOp < operations.length) {
          broadcast({
            type: 'progress',
            jobId,
            operation: operations[currentOp],
            progress: ((currentOp + 1) / operations.length) * 100
          });
          currentOp++;
        } else {
          clearInterval(interval);
          resolve({ success: true, message: 'Mock erasure completed' });
        }
      }, 2000);
      return;
    }
    
    // Construct eraser command (assumes eraser.exe is in the resources folder)
    const eraserPath = path.join(__dirname, '../../resources/eraser.exe');
    const command = `"${eraserPath}" /drive:${device.driveLetter} /method:dod /verify`;
    
    const options = {
      name: 'SecureWipe Device Eraser',
      icns: false,
    };
    
    sudo.exec(command, options, (error, stdout, stderr) => {
      if (error) {
        broadcast({
          type: 'error',
          jobId,
          message: `Erasure failed: ${error.message}`
        });
        reject(error);
        return;
      }
      
      broadcast({
        type: 'complete',
        jobId,
        message: 'Device erasure completed successfully'
      });
      
      resolve({ success: true, stdout, stderr });
    });
  });
}

// API Routes
app.get('/api/drives', async (req, res) => {
  try {
    const devices = await detectDevices();
    res.json({ success: true, devices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/validate-token', async (req, res) => {
  try {
    const { token } = req.body;
    const validation = await validateToken(token);
    res.json(validation);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/erase', async (req, res) => {
  try {
    const { device, token } = req.body;
    const jobId = `SE-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    
    // Validate token
    const tokenValidation = await validateToken(token);
    if (!tokenValidation.valid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        reason: tokenValidation.reason
      });
    }
    
    // Validate device
    const deviceValidation = validateDevice(device);
    if (!deviceValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid device',
        reason: deviceValidation.reason
      });
    }
    
    // Create initial audit log
    await createAuditLog(jobId, device, 'started');
    
    // Start erasure process
    broadcast({
      type: 'started',
      jobId,
      device: device.name,
      message: 'Erasure process initiated'
    });
    
    res.json({
      success: true,
      jobId,
      message: 'Erasure started',
      estimatedTime: device.encryption ? '< 1 minute' : '15-45 minutes'
    });
    
    // Execute erasure asynchronously
    executeEraser(device, jobId)
      .then(async (result) => {
        await createAuditLog(jobId, device, 'completed', { result });
      })
      .catch(async (error) => {
        await createAuditLog(jobId, device, 'failed', { error: error.message });
      });
      
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/license', (req, res) => {
  res.json({
    type: 'demo',
    remainingTokens: 5,
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    features: ['device-erasure', 'audit-logs', 'certificates']
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    platform: process.platform,
    timestamp: new Date().toISOString()
  });
});

function startServer(port = 3001) {
  return new Promise((resolve, reject) => {
    server.listen(port, (err) => {
      if (err) {
        reject(err);
      } else {
        console.log(`SecureWipe backend server running on port ${port}`);
        resolve(server);
      }
    });
  });
}

module.exports = { startServer };