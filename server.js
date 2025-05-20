// Safe server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
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

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Safely import route files that definitely exist
// Check if auth.js exists before importing
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