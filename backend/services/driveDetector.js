// backend/services/driveDetector.js
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class DriveDetector {
  constructor() {
    this.platform = os.platform();
    this.systemDrives = ['C:', 'D:']; // Common system drives to protect
    this.lastScan = null;
    this.cachedDrives = [];
  }

  async getConnectedDrives(forceRefresh = false) {
    try {
      // Use cache if recent scan and not forced refresh
      if (!forceRefresh && this.lastScan && (Date.now() - this.lastScan < 5000)) {
        return this.cachedDrives;
      }

      let drives = [];

      // Try different detection methods based on platform
      if (this.platform === 'win32') {
        drives = await this.getWindowsDrives();
      } else if (this.platform === 'darwin') {
        drives = await this.getMacDrives();
      } else {
        drives = await this.getLinuxDrives();
      }

      // Filter and enhance drive information
      drives = drives.filter(drive => this.isValidDrive(drive));
      drives = await this.enhanceDriveInfo(drives);

      // Cache results
      this.cachedDrives = drives;
      this.lastScan = Date.now();

      console.log(`Found ${drives.length} valid drives`);
      return drives;
    } catch (error) {
      console.error('Drive detection error:', error);
      return [];
    }
  }

  async getWindowsDrives() {
    try {
      // Method 1: Use PowerShell to get detailed drive info
      const psScript = `
        Get-WmiObject -Class Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 -or $_.DriveType -eq 3 } | ForEach-Object {
          $disk = Get-WmiObject -Class Win32_DiskDrive | Where-Object { $_.Index -eq ($_.DeviceID -replace '\\\\\\\\\.\\\\', '' -replace ':', '') }
          [PSCustomObject]@{
            DriveLetter = $_.DeviceID
            Label = $_.VolumeName
            Size = $_.Size
            FreeSpace = $_.FreeSpace
            DriveType = $_.DriveType
            FileSystem = $_.FileSystem
            Model = if ($disk) { $disk.Model } else { "Unknown" }
            SerialNumber = if ($disk) { $disk.SerialNumber } else { "Unknown" }
            MediaType = if ($disk) { $disk.MediaType } else { "Unknown" }
          }
        } | ConvertTo-Json
      `;

      const psResult = await this.executePowerShell(psScript);
      
      if (psResult) {
        const driveData = JSON.parse(psResult);
        const drives = Array.isArray(driveData) ? driveData : [driveData];
        
        return drives.map(drive => ({
          driveLetter: drive.DriveLetter,
          label: drive.Label || 'Unlabeled',
          size: parseInt(drive.Size) || 0,
          freeSpace: parseInt(drive.FreeSpace) || 0,
          driveType: this.getDriveTypeDescription(drive.DriveType),
          fileSystem: drive.FileSystem,
          model: drive.Model || 'Unknown',
          serialNumber: drive.SerialNumber || 'Unknown',
          mediaType: drive.MediaType || 'Unknown',
          isRemovable: drive.DriveType === 2,
          platform: 'windows'
        }));
      }

      // Fallback: Use WMIC if PowerShell fails
      return await this.getWindowsDrivesWMIC();
    } catch (error) {
      console.error('Windows drive detection error:', error);
      return [];
    }
  }

  async getWindowsDrivesWMIC() {
    return new Promise((resolve) => {
      exec('wmic logicaldisk get size,freespace,caption,label,drivetype /format:csv', (error, stdout) => {
        if (error) {
          console.error('WMIC error:', error);
          resolve([]);
          return;
        }

        try {
          const lines = stdout.split('\n').filter(line => line.trim() && !line.startsWith('Node'));
          const drives = [];

          for (const line of lines) {
            const parts = line.split(',').map(part => part.trim());
            if (parts.length >= 6) {
              const driveLetter = parts[1];
              const driveType = parseInt(parts[2]);
              
              if (driveLetter && (driveType === 2 || driveType === 3)) {
                drives.push({
                  driveLetter: driveLetter,
                  label: parts[4] || 'Unlabeled',
                  size: parseInt(parts[5]) || 0,
                  freeSpace: parseInt(parts[3]) || 0,
                  driveType: this.getDriveTypeDescription(driveType),
                  isRemovable: driveType === 2,
                  platform: 'windows'
                });
              }
            }
          }

          resolve(drives);
        } catch (parseError) {
          console.error('WMIC parse error:', parseError);
          resolve([]);
        }
      });
    });
  }

  async getMacDrives() {
    return new Promise((resolve) => {
      exec('diskutil list -plist external', (error, stdout) => {
        if (error) {
          console.error('macOS diskutil error:', error);
          resolve([]);
          return;
        }

        try {
          // Parse plist output (simplified)
          const drives = [];
          // macOS implementation would parse the plist format
          // For now, return empty array - full implementation would be more complex
          resolve(drives);
        } catch (error) {
          console.error('macOS drive parse error:', error);
          resolve([]);
        }
      });
    });
  }

  async getLinuxDrives() {
    return new Promise((resolve) => {
      exec('lsblk -J -o NAME,SIZE,LABEL,MOUNTPOINT,TYPE,HOTPLUG', (error, stdout) => {
        if (error) {
          console.error('Linux lsblk error:', error);
          resolve([]);
          return;
        }

        try {
          const data = JSON.parse(stdout);
          const drives = [];

          // Parse lsblk output for removable drives
          if (data.blockdevices) {
            for (const device of data.blockdevices) {
              if (device.hotplug === true && device.mountpoint) {
                drives.push({
                  driveLetter: device.mountpoint,
                  label: device.label || 'Unlabeled',
                  size: this.parseSize(device.size),
                  name: device.name,
                  isRemovable: true,
                  platform: 'linux'
                });
              }
            }
          }

          resolve(drives);
        } catch (error) {
          console.error('Linux drive parse error:', error);
          resolve([]);
        }
      });
    });
  }

  async executePowerShell(script) {
    return new Promise((resolve, reject) => {
      const ps = spawn('powershell', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command', script
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let error = '';

      ps.stdout.on('data', (data) => {
        output += data.toString();
      });

      ps.stderr.on('data', (data) => {
        error += data.toString();
      });

      ps.on('close', (code) => {
        if (code === 0 && output.trim()) {
          resolve(output.trim());
        } else {
          console.error('PowerShell error:', error);
          reject(new Error(error || 'PowerShell command failed'));
        }
      });

      ps.on('error', (err) => {
        reject(err);
      });
    });
  }

  getDriveTypeDescription(driveType) {
    const types = {
      1: 'No Root Directory',
      2: 'Removable Disk',
      3: 'Local Disk',
      4: 'Network Drive',
      5: 'Compact Disc',
      6: 'RAM Disk'
    };
    return types[driveType] || 'Unknown';
  }

  isValidDrive(drive) {
    // Filter out system drives and invalid drives
    if (!drive.driveLetter) return false;
    
    // Don't show system drives for safety
    if (this.systemDrives.includes(drive.driveLetter.toUpperCase())) {
      return false;
    }

    // Must have reasonable size (at least 1MB)
    if (drive.size < 1024 * 1024) {
      return false;
    }

    return true;
  }

  async enhanceDriveInfo(drives) {
    const enhanced = [];

    for (const drive of drives) {
      try {
        // Add safety classification
        drive.safetyLevel = this.classifySafetyLevel(drive);
        
        // Add usage percentage
        if (drive.size && drive.freeSpace) {
          drive.usedSpace = drive.size - drive.freeSpace;
          drive.usagePercent = Math.round((drive.usedSpace / drive.size) * 100);
        }

        // Add human-readable sizes
        drive.sizeFormatted = this.formatBytes(drive.size);
        drive.freeSpaceFormatted = this.formatBytes(drive.freeSpace);
        drive.usedSpaceFormatted = this.formatBytes(drive.usedSpace || 0);

        // Add detection timestamp
        drive.detectedAt = new Date().toISOString();
        
        // Generate unique identifier
        drive.id = this.generateDriveId(drive);

        enhanced.push(drive);
      } catch (error) {
        console.error('Error enhancing drive info:', error);
        enhanced.push(drive); // Add without enhancements
      }
    }

    return enhanced;
  }

  classifySafetyLevel(drive) {
    // Classify drives by safety level for user guidance
    if (this.systemDrives.includes(drive.driveLetter?.toUpperCase())) {
      return 'SYSTEM'; // Should never reach here due to filtering
    }

    if (drive.isRemovable) {
      return 'SAFE'; // USB drives, external drives
    }

    if (drive.driveType === 'Local Disk') {
      return 'CAUTION'; // Internal drives
    }

    return 'UNKNOWN';
  }

  generateDriveId(drive) {
    // Create unique ID for drive tracking
    const identifier = `${drive.driveLetter}_${drive.serialNumber}_${drive.model}`;
    const hash = require('crypto').createHash('md5').update(identifier).digest('hex');
    return hash.substring(0, 12);
  }

  formatBytes(bytes, decimals = 2) {
    if (bytes === 0 || !bytes) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  parseSize(sizeString) {
    // Parse size strings like "32G", "512M", etc.
    if (!sizeString) return 0;
    
    const match = sizeString.match(/^(\d+(?:\.\d+)?)\s*([KMGT])?/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = (match[2] || '').toUpperCase();

    const multipliers = {
      '': 1,
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024,
      'T': 1024 * 1024 * 1024 * 1024
    };

    return Math.round(value * (multipliers[unit] || 1));
  }

  async getDriveHealth(driveLetter) {
    // Get SMART data or basic health info for drive
    try {
      if (this.platform === 'win32') {
        const psScript = `
          Get-WmiObject -Class Win32_DiskDrive | Where-Object { 
            $_.DeviceID -like "*${driveLetter.replace(':', '')}*" 
          } | Select-Object Status, Size, InterfaceType
        `;
        
        const result = await this.executePowerShell(psScript);
        return JSON.parse(result);
      }
    } catch (error) {
      console.error('Drive health check error:', error);
    }
    
    return null;
  }

  // Android device detection via ADB
  async getAndroidDevices() {
    return new Promise((resolve) => {
      exec('adb devices -l', (error, stdout) => {
        if (error) {
          console.log('ADB not available or no devices connected');
          resolve([]);
          return;
        }

        try {
          const lines = stdout.split('\n').filter(line => 
            line.trim() && !line.includes('List of devices') && line.includes('\t')
          );

          const devices = lines.map(line => {
            const parts = line.split('\t');
            const deviceId = parts[0];
            const status = parts[1];
            
            return {
              id: deviceId,
              type: 'android',
              status: status,
              platform: 'android',
              safetyLevel: 'SAFE',
              label: `Android Device (${deviceId.substring(0, 8)}...)`,
              detectedAt: new Date().toISOString()
            };
          });

          resolve(devices.filter(device => device.status === 'device'));
        } catch (error) {
          console.error('ADB parse error:', error);
          resolve([]);
        }
      });
    });
  }

  async getAllDevices() {
    try {
      const [drives, androidDevices] = await Promise.all([
        this.getConnectedDrives(),
        this.getAndroidDevices()
      ]);

      return {
        drives: drives,
        android: androidDevices,
        total: drives.length + androidDevices.length,
        scanTime: new Date().toISOString()
      };
    } catch (error) {
      console.error('Get all devices error:', error);
      return {
        drives: [],
        android: [],
        total: 0,
        error: error.message
      };
    }
  }
}

// Create singleton instance
const driveDetector = new DriveDetector();

module.exports = {
  driveDetector,
  getConnectedDrives: (refresh) => driveDetector.getConnectedDrives(refresh),
  getAllDevices: () => driveDetector.getAllDevices(),
  getDriveHealth: (drive) => driveDetector.getDriveHealth(drive)
};