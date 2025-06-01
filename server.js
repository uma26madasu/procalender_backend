// server.js - Enhanced Production-Ready Version
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Initialize the Express app
const app = express();

// Debug information about the environment
console.log('Node version:', process.version);
console.log('Current directory:', __dirname);
console.log('Files in current directory:', fs.readdirSync(__dirname));

// Check directories and log contents
const dirLog = (dirPath, dirName) => {
  if (fs.existsSync(dirPath)) {
    console.log(`${dirName} directory exists. Contents:`, fs.readdirSync(dirPath));
    return true;
  } else {
    console.log(`${dirName} directory does NOT exist`);
    return false;
  }
};

// Log directory contents
const modelsPath = path.join(__dirname, 'models');
dirLog(modelsPath, 'Models');

const routesPath = path.join(__dirname, 'routes');
dirLog(routesPath, 'Routes');

const controllersPath = path.join(__dirname, 'controllers');
dirLog(controllersPath, 'Controllers');

const middlewarePath = path.join(__dirname, 'middleware');
dirLog(middlewarePath, 'Middleware');

// Security Middleware
app.use(helmet());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});
app.use(limiter);

// Enable CORS
const corsOptions = {
  origin: [
    'https://procalender-frontend.vercel.app',
    'https://procalender-frontend-uma26madasus-projects.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'cache-control']
};
app.use(cors(corsOptions));

// Parse JSON request bodies
app.use(express.json());

// MongoDB Connection with Mongoose
console.log("MONGODB_URI from env (first 10 chars):", process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 10) + "..." : "undefined");

// Use environment variable or fallback to hardcoded URI
const mongoUri = process.env.MONGODB_URI || "mongodb+srv://umamadasu:Impala%40007@cluster0.h4opqie.mongodb.net/procalender?retryWrites=true&w=majority&appName=Cluster0";

// Connect to MongoDB with retry logic
async function connectToMongoDB() {
  const maxRetries = 5;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        retryWrites: true,
        retryReads: true
      });
      console.log("✅ Connected to MongoDB successfully with Mongoose!");
      return mongoose.connection.db;
    } catch (error) {
      retries++;
      console.error(`❌ MongoDB connection attempt ${retries} failed:`, error.message);
      if (retries >= maxRetries) throw error;
      await new Promise(res => setTimeout(res, 5000)); // wait 5 seconds
    }
  }
}

// Check required environment variables
function checkRequiredEnvVars() {
  const requiredVars = [
    'MONGODB_URI',
    'JWT_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI'
  ];
  
  const missingVars = requiredVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars);
    process.exit(1);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  const status = {
    status: 'UP',
    db: mongoose.connection.readyState === 1 ? 'UP' : 'DOWN',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || 'unknown'
  };
  
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json(status);
  }
  
  res.json(status);
});

// Test API endpoint
app.get('/api/test', (req, res) => {
  res.json({
    message: 'API test endpoint is working',
    success: true,
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// MongoDB test endpoint
app.get('/api/mongodb-test', async (req, res) => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    res.json({
      success: true,
      message: 'MongoDB connection successful',
      collections: collections.map(c => c.name),
      connectionState: mongoose.connection.readyState
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'MongoDB connection failed',
      error: error.message
    });
  }
});

// Configuration test endpoint
app.get('/api/test-config', (req, res) => {
  const configCheck = {
    environment: {
      port: process.env.PORT || 'Not set',
      nodeEnv: process.env.NODE_ENV || 'Not set',
      mongoUri: process.env.MONGODB_URI ? '✅ Set' : '❌ Missing',
      jwtSecret: process.env.JWT_SECRET && process.env.JWT_SECRET !== 'your_jwt_secret_key_here' ? '✅ Set' : '❌ Missing or placeholder',
      googleClientId: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'your_google_client_id_here' ? '✅ Set' : '❌ Missing or placeholder',
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CLIENT_SECRET !== 'your_google_client_secret_here' ? '✅ Set' : '❌ Missing or placeholder',
      googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || '❌ Missing',
      emailUser: process.env.EMAIL_USER && process.env.EMAIL_USER !== 'your_gmail_address@gmail.com' ? '✅ Set' : '❌ Missing or placeholder',
      emailPass: process.env.EMAIL_PASS && process.env.EMAIL_PASS !== 'your_app_password_here' ? '✅ Set' : '❌ Missing or placeholder',
      apiUrl: process.env.VITE_API_URL || '❌ Missing'
    },
    
    database: {
      mongooseState: mongoose.connection.readyState,
      mongooseStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown'
    },
    
    urlConsistency: {
      backendUrl: process.env.VITE_API_URL,
      redirectBaseUrl: process.env.GOOGLE_REDIRECT_URI?.split('/api')[0],
      isConsistent: process.env.VITE_API_URL === process.env.GOOGLE_REDIRECT_URI?.split('/api')[0]
    },
    
    security: {
      helmet: '✅ Enabled',
      rateLimiting: '✅ Enabled (100 requests/15min)',
      cors: '✅ Enabled for specified origins'
    },
    
    testEndpoints: [
      'GET /health - Service health check',
      'GET /api/test-config - This endpoint',
      'GET /api/auth/google/url - Get OAuth URL',
      'GET /api/auth/google/callback - OAuth callback',
      'GET /api/auth/google/status - Check connection status'
    ]
  };
  
  res.json({
    success: true,
    message: 'Configuration Test Results',
    ...configCheck
  });
});

// Debug endpoint
app.get('/api/debug/env', (req, res) => {
  res.json({
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set',
    NODE_ENV: process.env.NODE_ENV,
    MONGOOSE_CONNECTION: mongoose.connection.readyState,
    AVAILABLE_COLLECTIONS: mongoose.connection.readyState === 1 ? 'Connected - check /api/mongodb-test' : 'Not connected'
  });
});

// Initialize the app after connecting to MongoDB
async function initializeApp() {
  try {
    // Check required environment variables
    checkRequiredEnvVars();
    
    // Connect to MongoDB first
    await connectToMongoDB();
    
    // Load auth routes
    try {
      console.log('📝 Loading auth routes...');
      if (fs.existsSync(path.join(routesPath, 'auth.js'))) {
        const authRoutes = require('./routes/auth');
        app.use('/api/auth', authRoutes);
        console.log('✅ Auth routes loaded successfully at /api/auth');
      } else {
        console.log('❌ Auth routes file not found');
        // Create basic auth endpoints as fallback
        app.get('/api/auth/google/url', (req, res) => {
          res.status(500).json({ success: false, message: 'Auth routes not configured' });
        });
      }
    } catch (error) {
      console.error('❌ Error loading auth routes:', error.message);
      console.error('❌ Stack:', error.stack);
    }

    // Load Google Calendar routes
    try {
      console.log('📝 Loading Google Calendar routes...');
      if (fs.existsSync(path.join(routesPath, 'googleCalendarRoutes.js'))) {
        const googleCalendarRoutes = require('./routes/googleCalendarRoutes');
        app.use('/api/calendar', googleCalendarRoutes);
        console.log('✅ Google Calendar routes loaded successfully at /api/calendar');
      } else {
        console.log('❌ Google Calendar routes file not found');
        // Create basic calendar endpoints as fallback
        app.get('/api/calendar/events', (req, res) => {
          res.status(500).json({ success: false, message: 'Calendar routes not configured' });
        });
      }
    } catch (error) {
      console.error('❌ Error loading Google Calendar routes:', error.message);
      console.error('❌ Stack:', error.stack);
    }

    // Load other routes
    try {
      console.log('📝 Loading window routes...');
      if (fs.existsSync(path.join(routesPath, 'windows.js'))) {
        const windowRoutes = require('./routes/windows');
        app.use('/api/windows', windowRoutes);
        console.log('✅ Window routes loaded successfully');
      } else {
        app.get('/api/windows', (req, res) => {
          res.json({ message: 'Windows API endpoint - Coming soon' });
        });
      }
    } catch (error) {
      console.error('❌ Error loading window routes:', error.message);
      app.get('/api/windows', (req, res) => {
        res.json({ message: 'Windows API endpoint - Error loading routes' });
      });
    }

    // Load bookings routes if exists
    try {
      if (fs.existsSync(path.join(routesPath, 'bookings.js'))) {
        const bookingsRoutes = require('./routes/bookings');
        app.use('/api/bookings', bookingsRoutes);
        console.log('✅ Bookings routes loaded successfully');
      } else {
        app.get('/api/bookings', (req, res) => {
          res.json({ message: 'Bookings API endpoint - Coming soon' });
        });
      }
    } catch (error) {
      console.error('❌ Error loading bookings routes:', error);
    }

    // Load links routes if exists
    try {
      if (fs.existsSync(path.join(routesPath, 'links.js'))) {
        const linksRoutes = require('./routes/links');
        app.use('/api/links', linksRoutes);
        console.log('✅ Links routes loaded successfully');
      } else {
        app.get('/api/links', (req, res) => {
          res.json({ message: 'Links API endpoint - Coming soon' });
        });
      }
    } catch (error) {
      console.error('❌ Error loading links routes:', error);
    }

    // Debugging endpoints
    app.get('/api/debug/routes', (req, res) => {
      const routes = [];
      
      app._router.stack.forEach((middleware) => {
        if (middleware.route) {
          routes.push({
            path: middleware.route.path,
            methods: Object.keys(middleware.route.methods)
          });
        } else if (middleware.name === 'router') {
          middleware.handle.stack.forEach((handler) => {
            if (handler.route) {
              routes.push({
                path: middleware.regexp.source.replace('\\/?(?=\\/|$)', '') + handler.route.path,
                methods: Object.keys(handler.route.methods)
              });
            }
          });
        }
      });
      
      res.json({
        success: true,
        message: 'Available routes',
        routes: routes,
        environment: {
          GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Missing',
          GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'Missing',
          FRONTEND_URL: process.env.FRONTEND_URL || 'Missing'
        }
      });
    });

    // Global error handler
    app.use((err, req, res, next) => {
      console.error('🔥 Global error handler:', err);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? {
          message: err.message,
          stack: err.stack
        } : 'Something went wrong'
      });
    });

    // Enhanced 404 handler with better route listing
    app.use('*', (req, res) => {
      console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
      res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`,
        availableRoutes: [
          'GET /health',
          'GET /api/test',
          'GET /api/test-config',
          'GET /api/mongodb-test',
          'GET /api/debug/routes',
          'GET /api/debug/env',
          'GET /api/auth/google/url',
          'GET /api/auth/google/callback',
          'POST /api/auth/google/callback',
          'GET /api/auth/google/status',
          'POST /api/auth/google/disconnect',
          'GET /api/calendar/events',
          'GET /api/calendar/calendars',
          'POST /api/calendar/check-conflicts',
          'GET /api/windows',
          'GET /api/bookings',
          'GET /api/links'
        ],
        hint: 'Visit /api/debug/routes for a complete list of available routes'
      });
    });

    // Start the server
    const PORT = process.env.PORT || 10000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 API URL: https://procalender-backend.onrender.com`);
      console.log(`🏥 Health check: https://procalender-backend.onrender.com/health`);
      console.log(`📋 Test config: https://procalender-backend.onrender.com/api/test-config`);
      console.log(`🔧 Debug routes: https://procalender-backend.onrender.com/api/debug/routes`);
      console.log(`🔑 OAuth URL: https://procalender-backend.onrender.com/api/auth/google/url`);
    });
    
  } catch (error) {
    console.error("❌ Failed to initialize app:", error);
    process.exit(1);
  }
}

// Start the application
initializeApp();

// Handle process termination gracefully
process.on('SIGINT', async () => {
  console.log('\n🔄 Gracefully shutting down...');
  await mongoose.connection.close();
  console.log('📦 MongoDB connection closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 SIGTERM received, shutting down...');
  await mongoose.connection.close();
  console.log('📦 MongoDB connection closed');
  process.exit(0);
});