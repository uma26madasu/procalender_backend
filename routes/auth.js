// src/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth'); // Assuming your auth middleware is named authenticateToken

// Google OAuth routes
// Generate OAuth URL for Google sign-in
router.get('/google/url', authController.getGoogleAuthUrl);

// Handle OAuth callback from Google
router.get('/google/callback', authController.handleGoogleCallback);

// Revoke Google access - requires user authentication
router.post('/google/revoke', authenticateToken, authController.revokeGoogleCalendar);

// Get Google Calendar connection status - requires user authentication
router.get('/google/status', authenticateToken, authController.getConnectionStatus);

// Add any other general authentication routes here (e.g., login, register, current user)
// Example:
// router.post('/register', authController.registerUser);
// router.post('/login', authController.loginUser);
// router.get('/me', authenticateToken, authController.getCurrentUser);

module.exports = router;