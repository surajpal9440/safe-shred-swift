const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

/**
 * Android Device Wipe Service using ADB
 * Handles Android device detection and secure wipe via ADB commands
 */

class ADBWipeService {
  constructor() {
    this.adbPath = this.findADBPath();
    this.connectedDevices = new Map();
  }

  /**
   * Find ADB executable path
   */
  findADBPath() {
    const possiblePaths = [
      'adb', // If in PATH
      'C:\\Program Files (x86)\\Android\\android-sdk\\platform-tools\\adb.exe',
      'C:\\Android\\sdk\\platform-tools\\adb.exe',
      'C:\\Users\\%USERNAME%\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe',
      '/usr/local/bin/adb',
      '/usr/bin/adb',
      '/opt/android-sdk/platform-tools/adb'
    ];

    // Try to find working ADB
    for (const adbPath of possiblePaths) {
      try {
        const expandedPath = adbPath.replace('%USERNAME%', process.env.USERNAME || process.env.USER || '');
        return expandedPath;
      } catch (error) {
        continue;
      }
    }

    return 'adb'; // Default to PATH
  }

  /**
   * Check if ADB is available
   */
  async isADBAvailable() {
    return new Promise((resolve) => {
      exec(`"${this.adbPath}" version`, (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Get connected Android devices
   */
  async getConnectedDevices() {
    return new Promise((resolve, reject) => {
      exec(`"${this.adbPath}" devices -l`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`ADB error: ${error.message}`));
          return;
        }

        const devices = [];
        const lines = stdout.split('\n');
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line && !line.includes('List of devices')) {
            const parts = line.split(/\s+/);
            if (parts.length >= 2 && parts[1] === 'device') {
              const deviceId = parts[0];
              const model = this.extractModel(line);
              const product = this.extractProduct(line);
              
              devices.push({
                id: deviceId,
                model: model,
                product: product,
                status: 'device',
                type: 'android'
              });
            }
          }
        }

        resolve(devices);
      });
    });
  }

  /**
   * Extract model from device line
   */
  extractModel(line) {
    const modelMatch = line.match(/model:([^\s]+)/);
    return modelMatch ? modelMatch[1] : 'Unknown';
  }

  /**
   * Extract product from device line
   */
  extractProduct(line) {
    const productMatch = line.match(/product:([^\s]+)/);
    return productMatch ? productMatch[1] : 'Unknown';
  }

  /**
   * Get device info
   */
  async getDeviceInfo(deviceId) {
    const commands = [
      'ro.product.model',
      'ro.product.manufacturer',
      'ro.build.version.release',
      'ro.serialno'
    ];

    const info = { id: deviceId };

    for (const prop of commands) {
      try {
        const value = await this.executeADBCommand(deviceId, `shell getprop ${prop}`);
        const key = prop.split('.').pop();
        info[key] = value.trim();
      } catch (error) {
        console.warn(`Failed to get ${prop}:`, error.message);
      }
    }

    return info;
  }

  /**
   * Execute ADB command
   */
  async executeADBCommand(deviceId, command) {
    return new Promise((resolve, reject) => {
      const fullCommand = `"${this.adbPath}" -s ${deviceId} ${command}`;
      
      exec(fullCommand, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`ADB command failed: ${error.message}`));
          return;
        }
        
        if (stderr) {
          console.warn('ADB stderr:', stderr);
        }
        
        resolve(stdout);
      });
    });
  }

  /**
   * Check if device is rooted
   */
  async isDeviceRooted(deviceId) {
    try {
      await this.executeADBCommand(deviceId, 'shell su -c "echo rooted"');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Perform factory reset (requires unlocked bootloader or root)
   */
  async performFactoryReset(deviceId, options = {}) {
    const { force = false, wipeExternal = false } = options;
    
    try {
      // Check if device is in developer mode and USB debugging enabled
      const devOptions = await this.executeADBCommand(deviceId, 'shell settings get global development_settings_enabled');
      if (devOptions.trim() !== '1') {
        throw new Error('Developer options not enabled');
      }

      // Multiple wipe methods based on device capabilities
      const wipeMethods = [
        // Method 1: Factory reset via settings
        async () => {
          await this.executeADBCommand(deviceId, 'shell am broadcast -a android.intent.action.MASTER_CLEAR');
        },
        
        // Method 2: Wipe data partition (requires root)
        async () => {
          if (await this.isDeviceRooted(deviceId)) {
            await this.executeADBCommand(deviceId, 'shell su -c "recovery --wipe_data"');
          } else {
            throw new Error('Root required for data partition wipe');
          }
        },
        
        // Method 3: Secure erase via dd (requires root and busybox)
        async () => {
          if (await this.isDeviceRooted(deviceId)) {
            // Find data partition
            const partitions = await this.executeADBCommand(deviceId, 'shell su -c "cat /proc/mounts | grep /data"');
            const dataPartition = partitions.split(' ')[0];
            
            if (dataPartition) {
              // Secure overwrite with random data
              await this.executeADBCommand(deviceId, `shell su -c "dd if=/dev/urandom of=${dataPartition} bs=1M"`);
            }
          } else {
            throw new Error('Root required for secure erase');
          }
        }
      ];

      // Try methods in order
      let success = false;
      let lastError = null;

      for (const method of wipeMethods) {
        try {
          await method();
          success = true;
          break;
        } catch (error) {
          lastError = error;
          continue;
        }
      }

      if (!success) {
        throw lastError || new Error('All wipe methods failed');
      }

      // Optional: Wipe external storage
      if (wipeExternal) {
        try {
          await this.executeADBCommand(deviceId, 'shell rm -rf /sdcard/*');
          await this.executeADBCommand(deviceId, 'shell rm -rf /storage/emulated/0/*');
        } catch (error) {
          console.warn('Failed to wipe external storage:', error.message);
        }
      }

      return {
        success: true,
        method: 'factory_reset',
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`Android wipe failed: ${error.message}`);
    }
  }

  /**
   * Start ADB server
   */
  async startADBServer() {
    return new Promise((resolve, reject) => {
      exec(`"${this.adbPath}" start-server`, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to start ADB server: ${error.message}`));
          return;
        }
        resolve(true);
      });
    });
  }

  /**
   * Stop ADB server
   */
  async stopADBServer() {
    return new Promise((resolve) => {
      exec(`"${this.adbPath}" kill-server`, () => {
        resolve(true);
      });
    });
  }

  /**
   * Reboot device to recovery mode
   */
  async rebootToRecovery(deviceId) {
    try {
      await this.executeADBCommand(deviceId, 'reboot recovery');
      return true;
    } catch (error) {
      throw new Error(`Failed to reboot to recovery: ${error.message}`);
    }
  }

  /**
   * Get available wipe options for device
   */
  async getWipeOptions(deviceId) {
    const deviceInfo = await this.getDeviceInfo(deviceId);
    const isRooted = await this.isDeviceRooted(deviceId);
    
    const options = [
      {
        id: 'factory_reset',
        name: 'Factory Reset',
        description: 'Standard factory reset via Android settings',
        available: true,
        security: 'standard'
      }
    ];

    if (isRooted) {
      options.push({
        id: 'secure_wipe',
        name: 'Secure Wipe',
        description: 'Overwrite data partition with random data',
        available: true,
        security: 'high',
        requiresRoot: true
      });
    }

    return {
      device: deviceInfo,
      isRooted,
      options
    };
  }
}

/**
 * Initialize and export ADB service
 */
const adbService = new ADBWipeService();

module.exports = {
  ADBWipeService,
  adbService,
  
  // Convenience functions
  async detectAndroidDevices() {
    if (!(await adbService.isADBAvailable())) {
      throw new Error('ADB not available. Please install Android SDK Platform Tools.');
    }
    
    await adbService.startADBServer();
    return await adbService.getConnectedDevices();
  },
  
  async wipeAndroidDevice(deviceId, options = {}) {
    return await adbService.performFactoryReset(deviceId, options);
  },
  
  async getAndroidDeviceInfo(deviceId) {
    return await adbService.getDeviceInfo(deviceId);
  }
};