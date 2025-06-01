// server.js - Clean version without helmet
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Initialize the Express app
const app = express();

// Debug information about the environment
console.log('Node version:', process.version);
console.log('Current directory:', __dirname);

// Enable CORS
app.use(cors({
  origin: [
    'https://procalender-frontend.vercel.app',
    'https://procalender-frontend-uma26madasus-projects.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'cache-control']
}));
  // 🔧 Enhanced HTTPS forcing middleware for Render.com
app.use((req, res, next) => {
  // Trust Render.com proxy headers
  app.set('trust proxy', 1);
  
  // Check if request is secure (multiple methods for Render.com)
  const isSecure = req.secure || 
                   req.headers['x-forwarded-proto'] === 'https' ||
                   req.headers['x-forwarded-ssl'] === 'on' ||
                   req.connection.encrypted;

  // Force HTTPS in production
  if (process.env.NODE_ENV === 'production' && !isSecure) {
    const httpsUrl = `https://${req.headers.host}${req.url}`;
    console.log(`🔄 Forcing HTTPS redirect: ${req.url} -> ${httpsUrl}`);
    return res.redirect(301, httpsUrl);
  }

  // Set security headers
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Forwarded-Proto', 'https');
  
  next();
});

// 🔧 Alternative OAuth Configuration - Update your authController.js
const getCorrectRedirectUri = (req) => {
  // Always use HTTPS for production
  if (process.env.NODE_ENV === 'production') {
    return 'https://procalender-backend.onrender.com/api/auth/google/callback';
  }
  
  // For development, check the actual protocol
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${protocol}://${req.headers.host}/api/auth/google/callback`;
};

// 🔧 Updated OAuth callback handler
exports.handleGoogleCallback = async (req, res) => {
  try {
    console.log('🔄 Processing Google OAuth callback...');
    console.log('🔧 Request details:');
    console.log('   Method:', req.method);
    console.log('   Protocol:', req.protocol);
    console.log('   Secure:', req.secure);
    console.log('   X-Forwarded-Proto:', req.headers['x-forwarded-proto']);
    console.log('   Host:', req.headers.host);
    console.log('   Full URL:', `${req.protocol}://${req.headers.host}${req.originalUrl}`);

    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required'
      });
    }

    // CRITICAL: Use frontend redirect URI (where Google actually redirected the user)
    const redirectUri = 'https://procalender-frontend-uma26madasus-projects.vercel.app/auth/google/callback';
    
    console.log('🔄 Exchanging code for tokens...');
    console.log('🔧 Using redirect URI for token exchange:', redirectUri);

    // Configure OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri // Use frontend redirect URI where Google actually sent the user
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log('✅ Token exchange successful');

    // Set credentials
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Save user and tokens to database
    const user = await User.findOneAndUpdate(
      { googleId: userInfo.id },
      {
        googleId: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokens.expiry_date,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    console.log('✅ User saved successfully:', user.email);

    // Return success with user data
    res.json({
      success: true,
      message: `Google Calendar connected successfully for ${user.email}`,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        picture: user.picture
      },
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date
      }
    });

  } catch (error) {
    console.error('❌ Error during token exchange:', error);
    
    // Provide specific error details
    let errorMessage = 'Authentication failed';
    let errorDetails = {};
    
    if (error.message.includes('redirect_uri_mismatch')) {
      errorMessage = 'redirect_uri_mismatch';
      errorDetails = {
        error: 'redirect_uri_mismatch',
        expectedUri: 'https://procalender-frontend-uma26madasus-projects.vercel.app/auth/google/callback',
        receivedProtocol: req.protocol,
        receivedHost: req.headers.host,
        suggestion: 'Check Google OAuth configuration'
      };
    } else if (error.message.includes('invalid_grant')) {
      errorMessage = 'invalid_grant';
      errorDetails = {
        error: 'Authorization code expired or already used',
        suggestion: 'Please try logging in again'
      };
    }

    console.error('❌ Error in Google OAuth callback:', error);
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      debug: errorDetails
    });
  }
};
// Parse JSON request bodies
app.use(express.json());

// MongoDB Connection with Mongoose
console.log("MONGODB_URI from env (first 10 chars):", process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 10) + "..." : "undefined");

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
      frontendUrl: process.env.FRONTEND_URL || '❌ Missing'
    },
    
    database: {
      mongooseState: mongoose.connection.readyState,
      mongooseStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown'
    },
    
    urlConsistency: {
      backendUrl: process.env.FRONTEND_URL,
      redirectBaseUrl: process.env.GOOGLE_REDIRECT_URI?.split('/api')[0],
      isConsistent: process.env.FRONTEND_URL === process.env.GOOGLE_REDIRECT_URI?.split('/api')[0]
    },
    
    testEndpoints: [
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
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Not set',
    NODE_ENV: process.env.NODE_ENV,
    MONGOOSE_CONNECTION: mongoose.connection.readyState,
    FRONTEND_URL: process.env.FRONTEND_URL,
    HOST: process.env.HOST || 'Not set',
    PORT: process.env.PORT || 'Not set'
  });
});

// Initialize the app after connecting to MongoDB
async function initializeApp() {
  try {
    // Connect to MongoDB first
    await connectToMongoDB();
    
    // Check for routes directory
    const routesPath = path.join(__dirname, 'routes');
    const controllersPath = path.join(__dirname, 'controllers');
    
    if (fs.existsSync(routesPath)) {
      console.log('Routes directory exists');
    } else {
      console.log('Routes directory does NOT exist');
    }
    
    if (fs.existsSync(controllersPath)) {
      console.log('Controllers directory exists');
    } else {
      console.log('Controllers directory does NOT exist');
    }
    
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
      }
    } catch (error) {
      console.error('❌ Error loading Google Calendar routes:', error.message);
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
      console.error('🔥 Global error handler:', err);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
      });
    });

    // 404 handler
    app.use('*', (req, res) => {
      console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
      res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`,
        availableRoutes: [
          'GET /',
          'GET /api/test',
          'GET /api/test-config',
          'GET /api/mongodb-test',
          'GET /api/debug/env',
          'GET /api/auth/google/url',
          'GET /api/auth/google/callback',
          'POST /api/auth/google/callback',
          'GET /api/auth/google/status',
          'POST /api/auth/google/disconnect',
          'GET /api/calendar/events',
          'GET /api/calendar/calendars',
          'POST /api/calendar/check-conflicts'
        ]
      });
    });

    // Start the server
    const PORT = process.env.PORT || 10000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 API URL: https://procalender-backend.onrender.com`);
      console.log(`📋 Test config: https://procalender-backend.onrender.com/api/test-config`);
      console.log(`🔧 Debug env: https://procalender-backend.onrender.com/api/debug/env`);
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