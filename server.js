// Simplified server.js for initial deployment
const express = require('express');
const cors = require('cors');
const path = require('path'); // Add path for directory resolution
const app = express();

// Debug current directory and file paths
console.log('Current directory:', __dirname);
try {
  console.log('Attempting to import User model from:', require.resolve('./models/User'));
} catch (error) {
  console.log('Error resolving User model:', error.message);
  console.log('Files in current directory:', require('fs').readdirSync(__dirname));
  
  // Check if models directory exists
  const modelsPath = path.join(__dirname, 'models');
  console.log('Models directory exists:', require('fs').existsSync(modelsPath));
  
  // If models directory exists, check its contents
  if (require('fs').existsSync(modelsPath)) {
    console.log('Files in models directory:', require('fs').readdirSync(modelsPath));
  }
}

// Enable CORS
app.use(cors({
  origin: ['https://procalender-frontend.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'Backend running',
    directory: __dirname,
    files: require('fs').readdirSync(__dirname)
  });
});

// Simple test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API is working'
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));