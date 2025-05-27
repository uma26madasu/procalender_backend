// src/controllers/authController.js
const { google } = require('googleapis');
const User = require('../models/User'); // <--- IMPORT YOUR USER MODEL
const asyncHandler = require('../middleware/asyncHandler'); // Assuming you use this middleware

// Configure Google OAuth client
// Ensure this oauth2Client is consistent with the one in tokenManager.js
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Set OAuth scopes
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events', // Make sure this is included for full event management
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile' // To get user's name
];

/**
 * @route GET /api/auth/google/url
 * @desc Generate Google OAuth consent URL
 */
exports.getGoogleAuthUrl = (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Critical for getting a refresh token
    scope: SCOPES,
    prompt: 'consent' // Force to always show consent screen to get refresh_token
  });
  res.json({ success: true, url: authUrl });
};

/**
 * @route GET /api/auth/google/callback
 * @desc Handle Google OAuth callback after user consent
 */
exports.handleGoogleCallback = asyncHandler(async (req, res) => {
  try {
    console.log('=== OAuth Callback Started ===');
    console.log('Query params:', req.query);

    const { code } = req.query;

    if (!code) {
      console.error('No authorization code provided');
      return res.redirect(`${process.env.FRONTEND_URL}/dashboard?message=No authorization code provided&type=error`);
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens); // Set credentials for fetching user info

    // Get user info from Google
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2',
    });
    const { data: userData } = await oauth2.userinfo.get();
    const googleEmail = userData.email;
    const googleName = userData.name; // Get name from Google profile

    // Get Firebase UID from authenticated request (assuming Firebase Auth middleware populates req.user)
    const firebaseUid = req.user ? req.user.uid : null;

    if (!firebaseUid) {
      console.error('Firebase UID not found in auth callback. User must be logged in via Firebase.');
      return res.redirect(`${process.env.FRONTEND_URL}/dashboard?message=Authentication failed: User not logged in via Firebase.&type=error`);
    }

    // Find user by firebaseUid, or create if not exists
    let user = await User.findOne({ firebaseUid: firebaseUid });

    if (!user) {
      // Create new user if not found, linking Firebase UID and Google email/name
      user = new User({
        firebaseUid: firebaseUid,
        email: googleEmail,
        name: googleName || 'Google User', // Use Google name or default
        // Add other default fields for new user if necessary
      });
      console.log(`New user created with Firebase UID: ${firebaseUid}`);
    } else if (user.email !== googleEmail) {
      // Optional: Update user's email if it changed (e.g., if linking a different Google account)
      console.log(`Updating email for user ${firebaseUid} from ${user.email} to ${googleEmail}`);
      user.email = googleEmail;
    }

    // Store Google Calendar tokens directly on the User model
    user.googleTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: new Date(tokens.expiry_date || new Date().getTime() + tokens.expires_in * 1000), // Ensure it's a Date object
      scope: tokens.scope,
      tokenType: tokens.token_type,
      idToken: tokens.id_token || null,
    };
    await user.save(); // Save the updated user document with tokens

    console.log(`Google Calendar tokens stored/updated for user: ${firebaseUid}`);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?message=Google Calendar connected successfully!&type=success`);
  } catch (error) {
    console.error('Error during Google OAuth callback:', error);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?message=Failed to connect Google Calendar: ${error.message || 'unknown error'}.&type=error`);
  }
});

/**
 * @route POST /api/auth/google/revoke
 * @desc Disconnect Google Calendar for the authenticated user
 */
exports.revokeGoogleCalendar = asyncHandler(async (req, res) => {
  const firebaseUid = req.user ? req.user.uid : null; // Get Firebase UID from auth middleware

  if (!firebaseUid) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });

    if (!user || !user.googleTokens || !user.googleTokens.accessToken) {
      console.log(`No Google tokens found for user ${firebaseUid} to revoke.`);
      return res.json({ success: true, message: 'Google Calendar was not connected or already disconnected.' });
    }

    // Revoke token with Google
    oauth2Client.setCredentials({ access_token: user.googleTokens.accessToken });
    try {
      await oauth2Client.revokeToken(user.googleTokens.accessToken);
      console.log(`Google access token revoked with Google for user: ${firebaseUid}`);
    } catch (revokeError) {
      // Log revoke error but proceed to clear from DB, as Google might already have revoked
      console.warn(`Failed to revoke token with Google for user ${firebaseUid}:`, revokeError.message);
    }

    // Clear tokens from database (by unsetting the googleTokens field)
    user.googleTokens = undefined; // Mongoose will treat this as $unset
    await user.save();
    console.log(`Google Calendar tokens cleared from DB for user: ${firebaseUid}`);

    res.json({
      success: true,
      message: 'Google Calendar disconnected successfully'
    });
  } catch (error) {
    console.error('Revoke access error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect Google Calendar'
    });
  }
});

/**
 * @route GET /api/auth/google/status
 * @desc Check Google Calendar connection status for the authenticated user
 */
exports.getConnectionStatus = asyncHandler(async (req, res) => {
  const firebaseUid = req.user ? req.user.uid : null; // Get firebaseUid from auth token

  if (!firebaseUid) {
    return res.status(401).json({ connected: false, message: 'Authentication required.' });
  }

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });

    if (!user) {
      return res.json({ connected: false, message: 'User not found.' });
    }

    // Check if user has Google tokens (specifically, a refresh token)
    const isConnected = !!(user.googleTokens && user.googleTokens.refreshToken);
    const email = isConnected && user.email ? user.email : ''; // Use user's email from DB

    res.json({
      connected: isConnected,
      email: email,
      message: isConnected ? 'Google Calendar connected.' : 'Google Calendar not connected.'
    });
  } catch (error) {
    console.error('Error checking Google Calendar status:', error);
    res.status(500).json({ connected: false, message: 'Server error checking status.' });
  }
});

// Add your other existing authentication routes here (e.g., login, register, etc.)
// exports.registerUser = asyncHandler(async (req, res) => { /* ... */ });
// exports.loginUser = asyncHandler(async (req, res) => { /* ... */ });
// exports.getCurrentUser = asyncHandler(async (req, res) => { /* ... */ });