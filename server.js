// server.js - Fixed version with Mongoose
const express = require('express');
const mongoose = require('mongoose'); // Use Mongoose instead of native MongoDB
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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

// Enable CORS
app.use(cors({
  origin: [
    'https://procalender-frontend.vercel.app',
    'https://procalender-frontend-uma26madasus-projects.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'  // Add Vite dev server
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON request bodies
app.use(express.json());

// MongoDB Connection with Mongoose
console.log("MONGODB_URI from env (first 10 chars):", process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 10) + "..." : "undefined");

// Use environment variable or fallback to hardcoded URI
const mongoUri = process.env.MONGODB_URI || "mongodb+srv://umamadasu:Impala%40007@cluster0.h4opqie.mongodb.net/procalender?retryWrites=true&w=majority&appName=Cluster0";

// Connect to MongoDB using Mongoose
async function connectToMongoDB() {
  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to MongoDB successfully with Mongoose!");
    return mongoose.connection.db;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'Success',
    message: 'ProCalender Backend API is running',
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      mongooseConnection: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
    }
  });
});

// Test API endpoint
app.get('/api/test', (req, res) => {
  res.json({
    message: 'API test endpoint is working',
    success: true,
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// MongoDB test endpoint (updated for Mongoose)
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
    
    testEndpoints: [
      'GET /api/test-config - This endpoint',
      'GET /api/auth/google/url - Get OAuth URL',
      'GET /api/auth/google/callback - OAuth callback',
      'GET /api/auth/google/status - Check connection status'
    ],
    
    nextSteps: [
      '1. Fix any ❌ Missing items above',
      '2. Test /api/auth/google/url endpoint',
      '3. Complete OAuth flow in browser',
      '4. Check Google Calendar connection'
    ]
  };
  
  res.json({
    success: true,
    message: 'Configuration Test Results',
    ...configCheck
  });
});

// Initialize the app after connecting to MongoDB
async function initializeApp() {
  try {
    // Connect to MongoDB first
    await connectToMongoDB();
    
    // Load auth routes
    try {
      if (fs.existsSync(path.join(routesPath, 'auth.js'))) {
        const authRoutes = require('./routes/auth');
        app.use('/api/auth', authRoutes);
        console.log('✅ Successfully loaded auth routes');
      } else {
        console.log('❌ Auth routes file not found');
      }
    } catch (error) {
      console.error('❌ Error loading auth routes:', error.message);
    }

    // Load Google Calendar routes
    try {
      if (fs.existsSync(path.join(routesPath, 'googleCalendarRoutes.js'))) {
        const googleCalendarRoutes = require('./routes/googleCalendarRoutes');
        app.use('/api/google-calendar', googleCalendarRoutes);
        console.log('✅ Successfully loaded Google Calendar routes');
      } else {
        console.log('❌ Google Calendar routes file not found');
      }
    } catch (error) {
      console.error('❌ Error loading Google Calendar routes:', error.message);
    }

    // Load other routes
    try {
      if (fs.existsSync(path.join(routesPath, 'windows.js'))) {
        const windowRoutes = require('./routes/windows');
        app.use('/api/windows', windowRoutes);
        console.log('✅ Successfully loaded window routes');
      } else {
        // Placeholder route for windows
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

    // Placeholder routes for other endpoints
    app.get('/api/bookings', (req, res) => {
      res.json({ message: 'Bookings API endpoint - Coming soon' });
    });

    app.get('/api/links', (req, res) => {
      res.json({ message: 'Links API endpoint - Coming soon' });
    });

    // Global error handler
    app.use((err, req, res, next) => {
      console.error('Global error handler:', err);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
      });
    });

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`,
        availableRoutes: [
          'GET /',
          'GET /api/test',
          'GET /api/test-config',
          'GET /api/mongodb-test',
          'GET /api/auth/google/url',
          'GET /api/auth/google/callback',
          'GET /api/auth/google/status',
          'POST /api/auth/google/revoke'
        ]
      });
    });

    // Start the server
    const PORT = process.env.PORT || 10000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 API URL: http://localhost:${PORT}`);
      console.log(`📋 Test config: http://localhost:${PORT}/api/test-config`);
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