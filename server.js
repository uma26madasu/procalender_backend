// Simplified server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Initialize the Express app
const app = express();

// Debug information about the environment
console.log('Node version:', process.version);
console.log('Current directory:', __dirname);
console.log('Files in current directory:', fs.readdirSync(__dirname));

// Check if models directory exists and log its contents
const modelsPath = path.join(__dirname, 'models');
if (fs.existsSync(modelsPath)) {
  console.log('Models directory exists. Contents:', fs.readdirSync(modelsPath));
} else {
  console.log('Models directory does NOT exist');
}

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

// Start the server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Add to server.js
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Import and use routes
const authRoutes = require('./routes/auth');
const linkRoutes = require('./routes/links');
const windowRoutes = require('./routes/windows');
const bookingRoutes = require('./routes/bookings');

app.use('/api/auth', authRoutes);
app.use('/api/links', linkRoutes);
app.use('/api/windows', windowRoutes);
app.use('/api/bookings', bookingRoutes);