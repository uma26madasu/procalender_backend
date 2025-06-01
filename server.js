const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

console.log('🚀 Starting ProCalender Backend Server...');
console.log('Node version:', process.version);
console.log('Current directory:', process.cwd());
console.log('MONGODB_URI from env (first 10 chars):', process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 10) + '...' : 'Missing');

const app = express();
const PORT = process.env.PORT || 10000;

// Trust proxy (important for Render.com)
app.set('trust proxy', 1);

// Enhanced CORS configuration
console.log('🔧 Configuring CORS...');
const corsOptions = {
  origin: [
    'https://procalender-frontend-uma26madasus-projects.vercel.app',
    'https://procalender-frontend.vercel.app', 
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'https://localhost:3000',
    'https://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-CSRF-Token'
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  preflightContinue: false
};

// Apply CORS middleware FIRST
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Additional CORS headers for edge cases
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (corsOptions.origin.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin,X-CSRF-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

console.log('✅ CORS configuration applied');

// HTTPS forcing middleware (for Render.com)
app.use((req, res, next) => {
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
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  next();
});

// Parse JSON request bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// MongoDB Connection with Mongoose
console.log('🔄 Connecting to MongoDB...');

mongoose.set('strictQuery', false); // Suppress the deprecation warning

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB successfully with Mongoose!');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

connectDB();

// Handle MongoDB connection events
mongoose.connection.on('connected', () => {
  console.log('✅ Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  Mongoose disconnected');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Gracefully shutting down...');
  await mongoose.connection.close();
  process.exit(0);
});

// Basic route for health check
app.get('/', (req, res) => {
  res.json({
    message: 'ProCalender Backend API is running',
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Test routes
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/test-config', (req, res) => {
  res.json({
    success: true,
    message: 'Configuration Test Results',
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: PORT,
      hasMongoUri: !!process.env.MONGODB_URI,
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET
    },
    database: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      readyState: mongoose.connection.readyState
    },
    cors: {
      allowedOrigins: corsOptions.origin,
      methods: corsOptions.methods
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/api/mongodb-test', async (req, res) => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    res.json({
      success: true,
      message: 'MongoDB connection successful',
      collections: collections.map(col => col.name),
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

app.get('/api/debug/env', (req, res) => {
  res.json({
    success: true,
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      hasMongoUri: !!process.env.MONGODB_URI,
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      mongoDbName: process.env.MONGODB_URI ? process.env.MONGODB_URI.split('/').pop()?.split('?')[0] : 'unknown'
    },
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      platform: process.platform,
      nodeVersion: process.version
    },
    timestamp: new Date().toISOString()
  });
});

// Load routes
console.log('🔄 Loading routes...');

// Check if routes directory exists
const fs = require('fs');
const routesPath = path.join(__dirname, 'routes');
const controllersPath = path.join(__dirname, 'controllers');

if (fs.existsSync(routesPath)) {
  console.log('✅ Routes directory exists');
} else {
  console.error('❌ Routes directory not found at:', routesPath);
}

if (fs.existsSync(controllersPath)) {
  console.log('✅ Controllers directory exists');
} else {
  console.error('❌ Controllers directory not found at:', controllersPath);
}

// Load auth routes
try {
  console.log('📝 Loading auth routes...');
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  console.log('✅ Auth routes loaded successfully at /api/auth');
} catch (error) {
  console.error('❌ Failed to load auth routes:', error.message);
}

// Load Google Calendar routes  
try {
  console.log('📝 Loading Google Calendar routes...');
  const googleCalendarRoutes = require('./routes/googleCalendarRoutes');
  app.use('/api/calendar', googleCalendarRoutes);
  console.log('✅ Google Calendar routes loaded successfully at /api/calendar');
} catch (error) {
  console.error('❌ Failed to load Google Calendar routes:', error.message);
}

// Load other routes if they exist
const routeFiles = [
  { path: './routes/bookingRoutes', mount: '/api/bookings' },
  { path: './routes/approvalRoutes', mount: '/api/approvals' },
  { path: './routes/windows', mount: '/api/windows' },
  { path: './routes/linkRoutes', mount: '/api/links' }
];

routeFiles.forEach(({ path: routePath, mount }) => {
  try {
    if (fs.existsSync(path.join(__dirname, routePath + '.js'))) {
      console.log(`📝 Loading ${routePath}...`);
      const routes = require(routePath);
      app.use(mount, routes);
      console.log(`✅ ${routePath} loaded successfully at ${mount}`);
    }
  } catch (error) {
    console.log(`⚠️  Optional route ${routePath} not loaded:`, error.message);
  }
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('❌ Global error handler:', error);
  
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  // Get list of available routes
  const availableRoutes = [];
  
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Direct route
      const methods = Object.keys(middleware.route.methods);
      methods.forEach(method => {
        availableRoutes.push(`${method.toUpperCase()} ${middleware.route.path}`);
      });
    } else if (middleware.name === 'router') {
      // Router middleware
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const methods = Object.keys(handler.route.methods);
          methods.forEach(method => {
            const basePath = middleware.regexp.source
              .replace('\\/?', '')
              .replace('(?=\\/|$)', '')
              .replace(/\\\//g, '/')
              .replace('^', '');
            availableRoutes.push(`${method.toUpperCase()} ${basePath}${handler.route.path}`);
          });
        }
      });
    }
  });

  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableRoutes: availableRoutes.sort()
  });
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 Server running on port', PORT);
  console.log('🌐 API URL:', `https://procalender-backend.onrender.com`);
  console.log('📋 Test config:', `https://procalender-backend.onrender.com/api/test-config`);
  console.log('🔧 Debug env:', `https://procalender-backend.onrender.com/api/debug/env`);
  console.log('✅ ProCalender Backend is ready!');
});

// Export app for testing
module.exports = app;