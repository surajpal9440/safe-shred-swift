// backend/services/eraseService.js
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const auditLogger = require('./auditLogger');
const { getBroadcast } = require('../server');

class EraseService {
  constructor() {
    this.activeJobs = new Map();
    this.jobHistory = [];
    this.scriptsPath = path.join(__dirname, '../../scripts');
    this.systemDrives = ['C:', 'D:']; // Protected system drives
  }

  async startEraseJob(request) {
    try {
      // Validate request
      const validation = this.validateEraseRequest(request);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      // Generate unique job ID
      const jobId = this.generateJobId();
      
      // Create job object
      const job = {
        id: jobId,
        deviceId: request.deviceId,
        driveLetter: request.driveLetter,
        confirmation: request.confirmation,
        deviceType: request.deviceType || 'usb',
        startTime: new Date().toISOString(),
        status: 'initializing',
        progress: 0,
        logs: [],
        customer: request.customer || 'Unknown'
      };

      // Add to active jobs
      this.activeJobs.set(jobId, job);

      // Log start of job
      await auditLogger.logEraseStart(job);

      // Start the actual erase process
      this.executeEraseProcess(job);

      return {
        success: true,
        jobId: jobId,
        message: 'Erase job started successfully'
      };

    } catch (error) {
      console.error('Failed to start erase job:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  validateEraseRequest(request) {
    // Check required fields
    if (!request.deviceId || !request.driveLetter || !request.confirmation) {
      return {
        isValid: false,
        error: 'Missing required fields: deviceId, driveLetter, confirmation'
      };
    }

    // Validate drive letter format
    if (!/^[A-Z]:$/.test(request.driveLetter.toUpperCase())) {
      return {
        isValid: false,
        error: 'Invalid drive letter format. Expected format: C:'
      };
    }

    // Safety check - prevent system drive erase
    if (this.systemDrives.includes(request.driveLetter.toUpperCase())) {
      return {
        isValid: false,
        error: 'Erasing system drives is not allowed for safety reasons'
      };
    }

    // Validate confirmation
    const expectedConfirmation = `${request.driveLetter.toUpperCase()} YES`;
    if (request.confirmation !== expectedConfirmation) {
      return {
        isValid: false,
        error: `Confirmation must be exactly: "${expectedConfirmation}"`
      };
    }

    return { isValid: true };
  }

  async executeEraseProcess(job) {
    try {
      this.updateJobStatus(job.id, 'running', 'Starting erase process...');

      if (job.deviceType === 'android') {
        await this.eraseAndroidDevice(job);
      } else {
        await this.eraseUsbDrive(job);
      }

    } catch (error) {
      console.error(`Erase job ${job.id} failed:`, error);
      this.updateJobStatus(job.id, 'failed', `Error: ${error.message}`);
      await auditLogger.logEraseComplete(job.id, 'failed', error.message);
    }
  }

  async eraseUsbDrive(job) {
    return new Promise((resolve, reject) => {
      // Path to your existing batch file
      const batchFile = path.join(this.scriptsPath, 'usb.bat');
      
      this.addJobLog(job.id, `Executing: ${batchFile}`);
      this.updateJobStatus(job.id, 'running', 'Launching erase script...', 10);

      // Spawn the batch file with elevated privileges
      const eraseProcess = spawn('cmd', ['/c', batchFile], {
        cwd: this.scriptsPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          DRIVE_LETTER: job.driveLetter.replace(':', '') // Pass drive letter as environment variable
        }
      });

      // Handle process output
      eraseProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          this.addJobLog(job.id, `STDOUT: ${output}`);
          this.parseProgressFromOutput(job.id, output);
        }
      });

      eraseProcess.stderr.on('data', (data) => {
        const error = data.toString().trim();
        if (error) {
          this.addJobLog(job.id, `STDERR: ${error}`);
        }
      });

      eraseProcess.on('close', async (code) => {
        const job = this.activeJobs.get(job.id);
        if (!job) return;

        if (code === 0) {
          this.updateJobStatus(job.id, 'completed', 'Erase completed successfully', 100);
          await auditLogger.logEraseComplete(job.id, 'success', 'USB drive erased successfully');
          this.addJobLog(job.id, 'Erase process completed successfully');
          resolve();
        } else {
          this.updateJobStatus(job.id, 'failed', `Erase failed with exit code ${code}`);
          await auditLogger.logEraseComplete(job.id, 'failed', `Process exited with code ${code}`);
          reject(new Error(`Erase process failed with exit code ${code}`));
        }

        // Move to history after completion
        setTimeout(() => {
          this.moveJobToHistory(job.id);
        }, 30000); // Keep in active for 30 seconds after completion
      });

      eraseProcess.on('error', async (error) => {
        console.error('Erase process error:', error);
        this.updateJobStatus(job.id, 'failed', `Process error: ${error.message}`);
        await auditLogger.logEraseComplete(job.id, 'failed', error.message);
        reject(error);
      });

      // Send drive letter to the process stdin if it expects interactive input
      if (eraseProcess.stdin && !eraseProcess.stdin.destroyed) {
        eraseProcess.stdin.write(`${job.driveLetter.replace(':', '')}\n`);
        eraseProcess.stdin.write('YES\n');
        eraseProcess.stdin.end();
      }
    });
  }

  async eraseAndroidDevice(job) {
    return new Promise((resolve, reject) => {
      this.addJobLog(job.id, 'Starting Android device erase via ADB...');
      this.updateJobStatus(job.id, 'running', 'Connecting to Android device...', 20);

      // Execute ADB commands to wipe Android device
      const adbCommands = [
        `adb -s ${job.deviceId} shell su -c "rm -rf /data/*"`,
        `adb -s ${job.deviceId} shell su -c "rm -rf /sdcard/*"`,
        `adb -s ${job.deviceId} reboot recovery`
      ];

      this.executeAdbCommands(job.id, adbCommands, 0)
        .then(() => {
          this.updateJobStatus(job.id, 'completed', 'Android device erase completed', 100);
          resolve();
        })
        .catch((error) => {
          this.updateJobStatus(job.id, 'failed', `Android erase failed: ${error.message}`);
          reject(error);
        });
    });
  }

  async executeAdbCommands(jobId, commands, index) {
    if (index >= commands.length) {
      return Promise.resolve();
    }

    const command = commands[index];
    this.addJobLog(jobId, `Executing: ${command}`);

    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          this.addJobLog(jobId, `Command failed: ${error.message}`);
          reject(error);
          return;
        }

        if (stdout) {
          this.addJobLog(jobId, `Output: ${stdout}`);
        }
        if (stderr) {
          this.addJobLog(jobId, `Warning: ${stderr}`);
        }

        // Update progress
        const progress = Math.round(((index + 1) / commands.length) * 80) + 20;
        this.updateJobStatus(jobId, 'running', `Completed command ${index + 1}/${commands.length}`, progress);

        // Execute next command
        this.executeAdbCommands(jobId, commands, index + 1)
          .then(resolve)
          .catch(reject);
      });
    });
  }

  parseProgressFromOutput(jobId, output) {
    // Parse progress from your usb.ps1 output
    // Look for common progress indicators
    if (output.includes('Erasing drive')) {
      this.updateJobProgress(jobId, 30);
    } else if (output.includes('Wiping free space')) {
      this.updateJobProgress(jobId, 60);
    } else if (output.includes('cipher.exe')) {
      this.updateJobProgress(jobId, 80);
    } else if (output.includes('Erase complete')) {
      this.updateJobProgress(jobId, 95);
    }
  }

  updateJobStatus(jobId, status, message = null, progress = null) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.status = status;
    job.lastUpdate = new Date().toISOString();
    
    if (message) {
      job.statusMessage = message;
      this.addJobLog(jobId, message);
    }
    
    if (progress !== null) {
      job.progress = Math.min(100, Math.max(0, progress));
    }

    // Broadcast status update via WebSocket
    const broadcast = getBroadcast();
    if (broadcast) {
      broadcast({
        type: 'erase_status_update',
        jobId: jobId,
        status: status,
        progress: job.progress,
        message: message,
        timestamp: job.lastUpdate
      }, 'erase');
    }

    console.log(`Job ${jobId}: ${status} - ${message} (${job.progress}%)`);
  }

  updateJobProgress(jobId, progress) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    // Only update if progress increased
    if (progress > job.progress) {
      job.progress = progress;
      job.lastUpdate = new Date().toISOString();

      const broadcast = getBroadcast();
      if (broadcast) {
        broadcast({
          type: 'erase_progress',
          jobId: jobId,
          progress: progress,
          timestamp: job.lastUpdate
        }, 'erase');
      }
    }
  }

  addJobLog(jobId, message) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      message: message
    };

    job.logs.push(logEntry);

    // Limit log size to prevent memory issues
    if (job.logs.length > 1000) {
      job.logs = job.logs.slice(-500);
    }

    // Broadcast log update
    const broadcast = getBroadcast();
    if (broadcast) {
      broadcast({
        type: 'erase_log',
        jobId: jobId,
        log: logEntry
      }, 'erase');
    }
  }

  getJobStatus(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      // Check history
      const historyJob = this.jobHistory.find(h => h.id === jobId);
      if (historyJob) {
        return {
          found: true,
          job: historyJob,
          inHistory: true
        };
      }
      return {
        found: false,
        error: 'Job not found'
      };
    }

    return {
      found: true,
      job: {
        id: job.id,
        deviceId: job.deviceId,
        driveLetter: job.driveLetter,
        deviceType: job.deviceType,
        status: job.status,
        progress: job.progress,
        statusMessage: job.statusMessage,
        startTime: job.startTime,
        lastUpdate: job.lastUpdate,
        logs: job.logs.slice(-50) // Return last 50 log entries
      }
    };
  }

  cancelEraseJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      return {
        success: false,
        error: 'Job not found or already completed'
      };
    }

    if (job.status === 'completed' || job.status === 'failed') {
      return {
        success: false,
        error: 'Job already completed, cannot cancel'
      };
    }

    try {
      // Kill the process if it exists
      if (job.process && !job.process.killed) {
        job.process.kill('SIGTERM');
        setTimeout(() => {
          if (!job.process.killed) {
            job.process.kill('SIGKILL');
          }
        }, 5000);
      }

      this.updateJobStatus(jobId, 'cancelled', 'Job cancelled by user');
      auditLogger.logEraseComplete(jobId, 'cancelled', 'Cancelled by user');

      return {
        success: true,
        message: 'Job cancelled successfully'
      };
    } catch (error) {
      console.error('Error cancelling job:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  moveJobToHistory(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    // Add completion time
    job.completedAt = new Date().toISOString();
    
    // Move to history
    this.jobHistory.unshift(job);
    this.activeJobs.delete(jobId);

    // Limit history size
    if (this.jobHistory.length > 100) {
      this.jobHistory = this.jobHistory.slice(0, 50);
    }

    console.log(`Job ${jobId} moved to history`);
  }

  generateJobId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `erase_${timestamp}_${random}`;
  }

  getActiveJobs() {
    return Array.from(this.activeJobs.values()).map(job => ({
      id: job.id,
      deviceId: job.deviceId,
      driveLetter: job.driveLetter,
      status: job.status,
      progress: job.progress,
      startTime: job.startTime,
      customer: job.customer
    }));
  }

  getJobHistory(limit = 20) {
    return this.jobHistory.slice(0, limit).map(job => ({
      id: job.id,
      deviceId: job.deviceId,
      driveLetter: job.driveLetter,
      status: job.status,
      startTime: job.startTime,
      completedAt: job.completedAt,
      customer: job.customer
    }));
  }

  // Safety check before starting any erase operation
  async performSafetyCheck(request) {
    const checks = [];

    // Check if drive exists and is accessible
    try {
      const stats = await fs.stat(request.driveLetter + '\\');
      checks.push({ check: 'drive_exists', passed: true });
    } catch (error) {
      checks.push({ 
        check: 'drive_exists', 
        passed: false, 
        error: 'Drive not accessible or does not exist' 
      });
    }

    // Check system drive protection
    const isSystemDrive = this.systemDrives.includes(request.driveLetter.toUpperCase());
    checks.push({
      check: 'system_drive_protection',
      passed: !isSystemDrive,
      error: isSystemDrive ? 'System drive protection active' : null
    });

    // Check confirmation format
    const expectedConfirmation = `${request.driveLetter.toUpperCase()} YES`;
    const confirmationValid = request.confirmation === expectedConfirmation;
    checks.push({
      check: 'confirmation_format',
      passed: confirmationValid,
      error: confirmationValid ? null : `Expected: "${expectedConfirmation}"`
    });

    const allPassed = checks.every(check => check.passed);
    
    return {
      allPassed,
      checks,
      summary: allPassed ? 'All safety checks passed' : 'Some safety checks failed'
    };
  }

  // Get statistics for reporting
  getStatistics() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const allJobs = [...this.activeJobs.values(), ...this.jobHistory];
    
    return {
      total: {
        jobs: allJobs.length,
        successful: allJobs.filter(j => j.status === 'completed').length,
        failed: allJobs.filter(j => j.status === 'failed').length,
        cancelled: allJobs.filter(j => j.status === 'cancelled').length
      },
      today: {
        jobs: allJobs.filter(j => new Date(j.startTime) >= todayStart).length,
        successful: allJobs.filter(j => 
          j.status === 'completed' && new Date(j.startTime) >= todayStart
        ).length
      },
      active: {
        running: Array.from(this.activeJobs.values()).filter(j => 
          j.status === 'running' || j.status === 'initializing'
        ).length,
        total: this.activeJobs.size
      }
    };
  }
}

// Create singleton instance
const eraseService = new EraseService();

module.exports = {
  eraseService,
  startEraseJob: (request) => eraseService.startEraseJob(request),
  getJobStatus: (jobId) => eraseService.getJobStatus(jobId),
  cancelEraseJob: (jobId) => eraseService.cancelEraseJob(jobId),
  getActiveJobs: () => eraseService.getActiveJobs(),
  getJobHistory: (limit) => eraseService.getJobHistory(limit),
  performSafetyCheck: (request) => eraseService.performSafetyCheck(request),
  getStatistics: () => eraseService.getStatistics()
};