// backend/routes/drives.js
const express = require('express');
const { 
  getConnectedDrives, 
  getAllDevices, 
  getDriveHealth 
} = require('../services/driveDetector');
const auditLogger = require('../services/auditLogger');

const router = express.Router();

// Get all connected drives and devices
router.get('/', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const devices = await getAllDevices();
    
    // Log drive detection
    if (req.licenseInfo) {
      await auditLogger.logDriveDetection(devices.drives, req.licenseInfo.customer);
    }

    res.json({
      success: true,
      ...devices,
      refreshed: forceRefresh
    });

  } catch (error) {
    console.error('Drive detection error:', error);
    await auditLogger.logError(error, 'drive_detection', req.licenseInfo?.customer);
    
    res.status(500).json({
      success: false,
      error: 'Failed to detect drives',
      drives: [],
      android: [],
      total: 0
    });
  }
});

// Force refresh drive detection
router.post('/refresh', async (req, res) => {
  try {
    const devices = await getAllDevices();
    
    // Log refresh action
    if (req.licenseInfo) {
      await auditLogger.logDriveDetection(devices.drives, req.licenseInfo.customer);
    }

    res.json({
      success: true,
      message: 'Drive detection refreshed',
      ...devices,
      refreshed: true
    });

  } catch (error) {
    console.error('Drive refresh error:', error);
    await auditLogger.logError(error, 'drive_refresh', req.licenseInfo?.customer);
    
    res.status(500).json({
      success: false,
      error: 'Failed to refresh drives'
    });
  }
});

// Get USB drives only
router.get('/usb', async (req, res) => {
  try {
    const drives = await getConnectedDrives(req.query.refresh === 'true');
    const usbDrives = drives.filter(drive => drive.isRemovable);

    res.json({
      success: true,
      drives: usbDrives,
      count: usbDrives.length,
      scanTime: new Date().toISOString()
    });

  } catch (error) {
    console.error('USB drive detection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect USB drives',
      drives: []
    });
  }
});

// Get specific drive information
router.get('/drive/:driveLetter', async (req, res) => {
  try {
    const { driveLetter } = req.params;
    
    // Validate drive letter format
    if (!/^[A-Z]:?$/i.test(driveLetter)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid drive letter format'
      });
    }

    const formattedDriveLetter = driveLetter.toUpperCase().replace(':', '') + ':';
    const drives = await getConnectedDrives();
    const drive = drives.find(d => d.driveLetter === formattedDriveLetter);

    if (!drive) {
      return res.status(404).json({
        success: false,
        error: 'Drive not found or not accessible'
      });
    }

    // Get additional drive health information
    let healthInfo = null;
    try {
      healthInfo = await getDriveHealth(formattedDriveLetter);
    } catch (healthError) {
      console.warn('Could not get drive health info:', healthError);
    }

    res.json({
      success: true,
      drive: {
        ...drive,
        health: healthInfo
      }
    });

  } catch (error) {
    console.error('Drive info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get drive information'
    });
  }
});

// Check if drive is safe to erase (safety validation)
router.post('/validate', async (req, res) => {
  try {
    const { driveLetter, deviceId } = req.body;
    
    if (!driveLetter) {
      return res.status(400).json({
        success: false,
        error: 'Drive letter is required'
      });
    }

    const formattedDriveLetter = driveLetter.toUpperCase().endsWith(':') 
      ? driveLetter.toUpperCase() 
      : driveLetter.toUpperCase() + ':';

    const drives = await getConnectedDrives();
    const drive = drives.find(d => d.driveLetter === formattedDriveLetter);

    const validationResult = {
      isValid: false,
      warnings: [],
      errors: [],
      safetyLevel: 'UNKNOWN'
    };

    // Check if drive exists
    if (!drive) {
      validationResult.errors.push('Drive not found or not accessible');
      return res.json({
        success: true,
        validation: validationResult
      });
    }

    // Safety checks
    const systemDrives = ['C:', 'D:'];
    if (systemDrives.includes(formattedDriveLetter)) {
      validationResult.errors.push('System drives cannot be erased for safety reasons');
      validationResult.safetyLevel = 'SYSTEM';
    } else {
      validationResult.safetyLevel = drive.safetyLevel;
    }

    // Check if drive is removable (safer to erase)
    if (!drive.isRemovable && !systemDrives.includes(formattedDriveLetter)) {
      validationResult.warnings.push('This is an internal drive. Please ensure you want to erase it.');
    }

    // Check drive size (warn for very large drives)
    if (drive.size > 1024 * 1024 * 1024 * 1024) { // > 1TB
      validationResult.warnings.push('This is a large drive. Erasure may take several hours.');
    }

    // Check if drive has data
    if (drive.usagePercent > 10) {
      validationResult.warnings.push(`Drive contains data (${drive.usagePercent}% full). All data will be permanently lost.`);
    }

    // Device ID validation if provided
    if (deviceId && drive.id !== deviceId) {
      validationResult.errors.push('Device ID mismatch. Drive may have changed since detection.');
    }

    // Set validity based on errors
    validationResult.isValid = validationResult.errors.length === 0;

    res.json({
      success: true,
      validation: validationResult,
      drive: {
        driveLetter: drive.driveLetter,
        label: drive.label,
        size: drive.sizeFormatted,
        type: drive.driveType,
        isRemovable: drive.isRemovable,
        usagePercent: drive.usagePercent
      }
    });

  } catch (error) {
    console.error('Drive validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate drive'
    });
  }
});

// Get Android devices via ADB
router.get('/android', async (req, res) => {
  try {
    const devices = await getAllDevices();
    
    res.json({
      success: true,
      devices: devices.android,
      count: devices.android.length,
      scanTime: devices.scanTime
    });

  } catch (error) {
    console.error('Android device detection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to detect Android devices',
      devices: []
    });
  }
});

// Get drive statistics
router.get('/stats', async (req, res) => {
  try {
    const devices = await getAllDevices();
    
    const stats = {
      total: devices.total,
      byType: {
        usb: devices.drives.filter(d => d.isRemovable).length,
        internal: devices.drives.filter(d => !d.isRemovable).length,
        android: devices.android.length
      },
      bySize: devices.drives.reduce((acc, drive) => {
        if (drive.size < 1024 * 1024 * 1024) {
          acc.small++; // < 1GB
        } else if (drive.size < 32 * 1024 * 1024 * 1024) {
          acc.medium++; // 1GB - 32GB
        } else {
          acc.large++; // > 32GB
        }
        return acc;
      }, { small: 0, medium: 0, large: 0 }),
      totalStorage: devices.drives.reduce((total, drive) => total + (drive.size || 0), 0),
      lastScan: devices.scanTime
    };

    res.json({
      success: true,
      statistics: stats
    });

  } catch (error) {
    console.error('Drive statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get drive statistics'
    });
  }
});

// Get iOS instructions
router.get('/ios-instructions', async (req, res) => {
  try {
    // Return manual iOS wipe instructions
    const instructions = {
      title: 'iOS Device Manual Wipe Instructions',
      steps: [
        {
          step: 1,
          title: 'Backup Important Data',
          description: 'Ensure all important data is backed up before proceeding.',
          warning: 'This process will permanently delete all data on the device.'
        },
        {
          step: 2,
          title: 'Sign Out of Apple ID',
          description: 'Go to Settings > [Your Name] > Sign Out. Enter your Apple ID password when prompted.'
        },
        {
          step: 3,
          title: 'Erase All Content and Settings',
          description: 'Go to Settings > General > Transfer or Reset iPhone > Erase All Content and Settings.'
        },
        {
          step: 4,
          title: 'Confirm Erasure',
          description: 'Enter your device passcode and Apple ID password when prompted. Confirm the erasure.'
        },
        {
          step: 5,
          title: 'Wait for Completion',
          description: 'The device will restart and begin the erasure process. This may take several minutes.'
        },
        {
          step: 6,
          title: 'Verify Erasure',
          description: 'After completion, the device should show the initial setup screen, indicating successful erasure.'
        }
      ],
      notes: [
        'This process uses Apple\'s secure erasure system which meets most security standards.',
        'For classified or highly sensitive data, physical destruction may be required.',
        'The process cannot be undone once started.',
        'Ensure the device has sufficient battery or is connected to power.'
      ]
    };

    res.json({
      success: true,
      instructions: instructions
    });

  } catch (error) {
    console.error('iOS instructions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get iOS instructions'
    });
  }
});

module.exports = router;