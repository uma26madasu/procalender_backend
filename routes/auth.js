// routes/auth.js - FIXED VERSION
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

console.log('📝 Loading auth routes...');

// Public routes (no authentication required)
router.get('/google/url', authController.getGoogleAuthUrl);
router.get('/google/callback', authController.handleGoogleCallback);
router.post('/google/callback', authController.handleGoogleCallback);

// Status check should be public to check current auth state
router.get('/google/status', authController.getGoogleAuthStatus);

// Disconnect should be public too (can include email in request body)
router.post('/google/disconnect', authController.disconnectGoogleCalendar);

console.log('✅ Auth routes configured (all public endpoints)');

module.exports = router;