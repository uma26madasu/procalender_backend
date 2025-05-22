// /routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Generate OAuth URL for Google sign-in
router.get('/google/url', authController.getGoogleAuthUrl);

// Handle OAuth callback from Google
router.get('/google/callback', authController.handleGoogleCallback);

// Revoke Google access
router.post('/google/revoke', authController.revokeGoogleAccess);
// Add this line to your routes/auth.js
router.get('/google/status', authController.getConnectionStatus);

module.exports = router;