// routes/auth.js - UPDATED VERSION FOR YOUR EXISTING STRUCTURE
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Google OAuth routes
router.get('/google/url', protect, authController.getGoogleAuthUrl);

// Handle callback from both Google (GET) and frontend (POST)
router.get('/google/callback', authController.handleGoogleCallback);
router.post('/google/callback', authController.handleGoogleCallback);

// Status and disconnect routes
router.get('/google/status', protect, authController.getGoogleAuthStatus);
router.post('/google/disconnect', protect, authController.disconnectGoogleCalendar);

module.exports = router;