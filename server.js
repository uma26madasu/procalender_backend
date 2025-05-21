// server.js with MongoDB native driver
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { MongoClient, ServerApiVersion } = require('mongodb');
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
  origin: ['https://procalender-frontend.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Parse JSON request bodies
app.use(express.json());

// MongoDB Connection
// MongoDB Connection - Diagnostic approach
console.log("MONGODB_URI from env (first 10 chars):", process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 10) + "..." : "undefined");
console.log("Environment variable type:", typeof process.env.MONGODB_URI);
console.log("Environment variable length:", process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0);

// Explicitly use hardcoded URI
const uri = "mongodb+srv://umamadasu:Impala%40007@cluster0.h4opqie.mongodb.net/procalender?retryWrites=true&w=majority&appName=Cluster0";
console.log("Using explicit hardcoded URI");

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Connect to MongoDB
async function connectToMongoDB() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB successfully!");
    return client.db("procalender"); // Return the database instance
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
      platform: process.platform
    }
  });
});

// Test API endpoint
app.get('/api/test', (req, res) => {
  res.json({
    message: 'API test endpoint is working',
    success: true
  });
});

// MongoDB test endpoint
app.get('/api/mongodb-test', async (req, res) => {
  try {
    const db = client.db("procalender");
    const collections = await db.listCollections().toArray();
    res.json({
      success: true,
      message: 'MongoDB connection successful',
      collections: collections.map(c => c.name)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'MongoDB connection failed',
      error: error.message
    });
  }
});

// Initialize the app after connecting to MongoDB
async function initializeApp() {
  try {
    // Connect to MongoDB first
    const db = await connectToMongoDB();
    
    // Attach db to app for use in routes
    app.locals.db = db;
    
    // Safely import route files that definitely exist
    try {
      if (fs.existsSync(path.join(routesPath, 'auth.js'))) {
        const authRoutes = require('./routes/auth');
        app.use('/api/auth', authRoutes);
        console.log('Successfully loaded auth routes');
      }
    } catch (error) {
      console.error('Error loading auth routes:', error.message);
    }

    // Check if googleCalendarRoutes.js exists before importing
    try {
      if (fs.existsSync(path.join(routesPath, 'googleCalendarRoutes.js'))) {
        const googleCalendarRoutes = require('./routes/googleCalendarRoutes');
        app.use('/api/google-calendar', googleCalendarRoutes);
        console.log('Successfully loaded Google Calendar routes');
      }
    } catch (error) {
      console.error('Error loading Google Calendar routes:', error.message);
    }

    // Placeholder routes for endpoints that aren't implemented yet
    app.get('/api/windows', (req, res) => {
      res.json({ message: 'Windows API endpoint - Coming soon' });
    });

    app.get('/api/bookings', (req, res) => {
      res.json({ message: 'Bookings API endpoint - Coming soon' });
    });

    app.get('/api/links', (req, res) => {
      res.json({ message: 'Links API endpoint - Coming soon' });
    });

    // Start the server
    const PORT = process.env.PORT || 10000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    
  } catch (error) {
    console.error("Failed to initialize app:", error);
    process.exit(1);
  }
}

// Start the application
initializeApp();

// Handle process termination
process.on('SIGINT', async () => {
  await client.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});