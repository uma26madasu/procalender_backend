// src/controllers/authController.js
const { google } = require('googleapis');
const User = require('../models/User'); // Assuming your User model is here
const asyncHandler = require('../middleware/asyncHandler'); // Make sure you have this middleware
const { refreshGoogleToken } = require('../utils/tokenManager'); // Make sure this is imported

// Configure Google OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Set OAuth scopes
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

exports.getGoogleAuthUrl = asyncHandler(async (req, res) => {
  // Ensure the redirect URI is correct for your frontend deployment
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Force to always show consent screen to get refresh_token
  });

  res.json({ success: true, url: authUrl });
});

exports.handleGoogleCallback = asyncHandler(async (req, res) => {
  console.log('=== OAuth Callback Started ===');
  console.log('Query params:', req.query);

  const { code } = req.query;

  if (!code) {
    console.error('No authorization code provided');
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?message=Google%20auth%20failed&type=error`);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const { data: { email, name, picture } } = await google.oauth2({ version: 'v2', auth: oauth2Client }).userinfo.get();

    // Find the user by Firebase UID from the authenticated token
    const firebaseUid = req.user ? req.user.uid : null; // This should be available from authenticateToken middleware

    if (!firebaseUid) {
      console.error('Firebase UID not found in request during Google callback');
      return res.redirect(`${process.env.FRONTEND_URL}/dashboard?message=Authentication%20error&type=error`);
    }

    let user = await User.findOne({ firebaseUid: firebaseUid });

    if (!user) {
      // Create new user if not found
      user = new User({
        firebaseUid: firebaseUid,
        email: email,
        name: name,
        profilePicture: picture,
        googleTokens: tokens,
        lastLogin: new Date()
      });
    } else {
      // Update existing user's Google tokens and profile info
      user.email = email; // Update email in case it changed or wasn't set
      user.name = name;
      user.profilePicture = picture;
      user.googleTokens = tokens;
      user.lastLogin = new Date();
    }

    await user.save();

    console.log('Google sign-in successful for user:', email);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?message=Google%20Calendar%20connected%20successfully!&type=success`);

  } catch (error) {
    console.error('Error handling Google callback:', error);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?message=Failed%20to%20connect%20Google%20Calendar&type=error`);
  }
});

exports.revokeGoogleAccess = asyncHandler(async (req, res) => {
  const firebaseUid = req.user ? req.user.uid : null;
  if (!firebaseUid) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });

    if (!user || !user.googleTokens || !user.googleTokens.access_token) {
      return res.status(400).json({ success: false, message: 'No Google tokens found for user.' });
    }

    // Set credentials for revocation
    oauth2Client.setCredentials(user.googleTokens);

    // Revoke the token
    await oauth2Client.revokeToken(user.googleTokens.access_token);

    // Clear Google tokens from user document
    user.googleTokens = null;
    await user.save();

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

exports.getConnectionStatus = asyncHandler(async (req, res) => {
  const firebaseUid = req.user ? req.user.uid : null;

  if (!firebaseUid) {
    return res.status(401).json({ connected: false, message: 'Authentication required.' });
  }

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });

    if (!user) {
      return res.json({ connected: false, message: 'User not found.' });
    }

    // Check if user has Google tokens and if they are still valid (or refreshable)
    // Attempt to refresh if needed (this also validates the refresh token)
    let tokens = user.googleTokens;
    let isConnected = false;
    let email = user.email || '';

    if (tokens && tokens.refresh_token) {
      try {
        const refreshedTokens = await refreshGoogleToken(user); // This will update user.googleTokens in DB
        if (refreshedTokens && refreshedTokens.access_token) {
          isConnected = true;
          email = user.email; // Ensure email is from the user document
        }
      } catch (refreshError) {
        console.warn('Google token refresh failed:', refreshError.message);
        // If refresh fails, consider it disconnected
        isConnected = false;
        user.googleTokens = null; // Clear invalid tokens
        await user.save();
      }
    } else if (tokens && tokens.access_token) {
      // If only access token exists (no refresh token), consider connected but might expire soon
      // This case is less ideal as we can't refresh
      isConnected = true;
      email = user.email;
    }


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