const express = require('express');
const cors = require('cors'); // Add this
const app = express();

// Enable CORS for all routes
app.use(cors({
  origin: [
    'https://procalender-frontend.vercel.app',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Essential middleware
app.use(cors());
app.use(express.json());

// Health check endpoint (required for Render)
app.get('/', (req, res) => {
  res.json({ 
    status: 'Backend running',
    endpoints: {
      createWindow: 'POST /api/create-window',
      createLink: 'POST /api/create-link',
      schedule: 'POST /api/schedule/:linkId'
    }
  });
});

// Your existing routes
app.post('/api/create-window', (req, res) => {/* ... */});
app.post('/api/create-link', (req, res) => {/* ... */});
app.get('/api/available-times/:linkId', (req, res) => {/* ... */});
app.post('/api/schedule/:linkId', (req, res) => {/* ... */});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
