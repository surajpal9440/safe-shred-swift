#!/usr/bin/env node

/**
 * License Generator CLI Tool
 * Command-line utility to generate licenses for ShredSafe
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

class LicenseGenerator {
  constructor() {
    this.privateKey = null;
    this.loadPrivateKey();
    
    this.licenseTypes = {
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
        validity_days: 3650,
        max_devices: -1,
        features: ['device_wipe', 'audit_logs', 'email_reports', 'bulk_operations', 'api_access', 'ldap_auth', 'white_label']
      }
    };
  }

  loadPrivateKey() {
    const keyPath = path.join(__dirname, '..', 'keys', 'private.key');
    
    try {
      this.privateKey = fs.readFileSync(keyPath, 'utf8');
    } catch (error) {
      console.error('❌ Private key not found. Generating temporary key...');
      this.generateTemporaryKeys();
    }
  }

  generateTemporaryKeys() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    this.privateKey = privateKey;

    // Save keys
    const keysDir = path.join(__dirname, '..', 'keys');
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }

    fs.writeFileSync(path.join(keysDir, 'private.key'), privateKey);
    fs.writeFileSync(path.join(keysDir, 'public.key'), publicKey);

    console.log('✅ Generated temporary key pair');
  }

  signLicense(licenseData) {
    const payload = JSON.stringify(licenseData, Object.keys(licenseData).sort());
    
    const signature = crypto.sign('RSA-SHA256', Buffer.from(payload), {
      key: this.privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING
    });
    
    return signature.toString('base64');
  }

  generateLicense(customerData, licenseType = 'trial', customValidity = null) {
    const template = this.licenseTypes[licenseType] || this.licenseTypes.trial;
    const now = new Date();
    
    let validityDays = template.validity_days;
    if (customValidity && customValidity > 0) {
      validityDays = customValidity;
    }
    
    const validity = new Date(now.getTime() + (validityDays * 24 * 60 * 60 * 1000));
    
    const license = {
      customer: customerData.company || 'Unknown Company',
      contact_email: customerData.email || 'unknown@example.com',
      license_id: crypto.randomUUID(),
      type: licenseType,
      issued_at: now.toISOString(),
      validity: validity.toISOString(),
      max_devices: template.max_devices,
      features: template.features,
      issuer: 'ShredSafe License Server',
      version: '1.0'
    };
    
    const signature = this.signLicense(license);
    
    return {
      ...license,
      signature
    };
  }

  async promptUser(question) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(resolve => {
      rl.question(question, answer => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  async interactiveMode() {
    console.log('\n🔐 ShredSafe License Generator');
    console.log('=====================================\n');

    // Get customer information
    const company = await this.promptUser('Company Name: ');
    const email = await this.promptUser('Contact Email: ');

    // Show license types
    console.log('\nAvailable License Types:');
    Object.keys(this.licenseTypes).forEach((type, index) => {
      const template = this.licenseTypes[type];
      console.log(`${index + 1}. ${type.toUpperCase()} - ${template.name}`);
      console.log(`   Valid for: ${template.validity_days} days`);
      console.log(`   Max devices: ${template.max_devices === -1 ? 'Unlimited' : template.max_devices}`);
      console.log(`   Features: ${template.features.join(', ')}\n`);
    });

    const typeChoice = await this.promptUser('Select license type (1-4): ');
    const typeIndex = parseInt(typeChoice) - 1;
    const licenseTypes = Object.keys(this.licenseTypes);
    const selectedType = licenseTypes[typeIndex] || 'trial';

    // Custom validity period
    const customDays = await this.promptUser('Custom validity period in days (press Enter for default): ');
    const validityDays = customDays ? parseInt(customDays) : null;

    // Generate license
    const license = this.generateLicense(
      { company, email },
      selectedType,
      validityDays
    );

    console.log('\n✅ License Generated Successfully!\n');
    console.log('License Details:');
    console.log('================');
    console.log(`Company: ${license.customer}`);
    console.log(`Type: ${license.type.toUpperCase()}`);
    console.log(`Valid Until: ${new Date(license.validity).toLocaleDateString()}`);
    console.log(`Max Devices: ${license.max_devices === -1 ? 'Unlimited' : license.max_devices}`);
    console.log(`Features: ${license.features.join(', ')}`);

    // Save to file
    const filename = `license_${company.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.json`;
    const licensePath = path.join(__dirname, 'test-licenses', filename);

    // Ensure directory exists
    const testDir = path.join(__dirname, 'test-licenses');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    fs.writeFileSync(licensePath, JSON.stringify(license, null, 2));
    console.log(`\n💾 License saved to: ${licensePath}`);

    return license;
  }

  generateBulkLicenses() {
    const testCustomers = [
      { company: 'ACME Bank', email: 'it@acmebank.com' },
      { company: 'SecureFinance Corp', email: 'admin@securefinance.com' },
      { company: 'TechStart LLC', email: 'dev@techstart.com' },
      { company: 'Global Insurance Ltd', email: 'security@globalins.com' },
      { company: 'Data Solutions Inc', email: 'ops@datasolutions.com' }
    ];

    const testDir = path.join(__dirname, 'test-licenses');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    console.log('\n🔄 Generating bulk test licenses...\n');

    Object.keys(this.licenseTypes).forEach(licenseType => {
      testCustomers.forEach((customer, index) => {
        const license = this.generateLicense(customer, licenseType);
        const filename = `${licenseType}_${customer.company.toLowerCase().replace(/\s+/g, '_')}.json`;
        const filepath = path.join(testDir, filename);
        
        fs.writeFileSync(filepath, JSON.stringify(license, null, 2));
        console.log(`✅ Generated: ${filename}`);
      });
    });

    console.log(`\n💾 All licenses saved to: ${testDir}`);
  }

  validateLicense(licensePath) {
    try {
      const licenseData = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
      const publicKeyPath = path.join(__dirname, '..', 'keys', 'public.key');
      const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

      // Extract signature
      const { signature, ...payload } = licenseData;
      
      // Verify signature
      const payloadString = JSON.stringify(payload, Object.keys(payload).sort());
      const isValidSignature = crypto.verify('RSA-SHA256', Buffer.from(payloadString), {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING
      }, Buffer.from(signature, 'base64'));

      // Check expiration
      const now = new Date();
      const validityDate = new Date(licenseData.validity);
      const isExpired = validityDate < now;

      console.log('\n🔍 License Validation Results');
      console.log('==============================');
      console.log(`File: ${path.basename(licensePath)}`);
      console.log(`Customer: ${licenseData.customer}`);
      console.log(`Type: ${licenseData.type.toUpperCase()}`);
      console.log(`Signature Valid: ${isValidSignature ? '✅ Yes' : '❌ No'}`);
      console.log(`Expired: ${isExpired ? '❌ Yes' : '✅ No'}`);
      console.log(`Valid Until: ${validityDate.toLocaleDateString()}`);
      
      if (!isExpired) {
        const daysRemaining = Math.ceil((validityDate - now) / (24 * 60 * 60 * 1000));
        console.log(`Days Remaining: ${daysRemaining}`);
      }

      return isValidSignature && !isExpired;

    } catch (error) {
      console.error(`❌ Failed to validate license: ${error.message}`);
      return false;
    }
  }

  showUsage() {
    console.log(`
🔐 ShredSafe License Generator

Usage: node generate-license.js [command] [options]

Commands:
  interactive, -i     Interactive license generation
  bulk               Generate bulk test licenses
  validate <file>    Validate existing license file
  help, -h           Show this help message

Examples:
  node generate-license.js interactive
  node generate-license.js bulk
  node generate-license.js validate ./test-licenses/trial_acme_bank.json

License Types:
  trial      - 30 days, 5 devices
  standard   - 365 days, 50 devices
  enterprise - 365 days, 1000 devices
  unlimited  - 10 years, unlimited devices
`);
  }
}

// CLI Interface
async function main() {
  const generator = new LicenseGenerator();
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'interactive':
    case '-i':
      await generator.interactiveMode();
      break;

    case 'bulk':
      generator.generateBulkLicenses();
      break;

    case 'validate':
      if (!args[1]) {
        console.error('❌ Please provide license file path');
        process.exit(1);
      }
      generator.validateLicense(args[1]);
      break;

    case 'help':
    case '-h':
    case undefined:
      generator.showUsage();
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      generator.showUsage();
      process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

module.exports = LicenseGenerator;