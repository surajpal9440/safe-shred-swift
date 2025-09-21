// backend/server.js
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs').promises;
const rateLimit = require('express-rate-limit');

// Import routes
const licenseRoutes = require('./routes/license');
const driveRoutes = require('./routes/drives');
const eraseRoutes = require('./routes/erase');
const auditRoutes = require('./routes/audit');

// Import services
const { validateLicenseStatus } = require('./services/licenseValidator');
const { ensureAppDirectories } = require('./utils/paths');
const auditLogger = require('./services/auditLogger');

class BackendServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.wss = null;
    this.port = 3001;
  }

  async initialize() {
    try {
      // Ensure app directories exist
      await ensureAppDirectories();
      
      // Initialize audit logger
      await auditLogger.initialize();

      // Configure middleware
      this.configureMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup WebSocket
      this.setupWebSocket();
      
      // Setup error handling
      this.setupErrorHandling();

      console.log('Backend server initialized successfully');
    } catch (error) {
      console.error('Failed to initialize backend server:', error);
      throw error;
    }
  }

  configureMiddleware() {
    // Enable CORS for frontend
    this.app.use(cors({
      origin: ['http://localhost:8080', 'http://localhost:5173'],
      credentials: true
    }));

    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));
    
    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.'
    });
    this.app.use('/api/', limiter);

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });

    // Security headers
    this.app.use((req, res, next) => {
      res.header('X-Content-Type-Options', 'nosniff');
      res.header('X-Frame-Options', 'DENY');
      res.header('X-XSS-Protection', '1; mode=block');
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // License routes (no auth required for initial setup)
    this.app.use('/api/license', licenseRoutes);

    // Protected routes (require valid license)
    this.app.use('/api/drives', this.requireValidLicense, driveRoutes);
    this.app.use('/api/erase', this.requireValidLicense, eraseRoutes);
    this.app.use('/api/audit', this.requireValidLicense, auditRoutes);

    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      const distPath = path.join(__dirname, '../dist');
      this.app.use(express.static(distPath));
      
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  async requireValidLicense(req, res, next) {
    try {
      const validation = await validateLicenseStatus();
      
      if (!validation.isValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired license',
          details: validation.error
        });
      }

      // Add license info to request for logging
      req.licenseInfo = validation.license;
      next();
    } catch (error) {
      console.error('License validation error:', error);
      res.status(500).json({
        success: false,
        error: 'License validation failed'
      });
    }
  }

  setupWebSocket() {
    this.wss = new WebSocket.Server({ 
      server: this.server,
      path: '/ws'
    });

    this.wss.on('connection', (ws, req) => {
      console.log('WebSocket client connected from:', req.socket.remoteAddress);
      
      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to ShredSafe backend',
        timestamp: new Date().toISOString()
      }));

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          console.log('WebSocket message received:', data);
          
          // Handle different message types
          switch (data.type) {
            case 'ping':
              ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
              break;
            case 'subscribe':
              // Subscribe to specific events (erase progress, etc.)
              ws.subscriptions = ws.subscriptions || new Set();
              ws.subscriptions.add(data.channel);
              break;
            case 'unsubscribe':
              if (ws.subscriptions) {
                ws.subscriptions.delete(data.channel);
              }
              break;
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });

    // Broadcast method for sending updates to all connected clients
    this.broadcast = (data, channel = null) => {
      this.wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          // Only send if client is subscribed to this channel (or no channel filter)
          if (!channel || (client.subscriptions && client.subscriptions.has(channel))) {
            client.send(JSON.stringify(data));
          }
        }
      });
    };

    console.log('WebSocket server initialized');
  }

  setupErrorHandling() {
    // Handle 404
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      });
    });

    // Handle errors
    this.app.use((error, req, res, next) => {
      console.error('Server error:', error);
      
      res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Internal server error'
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });
  }

  async start() {
    try {
      await this.initialize();
      
      return new Promise((resolve, reject) => {
        this.server = http.createServer(this.app);
        
        this.server.listen(this.port, '127.0.0.1', () => {
          console.log(`ShredSafe backend server running on http://127.0.0.1:${this.port}`);
          resolve(this.server);
        });

        this.server.on('error', (error) => {
          if (error.code === 'EADDRINUSE') {
            console.error(`Port ${this.port} is already in use`);
          } else {
            console.error('Server error:', error);
          }
          reject(error);
        });

        // Initialize WebSocket after server starts
        this.setupWebSocket();
      });
    } catch (error) {
      console.error('Failed to start backend server:', error);
      throw error;
    }
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          console.log('WebSocket server stopped');
        });
      }

      if (this.server) {
        this.server.close(() => {
          console.log('Backend server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // Method to get broadcast function for use in other modules
  getBroadcast() {
    return this.broadcast;
  }
}

// Create singleton instance
const serverInstance = new BackendServer();

// Export functions for Electron main process
const startServer = async () => {
  return await serverInstance.start();
};

const stopServer = async () => {
  return await serverInstance.stop();
};

const getBroadcast = () => {
  return serverInstance.getBroadcast();
};

module.exports = {
  startServer,
  stopServer,
  getBroadcast,
  BackendServer
};