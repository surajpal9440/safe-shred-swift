// backend/routes/license.js
const express = require('express');
const multer = require('multer');
const { 
  validateLicense, 
  validateLicenseStatus, 
  saveLicense, 
  loadSavedLicense, 
  deleteLicense,
  getLicenseInfo 
} = require('../services/licenseValidator');
const auditLogger = require('../services/auditLogger');

const router = express.Router();

// Configure multer for license file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON license files are allowed'), false);
    }
  }
});

// ----------------------
// Routes
// ----------------------

// Get current license status
router.get('/status', async (req, res) => {
  try {
    const validation = await validateLicenseStatus();

    if (validation.isValid && validation.license) {
      const licenseInfo = getLicenseInfo(validation.license);

      return res.json({
        success: true,
        isValid: true,
        license: licenseInfo,
        features: validation.features,
        expiresAt: validation.expiresAt
      });
    }

    res.json({
      success: true,
      isValid: false,
      error: validation.error,
      requiresLicense: true
    });

  } catch (error) {
    console.error('License status check error:', error);
    res.status(500).json({ success: false, error: 'Failed to check license status' });
  }
});

// Validate license data (without saving)
router.post('/validate', async (req, res) => {
  try {
    const { licenseData } = req.body;

    if (!licenseData) {
      return res.status(400).json({ success: false, error: 'License data is required' });
    }

    const validation = await validateLicense(licenseData);

    // Log validation attempt
    await auditLogger.logLicenseValidation(
      licenseData.customer || 'Unknown',
      licenseData.licenseType || 'Unknown',
      validation.isValid ? 'success' : 'failure',
      validation.error || ''
    );

    if (validation.isValid && validation.license) {
      return res.json({
        success: true,
        isValid: true,
        license: getLicenseInfo(validation.license),
        features: validation.features
      });
    }

    res.json({ success: true, isValid: false, error: validation.error });

  } catch (error) {
    console.error('License validation error:', error);
    res.status(500).json({ success: false, error: 'License validation failed' });
  }
});

// Upload and save license file
router.post('/upload', upload.single('license'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No license file uploaded' });
    }

    let licenseData;
    try {
      licenseData = JSON.parse(req.file.buffer.toString('utf8'));
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid JSON in license file' });
    }

    const validation = await validateLicense(licenseData);

    if (!validation.isValid) {
      await auditLogger.logLicenseUpload(
        licenseData.customer || 'Unknown',
        licenseData.licenseType || 'Unknown',
        req.file.originalname,
        'validation_failed'
      );
      return res.json({ success: false, error: validation.error });
    }

    await saveLicense(licenseData);

    await auditLogger.logLicenseUpload(
      licenseData.customer || 'Unknown',
      licenseData.licenseType || 'Unknown',
      req.file.originalname,
      'success'
    );

    res.json({
      success: true,
      message: 'License uploaded and activated successfully',
      license: getLicenseInfo(licenseData),
      features: validation.features
    });

  } catch (error) {
    console.error('License upload error:', error);
    await auditLogger.logError(error, 'license_upload');
    res.status(500).json({ success: false, error: 'Failed to upload license' });
  }
});

// Activate license from JSON data
router.post('/activate', async (req, res) => {
  try {
    const { licenseData } = req.body;

    if (!licenseData) {
      return res.status(400).json({ success: false, error: 'License data is required' });
    }

    const validation = await validateLicense(licenseData);

    if (!validation.isValid) {
      await auditLogger.logLicenseValidation(
        licenseData.customer || 'Unknown',
        licenseData.licenseType || 'Unknown',
        'activation_failed',
        validation.error || ''
      );
      return res.json({ success: false, error: validation.error });
    }

    await saveLicense(licenseData);

    await auditLogger.logLicenseValidation(
      licenseData.customer || 'Unknown',
      licenseData.licenseType || 'Unknown',
      'activated',
      'License activated successfully'
    );

    res.json({
      success: true,
      message: 'License activated successfully',
      license: getLicenseInfo(licenseData),
      features: validation.features
    });

  } catch (error) {
    console.error('License activation error:', error);
    await auditLogger.logError(error, 'license_activation');
    res.status(500).json({ success: false, error: 'Failed to activate license' });
  }
});

// Deactivate/remove license
router.delete('/', async (req, res) => {
  try {
    const currentLicense = await loadSavedLicense();

    if (currentLicense) {
      await auditLogger.logLicenseValidation(
        currentLicense.customer || 'Unknown',
        currentLicense.licenseType || 'Unknown',
        'deactivated',
        'License removed by user'
      );
    }

    await deleteLicense();

    res.json({ success: true, message: 'License removed successfully' });

  } catch (error) {
    console.error('License deletion error:', error);
    await auditLogger.logError(error, 'license_deletion');
    res.status(500).json({ success: false, error: 'Failed to remove license' });
  }
});

// Get license info (detailed view)
router.get('/info', async (req, res) => {
  try {
    const savedLicense = await loadSavedLicense();

    if (!savedLicense) {
      return res.json({ success: true, hasLicense: false, message: 'No license found' });
    }

    const validation = await validateLicense(savedLicense);

    res.json({
      success: true,
      hasLicense: true,
      isValid: validation.isValid,
      license: {
        ...getLicenseInfo(savedLicense),
        isExpired: !validation.isValid && validation.error?.includes('expired'),
        validationError: validation.error || null
      },
      features: validation.isValid ? validation.features : null
    });

  } catch (error) {
    console.error('License info error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve license information' });
  }
});

// Check license expiry
router.get('/expiry', async (req, res) => {
  try {
    const validation = await validateLicenseStatus();

    if (!validation.isValid) {
      return res.json({ success: true, expired: true, error: validation.error });
    }

    const expiryDate = new Date(validation.license.validUntil);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    res.json({
      success: true,
      expired: false,
      daysUntilExpiry,
      expiryDate: expiryDate.toISOString(),
      warningLevel: daysUntilExpiry <= 7 ? 'critical' : daysUntilExpiry <= 30 ? 'warning' : 'normal'
    });

  } catch (error) {
    console.error('License expiry check error:', error);
    res.status(500).json({ success: false, error: 'Failed to check license expiry' });
  }
});

// Stub for online validation (future)
router.post('/validate-online', async (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Online license validation not yet implemented',
    useOfflineValidation: true
  });
});

// Multer error handling
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, error: 'License file too large. Maximum size is 5MB.' });
  }

  if (error.message === 'Only JSON license files are allowed') {
    return res.status(400).json({ success: false, error: 'Invalid file type. Only JSON license files are accepted.' });
  }

  next(error);
});

module.exports = router;
