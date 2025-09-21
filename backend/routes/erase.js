// backend/routes/erase.js
const express = require('express');
const { 
  startEraseJob, 
  getJobStatus, 
  cancelEraseJob, 
  getActiveJobs, 
  getJobHistory, 
  performSafetyCheck, 
  getStatistics 
} = require('../services/eraseService');
const auditLogger = require('../services/auditLogger');

const router = express.Router();

// Start erase operation
router.post('/start', async (req, res) => {
  try {
    const { deviceId, driveLetter, confirmation, deviceType } = req.body;
    
    // Validate required fields
    if (!deviceId || !driveLetter || !confirmation) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: deviceId, driveLetter, confirmation'
      });
    }

    // Add customer info from license
    const eraseRequest = {
      deviceId,
      driveLetter: driveLetter.toUpperCase(),
      confirmation,
      deviceType: deviceType || 'usb',
      customer: req.licenseInfo?.customer || 'Unknown',
      requestTime: new Date().toISOString()
    };

    // Perform safety check before starting
    const safetyCheck = await performSafetyCheck(eraseRequest);
    
    if (!safetyCheck.allPassed) {
      return res.json({
        success: false,
        error: 'Safety check failed',
        safetyCheck: safetyCheck
      });
    }

    // Start the erase job
    const result = await startEraseJob(eraseRequest);
    
    res.json(result);

  } catch (error) {
    console.error('Erase start error:', error);
    await auditLogger.logError(error, 'erase_start', req.licenseInfo?.customer);
    
    res.status(500).json({
      success: false,
      error: 'Failed to start erase operation'
    });
  }
});

// Get job status
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = getJobStatus(jobId);
    
    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      job: result.job,
      inHistory: result.inHistory || false
    });

  } catch (error) {
    console.error('Job status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status'
    });
  }
});

// Cancel erase operation
router.post('/cancel/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = cancelEraseJob(jobId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log cancellation
    await auditLogger.logEraseComplete(
      jobId, 
      'cancelled', 
      'Job cancelled by user request',
      req.licenseInfo?.customer
    );

    res.json(result);

  } catch (error) {
    console.error('Job cancellation error:', error);
    await auditLogger.logError(error, 'erase_cancel', req.licenseInfo?.customer);
    
    res.status(500).json({
      success: false,
      error: 'Failed to cancel job'
    });
  }
});

// Get all active jobs
router.get('/active', async (req, res) => {
  try {
    const activeJobs = getActiveJobs();
    
    res.json({
      success: true,
      jobs: activeJobs,
      count: activeJobs.length
    });

  } catch (error) {
    console.error('Active jobs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active jobs',
      jobs: []
    });
  }
});

// Get job history
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const history = getJobHistory(limit);
    
    res.json({
      success: true,
      jobs: history,
      count: history.length,
      limit: limit
    });

  } catch (error) {
    console.error('Job history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job history',
      jobs: []
    });
  }
});

// Perform safety check (dry run)
router.post('/safety-check', async (req, res) => {
  try {
    const { deviceId, driveLetter, confirmation, deviceType } = req.body;
    
    if (!deviceId || !driveLetter || !confirmation) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields for safety check'
      });
    }

    const checkRequest = {
      deviceId,
      driveLetter: driveLetter.toUpperCase(),
      confirmation,
      deviceType: deviceType || 'usb'
    };

    const safetyCheck = await performSafetyCheck(checkRequest);
    
    res.json({
      success: true,
      safetyCheck: safetyCheck
    });

  } catch (error) {
    console.error('Safety check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform safety check'
    });
  }
});

// Get erase statistics
router.get('/statistics', async (req, res) => {
  try {
    const stats = getStatistics();
    
    res.json({
      success: true,
      statistics: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics'
    });
  }
});

// Get job logs
router.get('/logs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    
    const result = getJobStatus(jobId);
    
    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    const logs = result.job.logs || [];
    const limitedLogs = logs.slice(-limit);
    
    res.json({
      success: true,
      jobId: jobId,
      logs: limitedLogs,
      totalLogs: logs.length,
      showing: limitedLogs.length
    });

  } catch (error) {
    console.error('Job logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job logs'
    });
  }
});

// Validate erase confirmation
router.post('/validate-confirmation', async (req, res) => {
  try {
    const { driveLetter, confirmation } = req.body;
    
    if (!driveLetter || !confirmation) {
      return res.status(400).json({
        success: false,
        error: 'Drive letter and confirmation are required'
      });
    }

    const formattedDrive = driveLetter.toUpperCase().replace(':', '');
    const expectedConfirmation = `${formattedDrive}: YES`;
    const isValid = confirmation === expectedConfirmation;
    
    res.json({
      success: true,
      isValid: isValid,
      expected: expectedConfirmation,
      received: confirmation,
      message: isValid 
        ? 'Confirmation is correct' 
        : `Expected: "${expectedConfirmation}"`
    });

  } catch (error) {
    console.error('Confirmation validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate confirmation'
    });
  }
});

// Get supported erase methods
router.get('/methods', async (req, res) => {
  try {
    const methods = [
      {
        id: 'usb_script',
        name: 'USB Batch Script',
        description: 'Uses custom PowerShell script with cipher.exe for secure erasure',
        supportedDevices: ['usb', 'removable'],
        securityLevel: 'standard',
        estimatedTime: '5-30 minutes',
        available: true
      },
      {
        id: 'android_adb',
        name: 'Android ADB Wipe',
        description: 'Uses ADB commands to wipe Android device storage',
        supportedDevices: ['android'],
        securityLevel: 'basic',
        estimatedTime: '2-10 minutes',
        available: true,
        requirements: ['USB debugging enabled', 'Root access preferred']
      },
      {
        id: 'ios_manual',
        name: 'iOS Manual Wipe',
        description: 'Manual instructions for secure iOS device erasure',
        supportedDevices: ['ios'],
        securityLevel: 'high',
        estimatedTime: '5-15 minutes',
        available: true,
        note: 'Manual process - user must follow instructions'
      }
    ];

    res.json({
      success: true,
      methods: methods,
      defaultMethod: 'usb_script'
    });

  } catch (error) {
    console.error('Methods error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get erase methods'
    });
  }
});

// Estimate erase time
router.post('/estimate-time', async (req, res) => {
  try {
    const { deviceType, driveSize, eraseMethod } = req.body;
    
    let estimatedMinutes = 5; // Default minimum
    
    // Estimate based on device type and size
    if (deviceType === 'usb' && driveSize) {
      const sizeGB = driveSize / (1024 * 1024 * 1024);
      // Rough estimate: 1GB per minute for USB 2.0, faster for USB 3.0
      estimatedMinutes = Math.max(5, Math.ceil(sizeGB * 0.8));
    } else if (deviceType === 'android') {
      estimatedMinutes = 5; // ADB commands are relatively fast
    }
    
    // Add buffer for safety
    const maxEstimate = Math.ceil(estimatedMinutes * 1.5);
    
    res.json({
      success: true,
      estimate: {
        minimumMinutes: estimatedMinutes,
        maximumMinutes: maxEstimate,
        averageMinutes: Math.ceil((estimatedMinutes + maxEstimate) / 2),
        factors: [
          'Drive size and type',
          'USB connection speed',
          'System performance',
          'Drive usage level'
        ]
      }
    });

  } catch (error) {
    console.error('Time estimation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to estimate erase time'
    });
  }
});

// Get erase requirements for device type
router.get('/requirements/:deviceType', async (req, res) => {
  try {
    const { deviceType } = req.params;
    
    const requirements = {
      usb: {
        system: ['Windows 10/11', 'Administrator privileges'],
        software: ['PowerShell 5.0+', 'cipher.exe (built-in)'],
        hardware: ['USB port', 'Sufficient disk space for logs'],
        preparation: [
          'Ensure USB device is connected',
          'Close all applications using the drive',
          'Backup any important data elsewhere'
        ],
        warnings: [
          'Process cannot be undone',
          'All data will be permanently destroyed',
          'Drive will be unusable during process'
        ]
      },
      android: {
        system: ['ADB (Android Debug Bridge)', 'USB drivers'],
        software: ['ADB tools installed'],
        hardware: ['USB cable', 'Android device'],
        preparation: [
          'Enable USB debugging on device',
          'Allow computer access when prompted',
          'Ensure device has sufficient battery'
        ],
        warnings: [
          'Root access recommended for complete wipe',
          'Some system data may remain without root',
          'Device will need factory reset after wipe'
        ]
      },
      ios: {
        system: ['No additional software required'],
        software: ['Device must be functional'],
        hardware: ['iOS device with working screen'],
        preparation: [
          'Backup important data to iCloud or computer',
          'Sign out of Apple ID and services',
          'Disable Find My iPhone'
        ],
        warnings: [
          'Manual process only',
          'Uses Apple\'s secure erasure system',
          'Cannot be automated through software'
        ]
      }
    };

    const deviceRequirements = requirements[deviceType.toLowerCase()];
    
    if (!deviceRequirements) {
      return res.status(404).json({
        success: false,
        error: 'Device type not supported'
      });
    }

    res.json({
      success: true,
      deviceType: deviceType,
      requirements: deviceRequirements
    });

  } catch (error) {
    console.error('Requirements error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get requirements'
    });
  }
});

module.exports = router;