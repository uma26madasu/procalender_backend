// src/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

console.log('--- Inside src/routes/auth.js ---');
console.log('authController object after require:', typeof authController, authController);
console.log('authController.getGoogleAuthUrl is:', typeof authController.getGoogleAuthUrl);
console.log('authController.handleGoogleCallback is:', typeof authController.handleGoogleCallback);
console.log('authController.revokeGoogleAccess is:', typeof authController.revokeGoogleAccess);
console.log('authController.getConnectionStatus is:', typeof authController.getConnectionStatus);


// Generate OAuth URL for Google sign-in
router.get('/google/url', authController.getGoogleAuthUrl);

// Handle OAuth callback from Google
router.get('/google/callback', authController.handleGoogleCallback);

// Revoke Google access
router.post('/google/revoke', authController.revokeGoogleAccess);

// Check Google connection status
router.get('/google/status', authController.getConnectionStatus);

module.exports = router;
console.log('--- Exiting src/routes/auth.js ---');