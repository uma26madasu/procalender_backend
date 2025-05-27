// src/controllers/authController.js
const { google } = require('googleapis');
const User = require('../models/User'); // <--- IMPORTANT: Ensure this is imported
const asyncHandler = require('../middleware/asyncHandler'); // <--- IMPORTANT: Ensure this is imported
const { refreshGoogleToken } = require('../utils/tokenManager'); // <--- IMPORTANT: Ensure this is imported

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

exports.getGoogleAuthUrl = asyncHandler(async (req, res) => { // Wrapped with asyncHandler
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Force to always show consent screen to get refresh_token
  });

  res.json({ success: true, url: authUrl });
});

exports.handleGoogleCallback = asyncHandler(async (req, res) => { // Wrapped with asyncHandler
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

    const { data: { email, name, picture } } = await google.oauth2({ version: 'v2', auth: oauth2Client }).userinfo.get();

    const firebaseUid = req.user ? req.user.uid : null;

    if (!firebaseUid) {
      console.error('Firebase UID not found in request during Google callback');
      return res.redirect(`${process.env.FRONTEND_URL}/dashboard?message=Authentication%20error&type=error`);
    }

    let user = await User.findOne({ firebaseUid: firebaseUid });

    if (!user) {
      user = new User({
        firebaseUid: firebaseUid,
        email: email,
        name: name,
        profilePicture: picture,
        googleTokens: tokens,
        lastLogin: new Date()
      });
    } else {
      user.email = email;
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

exports.revokeGoogleAccess = asyncHandler(async (req, res) => { // Wrapped with asyncHandler
  const firebaseUid = req.user ? req.user.uid : null;
  if (!firebaseUid) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });

    if (!user || !user.googleTokens || !user.googleTokens.access_token) {
      return res.status(400).json({ success: false, message: 'No Google tokens found for user.' });
    }

    oauth2Client.setCredentials(user.googleTokens);
    await oauth2Client.revokeToken(user.googleTokens.access_token);

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

exports.getConnectionStatus = asyncHandler(async (req, res) => { // Wrapped with asyncHandler
  const firebaseUid = req.user ? req.user.uid : null;

  if (!firebaseUid) {
    return res.status(401).json({ connected: false, message: 'Authentication required.' });
  }

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });

    if (!user) {
      return res.json({ connected: false, message: 'User not found.' });
    }

    let tokens = user.googleTokens;
    let isConnected = false;
    let email = user.email || '';

    if (tokens && tokens.refresh_token) {
      try {
        const refreshedTokens = await refreshGoogleToken(user);
        if (refreshedTokens && refreshedTokens.access_token) {
          isConnected = true;
          email = user.email;
        }
      } catch (refreshError) {
        console.warn('Google token refresh failed:', refreshError.message);
        isConnected = false;
        user.googleTokens = null;
        await user.save();
      }
    } else if (tokens && tokens.access_token) {
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