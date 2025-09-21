// backend/services/licenseValidator.js
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { getAppDataPath } = require('../utils/paths');

class LicenseValidator {
  constructor() {
    this.publicKeyPath = path.join(__dirname, '../../keys/public.key');
    this.licenseFilePath = path.join(getAppDataPath(), 'license.json');
    this.publicKey = null;
  }

  async initialize() {
    try {
      await this.loadPublicKey();
      console.log('License validator initialized');
    } catch (error) {
      console.error('Failed to initialize license validator:', error);
      throw error;
    }
  }

  async loadPublicKey() {
    try {
      const keyData = await fs.readFile(this.publicKeyPath, 'utf8');
      this.publicKey = crypto.createPublicKey(keyData);
      console.log('Public key loaded successfully');
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.createDefaultKeys();
      } else {
        throw error;
      }
    }
  }

  async createDefaultKeys() {
    console.log('Creating default RSA key pair for development...');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const keysDir = path.dirname(this.publicKeyPath);
    await fs.mkdir(keysDir, { recursive: true });
    await fs.writeFile(this.publicKeyPath, publicKey);
    await fs.writeFile(path.join(keysDir, 'private.key'), privateKey);
    await fs.writeFile(path.join(keysDir, 'README.md'), `# ShredSafe License Keys\nGenerated: ${new Date().toISOString()}`);

    this.publicKey = crypto.createPublicKey(publicKey);
    console.log('Default keys created successfully');
  }

  async validateLicense(licenseData) {
    try {
      if (!this.isValidLicenseStructure(licenseData)) {
        return { isValid: false, error: 'Invalid license structure' };
      }
      const isSignatureValid = await this.verifySignature(licenseData);
      if (!isSignatureValid) return { isValid: false, error: 'Invalid license signature' };
      if (this.isExpired(licenseData)) return { isValid: false, error: 'License has expired' };

      const features = this.getLicenseFeatures(licenseData);
      return {
        isValid: true,
        license: licenseData,
        features,
        expiresAt: new Date(licenseData.validUntil),
        customer: licenseData.customer
      };
    } catch (error) {
      console.error('License validation error:', error);
      return { isValid: false, error: 'License validation failed' };
    }
  }

  isValidLicenseStructure(license) {
    const required = ['customer', 'licenseType', 'issuedAt', 'validUntil', 'signature'];
    if (!license || typeof license !== 'object') return false;
    for (const field of required) if (!license[field]) return false;

    if (!['trial', 'standard', 'enterprise'].includes(license.licenseType)) return false;
    const issuedAt = new Date(license.issuedAt);
    const validUntil = new Date(license.validUntil);
    return !isNaN(issuedAt) && !isNaN(validUntil) && validUntil > issuedAt;
  }

  async verifySignature(license) {
    try {
      if (!this.publicKey) throw new Error('Public key not loaded');
      const { signature, ...dataToVerify } = license;
      const dataString = JSON.stringify(dataToVerify, Object.keys(dataToVerify).sort());
      return crypto.verify('sha256', Buffer.from(dataString), this.publicKey, Buffer.from(signature, 'base64'));
    } catch (err) {
      console.error('Signature verification error:', err);
      return false;
    }
  }

  isExpired(license) {
    return new Date() > new Date(license.validUntil);
  }

  getLicenseFeatures(license) {
    const base = { maxDevices: 1, auditLogging: true, batchErase: false, reporting: false, apiAccess: false };
    switch (license.licenseType) {
      case 'trial': return { ...base, maxDevices: 1, trialMode: true };
      case 'standard': return { ...base, maxDevices: 5, batchErase: true };
      case 'enterprise': return { ...base, maxDevices: -1, batchErase: true, reporting: true, apiAccess: true, customBranding: true };
      default: return base;
    }
  }

  async saveLicense(licenseData) {
    const validation = await this.validateLicense(licenseData);
    if (!validation.isValid) throw new Error(`Invalid license: ${validation.error}`);
    await fs.writeFile(this.licenseFilePath, JSON.stringify(licenseData, null, 2));
    console.log('License saved successfully');
    return { success: true };
  }

  async loadSavedLicense() {
    try {
      const data = await fs.readFile(this.licenseFilePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async validateLicenseStatus() {
    const saved = await this.loadSavedLicense();
    if (!saved) return { isValid: false, error: 'No license found' };
    return this.validateLicense(saved);
  }

  async deleteLicense() {
    try {
      await fs.unlink(this.licenseFilePath);
      console.log('License deleted successfully');
      return { success: true };
    } catch (err) {
      if (err.code === 'ENOENT') return { success: true };
      throw err;
    }
  }

  generateLicenseHash(licenseData) {
    const { signature, ...dataToHash } = licenseData;
    const dataString = JSON.stringify(dataToHash, Object.keys(dataToHash).sort());
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  getLicenseInfo(licenseData) {
    return {
      customer: licenseData.customer,
      type: licenseData.licenseType,
      issuedAt: new Date(licenseData.issuedAt).toLocaleDateString(),
      validUntil: new Date(licenseData.validUntil).toLocaleDateString(),
      daysRemaining: Math.ceil((new Date(licenseData.validUntil) - new Date()) / (1000 * 60 * 60 * 24)),
      hash: this.generateLicenseHash(licenseData)
    };
  }

  async validateOnline(licenseData) {
    return { isValid: false, error: 'Online validation not available' };
  }
}

const licenseValidator = new LicenseValidator();
licenseValidator.initialize().catch(console.error);

module.exports = {
  licenseValidator,
  validateLicense: (data) => licenseValidator.validateLicense(data),
  validateLicenseStatus: () => licenseValidator.validateLicenseStatus(),
  saveLicense: (data) => licenseValidator.saveLicense(data),
  loadSavedLicense: () => licenseValidator.loadSavedLicense(),
  deleteLicense: () => licenseValidator.deleteLicense(),
  getLicenseInfo: (data) => licenseValidator.getLicenseInfo(data)
};
