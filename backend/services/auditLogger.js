// backend/services/auditLogger.js
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { getAppDataPath } = require('../utils/paths');

class AuditLogger {
  constructor() {
    this.auditFilePath = path.join(getAppDataPath(), 'audit.json');
    this.auditLogs = [];
    this.initialized = false;
  }

  async initialize() {
    try {
      await this.loadExistingLogs();
      this.initialized = true;
      console.log('Audit logger initialized successfully');
    } catch (error) {
      console.error('Failed to initialize audit logger:', error);
      throw error;
    }
  }

  async loadExistingLogs() {
    try {
      const auditData = await fs.readFile(this.auditFilePath, 'utf8');
      const parsed = JSON.parse(auditData);
      
      if (Array.isArray(parsed.logs)) {
        this.auditLogs = parsed.logs;
        console.log(`Loaded ${this.auditLogs.length} existing audit logs`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('No existing audit logs found, starting fresh');
        await this.saveAuditLogs();
      } else {
        console.error('Error loading audit logs:', error);
        throw error;
      }
    }
  }

  async saveAuditLogs() {
    try {
      const auditData = {
        version: '1.0',
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        totalEntries: this.auditLogs.length,
        logs: this.auditLogs
      };

      await fs.writeFile(this.auditFilePath, JSON.stringify(auditData, null, 2));
    } catch (error) {
      console.error('Failed to save audit logs:', error);
      throw error;
    }
  }

  generateLogId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `log_${timestamp}_${random}`;
  }

  generateChecksum(data) {
    return crypto.createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex')
      .substring(0, 16);
  }

  async addLogEntry(entry) {
    if (!this.initialized) {
      await this.initialize();
    }

    const logEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      checksum: '', // Will be filled after creating the entry
      ...entry
    };

    // Generate checksum for integrity verification
    const { checksum, ...dataForChecksum } = logEntry;
    logEntry.checksum = this.generateChecksum(dataForChecksum);

    this.auditLogs.push(logEntry);

    // Save to file
    await this.saveAuditLogs();

    console.log(`Audit log entry added: ${entry.action} - ${entry.jobId || 'N/A'}`);
    return logEntry.id;
  }

  async logLicenseValidation(customer, licenseType, result, details = null) {
    return await this.addLogEntry({
      action: 'license_validation',
      category: 'authentication',
      customer: customer,
      licenseType: licenseType,
      result: result, // 'success', 'failure', 'expired'
      details: details,
      severity: result === 'success' ? 'info' : 'warning'
    });
  }

  async logLicenseUpload(customer, licenseType, filename, result) {
    return await this.addLogEntry({
      action: 'license_upload',
      category: 'authentication',
      customer: customer,
      licenseType: licenseType,
      filename: filename,
      result: result,
      severity: result === 'success' ? 'info' : 'error'
    });
  }

  async logDriveDetection(drivesFound, customer = null) {
    return await this.addLogEntry({
      action: 'drive_detection',
      category: 'system',
      customer: customer,
      drivesFound: drivesFound,
      driveDetails: drivesFound.map(drive => ({
        driveLetter: drive.driveLetter,
        label: drive.label,
        size: drive.sizeFormatted,
        type: drive.driveType
      })),
      result: 'success',
      severity: 'info'
    });
  }

  async logEraseStart(job) {
    return await this.addLogEntry({
      action: 'erase_start',
      category: 'data_destruction',
      jobId: job.id,
      customer: job.customer,
      deviceId: job.deviceId,
      driveLetter: job.driveLetter,
      deviceType: job.deviceType,
      confirmation: job.confirmation,
      startTime: job.startTime,
      result: 'initiated',
      severity: 'high'
    });
  }

  async logEraseProgress(jobId, progress, message, customer = null) {
    return await this.addLogEntry({
      action: 'erase_progress',
      category: 'data_destruction',
      jobId: jobId,
      customer: customer,
      progress: progress,
      message: message,
      result: 'in_progress',
      severity: 'info'
    });
  }

  async logEraseComplete(jobId, result, message, customer = null) {
    const job = await this.getEraseJobInfo(jobId);
    
    return await this.addLogEntry({
      action: 'erase_complete',
      category: 'data_destruction',
      jobId: jobId,
      customer: customer || job?.customer,
      deviceId: job?.deviceId,
      driveLetter: job?.driveLetter,
      result: result, // 'success', 'failed', 'cancelled'
      message: message,
      duration: job ? this.calculateJobDuration(job.startTime) : null,
      severity: result === 'success' ? 'high' : 'error'
    });
  }

  async logSystemAccess(user, action, details = null) {
    return await this.addLogEntry({
      action: 'system_access',
      category: 'security',
      user: user,
      accessAction: action, // 'login', 'logout', 'elevation_request'
      details: details,
      ipAddress: '127.0.0.1', // Local app
      result: 'success',
      severity: 'medium'
    });
  }

  async logSecurityEvent(eventType, description, severity = 'medium') {
    return await this.addLogEntry({
      action: 'security_event',
      category: 'security',
      eventType: eventType,
      description: description,
      result: 'detected',
      severity: severity
    });
  }

  async logError(error, context = null, customer = null) {
    return await this.addLogEntry({
      action: 'error',
      category: 'system',
      customer: customer,
      errorMessage: error.message,
      errorStack: error.stack,
      context: context,
      result: 'error',
      severity: 'error'
    });
  }

  calculateJobDuration(startTime) {
    const start = new Date(startTime);
    const end = new Date();
    const durationMs = end - start;
    
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  async getEraseJobInfo(jobId) {
    // Find erase_start log for this job
    const startLog = this.auditLogs.find(log => 
      log.action === 'erase_start' && log.jobId === jobId
    );
    return startLog;
  }

  async getAuditLogs(filters = {}) {
    let filteredLogs = [...this.auditLogs];

    // Apply filters
    if (filters.category) {
      filteredLogs = filteredLogs.filter(log => log.category === filters.category);
    }

    if (filters.action) {
      filteredLogs = filteredLogs.filter(log => log.action === filters.action);
    }

    if (filters.customer) {
      filteredLogs = filteredLogs.filter(log => 
        log.customer && log.customer.toLowerCase().includes(filters.customer.toLowerCase())
      );
    }

    if (filters.severity) {
      filteredLogs = filteredLogs.filter(log => log.severity === filters.severity);
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= fromDate);
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= toDate);
    }

    if (filters.jobId) {
      filteredLogs = filteredLogs.filter(log => log.jobId === filters.jobId);
    }

    // Sort by timestamp (newest first)
    filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply pagination
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 50;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    return {
      logs: filteredLogs.slice(startIndex, endIndex),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(filteredLogs.length / limit),
        totalEntries: filteredLogs.length,
        hasNext: endIndex < filteredLogs.length,
        hasPrevious: page > 1
      }
    };
  }

  async exportAuditLogs(format = 'json', filters = {}) {
    const { logs } = await this.getAuditLogs(filters);
    
    const exportData = {
      exportTimestamp: new Date().toISOString(),
      totalEntries: logs.length,
      filters: filters,
      logs: logs
    };

    if (format === 'csv') {
      return this.convertToCSV(logs);
    } else if (format === 'txt') {
      return this.convertToText(logs);
    } else {
      return JSON.stringify(exportData, null, 2);
    }
  }

  convertToCSV(logs) {
    if (logs.length === 0) return '';

    // Get all unique keys from all log entries
    const allKeys = new Set();
    logs.forEach(log => Object.keys(log).forEach(key => allKeys.add(key)));
    
    const headers = Array.from(allKeys).sort();
    
    const csvRows = [headers.join(',')];
    
    logs.forEach(log => {
      const row = headers.map(header => {
        let value = log[header] || '';
        
        // Handle special formatting
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }
        
        // Escape quotes and wrap in quotes if contains comma
        value = value.toString().replace(/"/g, '""');
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
          value = `"${value}"`;
        }
        
        return value;
      });
      
      csvRows.push(row.join(','));
    });
    
    return csvRows.join('\n');
  }

  convertToText(logs) {
    const lines = ['ShredSafe Audit Log Export', '=' .repeat(40), ''];
    
    logs.forEach(log => {
      lines.push(`[${log.timestamp}] ${log.action.toUpperCase()}`);
      lines.push(`  ID: ${log.id}`);
      lines.push(`  Category: ${log.category}`);
      lines.push(`  Severity: ${log.severity}`);
      
      if (log.customer) lines.push(`  Customer: ${log.customer}`);
      if (log.jobId) lines.push(`  Job ID: ${log.jobId}`);
      if (log.deviceId) lines.push(`  Device: ${log.deviceId}`);
      if (log.driveLetter) lines.push(`  Drive: ${log.driveLetter}`);
      if (log.result) lines.push(`  Result: ${log.result}`);
      if (log.message) lines.push(`  Message: ${log.message}`);
      
      lines.push(`  Checksum: ${log.checksum}`);
      lines.push('');
    });
    
    return lines.join('\n');
  }

  async verifyLogIntegrity() {
    const corruptedLogs = [];
    
    for (const log of this.auditLogs) {
      const { checksum, ...dataForChecksum } = log;
      const expectedChecksum = this.generateChecksum(dataForChecksum);
      
      if (checksum !== expectedChecksum) {
        corruptedLogs.push({
          id: log.id,
          timestamp: log.timestamp,
          expectedChecksum,
          actualChecksum: checksum
        });
      }
    }
    
    return {
      totalLogs: this.auditLogs.length,
      corruptedLogs: corruptedLogs.length,
      corruptionDetails: corruptedLogs,
      isIntegrityValid: corruptedLogs.length === 0
    };
  }

  getAuditStatistics() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return {
      total: {
        entries: this.auditLogs.length,
        categories: [...new Set(this.auditLogs.map(log => log.category))].length,
        customers: [...new Set(this.auditLogs.map(log => log.customer).filter(Boolean))].length
      },
      today: {
        entries: this.auditLogs.filter(log => new Date(log.timestamp) >= todayStart).length,
        eraseJobs: this.auditLogs.filter(log => 
          log.action === 'erase_complete' && new Date(log.timestamp) >= todayStart
        ).length
      },
      thisWeek: {
        entries: this.auditLogs.filter(log => new Date(log.timestamp) >= weekStart).length,
        eraseJobs: this.auditLogs.filter(log => 
          log.action === 'erase_complete' && new Date(log.timestamp) >= weekStart
        ).length
      },
      byCategory: this.auditLogs.reduce((acc, log) => {
        acc[log.category] = (acc[log.category] || 0) + 1;
        return acc;
      }, {}),
      bySeverity: this.auditLogs.reduce((acc, log) => {
        acc[log.severity] = (acc[log.severity] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

// Create singleton instance
const auditLogger = new AuditLogger();

module.exports = auditLogger;