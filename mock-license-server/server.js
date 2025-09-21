const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

/**
 * Mock License Server for ShredSafe
 * Generates and validates licenses for development and testing
 */

const app = express();
const PORT = process.env.LICENSE_SERVER_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load private key for signing (development only)
let privateKey;
try {
  privateKey = fs.readFileSync(path.join(__dirname, '..', 'keys', 'private.key'), 'utf8');
} catch (error) {
  console.warn('Private key not found, generating temporary key...');
  // Generate temporary key pair for development
  const { publicKey: pubKey, privateKey: privKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  
  privateKey = privKey;
  
  // Save temporary keys
  const keysDir = path.join(__dirname, '..', 'keys');
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }
  
  fs.writeFileSync(path.join(keysDir, 'private.key'), privKey);
  fs.writeFileSync(path.join(keysDir, 'public.key'), pubKey);
  
  console.log('Generated temporary key pair for development');
}

// License templates
const LICENSE_TYPES = {
  trial: {
    name: 'Trial License',
    validity_days: 30,
    max_devices: 5,
    features: ['device_wipe', 'basic_audit']
  },
  standard: {
    name: 'Standard License',
    validity_days: 365,
    max_devices: 50,
    features: ['device_wipe', 'audit_logs', 'email_reports']
  },
  enterprise: {
    name: 'Enterprise License',
    validity_days: 365,
    max_devices: 1000,
    features: ['device_wipe', 'audit_logs', 'email_reports', 'bulk_operations', 'api_access', 'ldap_auth']
  },
  unlimited: {
    name: 'Unlimited License',
    validity_days: 3650, // 10 years
    max_devices: -1, // Unlimited
    features: ['device_wipe', 'audit_logs', 'email_reports', 'bulk_operations', 'api_access', 'ldap_auth', 'white_label']
  }
};

/**
 * Sign license data
 */
function signLicense(licenseData) {
  // Create canonical JSON (sorted keys, no whitespace)
  const payload = JSON.stringify(licenseData, Object.keys(licenseData).sort());
  
  // Sign with RSA-SHA256
  const signature = crypto.sign('RSA-SHA256', Buffer.from(payload), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING
  });
  
  return signature.toString('base64');
}

/**
 * Generate license
 */
function generateLicense(customerData, licenseType = 'trial') {
  const template = LICENSE_TYPES[licenseType] || LICENSE_TYPES.trial;
  const now = new Date();
  const validity = new Date(now.getTime() + (template.validity_days * 24 * 60 * 60 * 1000));
  
  const license = {
    customer: customerData.company || 'Test Company',
    contact_email: customerData.email || 'test@example.com',
    license_id: crypto.randomUUID(),
    type: licenseType,
    issued_at: now.toISOString(),
    validity: validity.toISOString(),
    max_devices: template.max_devices,
    features: template.features,
    issuer: 'ShredSafe License Server',
    version: '1.0'
  };
  
  // Sign the license
  const signature = signLicense(license);
  
  return {
    ...license,
    signature
  };
}

/**
 * Validate existing license
 */
function validateLicense(licenseData) {
  try {
    // Extract signature
    const { signature, ...payload } = licenseData;
    
    if (!signature) {
      return { valid: false, error: 'No signature provided' };
    }
    
    // Verify signature
    const payloadString = JSON.stringify(payload, Object.keys(payload).sort());
    const isValidSignature = crypto.verify('RSA-SHA256', Buffer.from(payloadString), {
      key: fs.readFileSync(path.join(__dirname, '..', 'keys', 'public.key'), 'utf8'),
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING
    }, Buffer.from(signature, 'base64'));
    
    if (!isValidSignature) {
      return { valid: false, error: 'Invalid signature' };
    }
    
    // Check expiration
    const now = new Date();
    const validityDate = new Date(licenseData.validity);
    
    if (validityDate < now) {
      return { valid: false, error: 'License expired' };
    }
    
    return { 
      valid: true, 
      license: licenseData,
      days_remaining: Math.ceil((validityDate - now) / (24 * 60 * 60 * 1000))
    };
    
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// Routes

/**
 * GET /health - Health check
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ShredSafe License Server',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /license-types - Get available license types
 */
app.get('/license-types', (req, res) => {
  res.json({
    success: true,
    license_types: Object.keys(LICENSE_TYPES).map(key => ({
      type: key,
      ...LICENSE_TYPES[key]
    }))
  });
});

/**
 * POST /generate - Generate new license
 */
app.post('/generate', (req, res) => {
  try {
    const { customer, license_type = 'trial' } = req.body;
    
    if (!customer || !customer.company) {
      return res.status(400).json({
        success: false,
        error: 'Customer information required (company name)'
      });
    }
    
    if (!LICENSE_TYPES[license_type]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid license type',
        available_types: Object.keys(LICENSE_TYPES)
      });
    }
    
    const license = generateLicense(customer, license_type);
    
    // Log license generation
    console.log(`Generated ${license_type} license for ${customer.company}`);
    
    res.json({
      success: true,
      license,
      message: 'License generated successfully'
    });
    
  } catch (error) {
    console.error('License generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate license'
    });
  }
});

/**
 * POST /validate - Validate license
 */
app.post('/validate', (req, res) => {
  try {
    const { license } = req.body;
    
    if (!license) {
      return res.status(400).json({
        success: false,
        error: 'License data required'
      });
    }
    
    const validation = validateLicense(license);
    
    res.json({
      success: validation.valid,
      ...validation
    });
    
  } catch (error) {
    console.error('License validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate license'
    });
  }
});

/**
 * GET /generate-test-licenses - Generate sample licenses for testing
 */
app.get('/generate-test-licenses', (req, res) => {
  try {
    const testCustomers = [
      { company: 'ACME Bank', email: 'it@acmebank.com' },
      { company: 'SecureFinance Corp', email: 'admin@securefinance.com' },
      { company: 'TechStart LLC', email: 'dev@techstart.com' }
    ];
    
    const licenses = {};
    
    Object.keys(LICENSE_TYPES).forEach(licenseType => {
      licenses[licenseType] = testCustomers.map(customer => 
        generateLicense(customer, licenseType)
      );
    });
    
    // Save test licenses to files
    const testDir = path.join(__dirname, 'test-licenses');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    Object.keys(licenses).forEach(type => {
      licenses[type].forEach((license, index) => {
        const filename = `${type}_${testCustomers[index].company.toLowerCase().replace(/\s+/g, '_')}.json`;
        fs.writeFileSync(
          path.join(testDir, filename), 
          JSON.stringify(license, null, 2)
        );
      });
    });
    
    res.json({
      success: true,
      message: 'Test licenses generated',
      licenses,
      saved_to: testDir
    });
    
  } catch (error) {
    console.error('Test license generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate test licenses'
    });
  }
});

/**
 * GET /revoke/:license_id - Revoke license (for future implementation)
 */
app.post('/revoke/:license_id', (req, res) => {
  // TODO: Implement license revocation list
  res.json({
    success: true,
    message: 'License revocation not implemented yet',
    license_id: req.params.license_id
  });
});

/**
 * Error handling middleware
 */
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🔐 ShredSafe License Server running on port ${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  /health - Health check`);
  console.log(`   GET  /license-types - Available license types`);
  console.log(`   POST /generate - Generate new license`);
  console.log(`   POST /validate - Validate license`);
  console.log(`   GET  /generate-test-licenses - Generate test licenses`);
  console.log(`\n🧪 For testing, visit: http://localhost:${PORT}/generate-test-licenses`);
});

module.exports = app;