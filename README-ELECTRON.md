# SecureWipe Electron Integration

This document provides instructions for building and running the SecureWipe application as an Electron desktop app with local backend integration.

## Overview

The SecureWipe Electron app provides:
- Native device detection using PowerShell (Windows) and system APIs
- UAC elevation for administrative operations
- Local backend server for secure eraser.exe execution
- WebSocket-based real-time progress updates
- Token validation and audit logging
- Cross-platform support (Windows, macOS, Linux)

## Project Structure

```
/
├── electron/
│   ├── main.js              # Electron main process
│   ├── preload.js           # Preload script for secure IPC
│   ├── backend/
│   │   └── server.js        # Local backend server
│   └── build.js             # Electron builder configuration
├── src/
│   ├── hooks/
│   │   └── useElectron.ts   # React hook for Electron API
│   └── components/          # Modified React components
├── resources/
│   └── eraser.exe          # Your secure eraser executable
└── logs/                   # Audit logs directory
```

## Prerequisites

1. **Node.js** (v16 or higher)
2. **PowerShell** (Windows) for device detection
3. **Your eraser.exe** executable in the `resources/` folder
4. **Code signing certificate** (optional, for production)

## Development Setup

1. **Install Dependencies**
   ```bash
   npm install
   # or
   bun install
   ```

2. **Add Your Eraser Executable**
   ```bash
   mkdir -p resources
   # Copy your eraser.exe to resources/eraser.exe
   ```

3. **Start Development Mode**
   ```bash
   # Terminal 1: Start the web development server
   npm run dev
   
   # Terminal 2: Start Electron in development mode
   npm run electron:dev
   ```

## Building for Production

1. **Build Web Assets**
   ```bash
   npm run build
   ```

2. **Build Electron App**
   ```bash
   npm run electron:build
   ```

3. **Available Build Targets**
   - Windows: NSIS installer, MSI, Portable EXE
   - macOS: DMG
   - Linux: AppImage, DEB

## Package.json Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "electron:dev": "cross-env NODE_ENV=development electron electron/main.js",
    "electron:build": "electron-builder",
    "electron:pack": "electron-builder --dir",
    "electron:dist": "npm run build && electron-builder"
  }
}
```

## Backend API Endpoints

The local backend server provides these endpoints:

### Device Detection
- `GET /api/drives` - List available storage devices
- `GET /api/health` - Server health check

### Token Management  
- `POST /api/validate-token` - Validate license token
- `GET /api/license` - Get license information

### Erasure Operations
- `POST /api/erase` - Start secure erasure process
- WebSocket connection for real-time progress updates

## Device Detection

### Windows (PowerShell)
```powershell
# Get disk information
Get-Disk | Select-Object Number, FriendlyName, Size, PartitionStyle, OperationalStatus

# Get volume information  
Get-Volume | Where-Object {$_.DriveLetter -ne $null} | Select-Object DriveLetter, FileSystemLabel, Size, FileSystem, DriveType
```

### Safety Checks
- System drives (C:) are marked as protected
- Device validation before erasure
- Serial number verification
- UAC elevation prompts

## Token System

### Mock Token Validation
For testing, tokens starting with `demo-` are considered valid:
- `demo-123` - Valid single-use token
- `demo-enterprise` - Valid enterprise token

### Production Integration
Replace the mock validation in `electron/backend/server.js` with calls to your license server:

```javascript
async function validateToken(token) {
  const response = await fetch('https://your-license-server.com/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  return response.json();
}
```

## UAC Elevation

The `sudo-prompt` package handles UAC elevation on Windows:

```javascript
const sudo = require('sudo-prompt');

const options = {
  name: 'SecureWipe Device Eraser',
  icns: false,
};

sudo.exec(command, options, (error, stdout, stderr) => {
  // Handle eraser.exe execution
});
```

## Code Signing

### Windows Code Signing
1. **Obtain a code signing certificate** from a trusted CA
2. **Set environment variables**:
   ```bash
   export CSC_LINK="path/to/certificate.p12"
   export CSC_KEY_PASSWORD="certificate_password"
   ```

3. **Build signed executable**:
   ```bash
   npm run electron:build
   ```

### macOS Code Signing
1. **Apple Developer Certificate** required
2. **Notarization** for distribution outside App Store
3. **Entitlements** for system access

## Testing

### Local Testing Script
```bash
#!/bin/bash
# test-demo.sh

echo "Testing SecureWipe Electron App..."

# 1. Test device detection
echo "1. Testing device detection..."
curl http://localhost:3001/api/drives

# 2. Test token validation  
echo "2. Testing token validation..."
curl -X POST http://localhost:3001/api/validate-token \
  -H "Content-Type: application/json" \
  -d '{"token":"demo-123"}'

# 3. Test mock erasure (replace with real device)
echo "3. Testing erasure process..."
curl -X POST http://localhost:3001/api/erase \
  -H "Content-Type: application/json" \
  -d '{"device":{"id":"test","name":"Test Device","driveLetter":"X"},"token":"demo-123"}'

echo "Testing completed!"
```

### Manual Testing Checklist
- [ ] App launches without errors
- [ ] Device detection works on target platform
- [ ] Token validation functions correctly
- [ ] UAC elevation prompts appear
- [ ] Progress updates stream correctly
- [ ] Audit logs are created
- [ ] Safety checks prevent system drive erasure

## Security Considerations

1. **Input Validation**: All device paths and tokens are validated
2. **System Protection**: C: drive and system partitions are protected
3. **Audit Logging**: All operations are logged with timestamps
4. **Secure IPC**: Context isolation and preload scripts
5. **Code Signing**: Binaries should be signed for production

## Troubleshooting

### Common Issues

1. **PowerShell Execution Policy**
   ```bash
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

2. **Node.js Native Modules**
   ```bash
   npm rebuild --runtime=electron --target=<electron-version>
   ```

3. **UAC Permission Denied**
   - Ensure eraser.exe has appropriate permissions
   - Check Windows Defender/antivirus exclusions

4. **WebSocket Connection Failed**
   - Verify backend server is running on port 3001
   - Check firewall settings

### Debug Mode
Set `NODE_ENV=development` to enable:
- Electron DevTools
- Verbose logging
- Mock device data on non-Windows platforms

## Production Deployment

1. **Build and sign the application**
2. **Test on clean Windows machines**
3. **Create installation packages** (NSIS/MSI)
4. **Distribute via secure channels**
5. **Provide enterprise deployment guides**

## Integration with Your Eraser.exe

Ensure your `eraser.exe` supports these command-line arguments:
```bash
eraser.exe /drive:<letter> /method:<method> /verify [/quiet]
```

Expected exit codes:
- `0` - Success
- `1` - General error  
- `2` - Permission denied
- `3` - Device not found

The Electron backend will capture stdout/stderr and stream progress to the UI via WebSockets.

For questions or issues, please refer to the main project documentation or create an issue in the repository.