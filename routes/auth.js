const express = require('express');
const router = express.Router();

console.log('📝 Loading auth routes...');

// Import controller
const authController = require('../controllers/authController');

console.log('✅ Auth controller imported');

// Define routes
router.get('/google/url', authController.getGoogleOAuthUrl);
router.get('/google/callback', authController.handleGoogleCallback);
router.post('/google/callback', authController.handleGoogleCallback);
router.get('/google/status', authController.checkGoogleOAuthStatus);
router.post('/google/disconnect', authController.disconnectGoogleOAuth);

// Debug route
router.get('/debug', (req, res) => {
  res.json({
    success: true,
    message: 'Auth routes are working',
    availableEndpoints: [
      'GET /api/auth/google/url',
      'GET /api/auth/google/callback',
      'POST /api/auth/google/callback',
      'GET /api/auth/google/status?email=user@email.com',
      'POST /api/auth/google/disconnect'
    ],
    timestamp: new Date().toISOString()
  });
});

console.log('✅ Auth routes configured successfully');

module.exports = router;