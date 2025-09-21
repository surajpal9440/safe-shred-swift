const path = require('path');
const { validateDevice } = require('../utils/validation');
const { logAudit } = require('../services/auditLogger');

/**
 * Safety middleware for device operations
 * Prevents accidental system disk erasure and validates device access
 */

// List of protected system paths
const PROTECTED_PATHS = [
  'C:\\',
  'C:',
  '/System/',
  '/boot/',
  '/usr/',
  '/var/',
  '/etc/',
  process.env.SystemRoot || 'C:\\Windows',
  process.env.ProgramFiles || 'C:\\Program Files',
  process.env.ProgramData || 'C:\\ProgramData'
];

// System disk identifiers
const SYSTEM_DISK_PATTERNS = [
  /^C:/i,
  /^\/$/,
  /^\/System/i,
  /^\/boot/i,
  /Windows/i,
  /System32/i,
  /Program Files/i
];

/**
 * Check if device is a system disk
 */
function isSystemDisk(devicePath, deviceInfo = {}) {
  // Check direct path patterns
  for (const pattern of SYSTEM_DISK_PATTERNS) {
    if (typeof pattern === 'string' && devicePath.toLowerCase().includes(pattern.toLowerCase())) {
      return true;
    }
    if (pattern instanceof RegExp && pattern.test(devicePath)) {
      return true;
    }
  }

  // Check protected paths
  const normalizedPath = path.normalize(devicePath).toLowerCase();
  for (const protectedPath of PROTECTED_PATHS) {
    if (normalizedPath.startsWith(protectedPath.toLowerCase())) {
      return true;
    }
  }

  // Check device info for system indicators
  if (deviceInfo.label && deviceInfo.label.toLowerCase().includes('system')) {
    return true;
  }

  if (deviceInfo.mountpoint && SYSTEM_DISK_PATTERNS.some(pattern => {
    if (typeof pattern === 'string') {
      return deviceInfo.mountpoint.toLowerCase().includes(pattern.toLowerCase());
    }
    return pattern.test(deviceInfo.mountpoint);
  })) {
    return true;
  }

  return false;
}

/**
 * Validate erase confirmation
 */
function validateEraseConfirmation(confirmation, devicePath) {
  const expectedConfirmation = `${devicePath.toUpperCase()} YES`;
  return confirmation === expectedConfirmation;
}

/**
 * Safety check middleware for device operations
 */
const deviceSafetyCheck = async (req, res, next) => {
  try {
    const { device, confirmation } = req.body;

    if (!device) {
      return res.status(400).json({
        success: false,
        error: 'Device information is required'
      });
    }

    // Validate device format
    const deviceValidation = validateDevice(device);
    if (!deviceValidation.valid) {
      await logAudit({
        action: 'SAFETY_CHECK_FAILED',
        device: device.path || device,
        error: 'Invalid device format',
        timestamp: new Date().toISOString(),
        ip: req.ip
      });

      return res.status(400).json({
        success: false,
        error: 'Invalid device format',
        details: deviceValidation.errors
      });
    }

    const devicePath = device.path || device;

    // Check if device is system disk
    if (isSystemDisk(devicePath, device)) {
      await logAudit({
        action: 'SYSTEM_DISK_PROTECTION',
        device: devicePath,
        error: 'Attempted to access system disk',
        timestamp: new Date().toISOString(),
        ip: req.ip,
        severity: 'CRITICAL'
      });

      return res.status(403).json({
        success: false,
        error: 'System disk access denied',
        message: 'Cannot perform erase operations on system disks'
      });
    }

    // Validate confirmation if required
    if (req.route.path.includes('erase') && confirmation) {
      if (!validateEraseConfirmation(confirmation, devicePath)) {
        await logAudit({
          action: 'INVALID_CONFIRMATION',
          device: devicePath,
          error: 'Invalid erase confirmation',
          timestamp: new Date().toISOString(),
          ip: req.ip
        });

        return res.status(400).json({
          success: false,
          error: 'Invalid confirmation',
          message: `Please type exactly: "${devicePath.toUpperCase()} YES"`
        });
      }
    }

    // Add safety info to request
    req.safetyChecked = true;
    req.deviceInfo = device;
    
    next();
  } catch (error) {
    console.error('Safety check error:', error);
    
    await logAudit({
      action: 'SAFETY_CHECK_ERROR',
      error: error.message,
      timestamp: new Date().toISOString(),
      ip: req.ip,
      severity: 'ERROR'
    });

    res.status(500).json({
      success: false,
      error: 'Safety check failed',
      message: 'Internal safety validation error'
    });
  }
};

/**
 * Rate limiting for sensitive operations
 */
const operationRateLimit = (() => {
  const attempts = new Map();
  const maxAttempts = 3;
  const windowMs = 10 * 60 * 1000; // 10 minutes

  return (req, res, next) => {
    const key = `${req.ip}-${req.route.path}`;
    const now = Date.now();
    
    if (!attempts.has(key)) {
      attempts.set(key, []);
    }
    
    const userAttempts = attempts.get(key);
    // Remove old attempts outside the window
    const recentAttempts = userAttempts.filter(timestamp => now - timestamp < windowMs);
    
    if (recentAttempts.length >= maxAttempts) {
      return res.status(429).json({
        success: false,
        error: 'Too many attempts',
        message: 'Please wait before trying again',
        retryAfter: Math.ceil((windowMs - (now - recentAttempts[0])) / 1000)
      });
    }
    
    recentAttempts.push(now);
    attempts.set(key, recentAttempts);
    
    next();
  };
})();

/**
 * Administrator privilege check
 */
const requireAdmin = (req, res, next) => {
  // On Windows, check if running as administrator
  if (process.platform === 'win32') {
    const { execSync } = require('child_process');
    try {
      // Try to access admin-only registry key
      execSync('reg query "HKU\\S-1-5-19" >nul 2>&1', { stdio: 'ignore' });
      next();
    } catch (error) {
      return res.status(403).json({
        success: false,
        error: 'Administrator privileges required',
        message: 'This operation requires administrator access'
      });
    }
  } else {
    // On Unix-like systems, check if root
    if (process.getuid && process.getuid() === 0) {
      next();
    } else {
      return res.status(403).json({
        success: false,
        error: 'Root privileges required',
        message: 'This operation requires root access'
      });
    }
  }
};

module.exports = {
  deviceSafetyCheck,
  operationRateLimit,
  requireAdmin,
  isSystemDisk,
  validateEraseConfirmation
};