// src/controllers/authController.js
const { google } = require('googleapis');
const User = require('../models/User');
const asyncHandler = require('../middleware/asyncHandler');

// Configure Google OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Set OAuth scopes
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

/**
 * @route GET /api/auth/google/url
 * @desc Generate Google OAuth consent URL
 */
exports.getGoogleAuthUrl = asyncHandler(async (req, res) => {
  console.log('Generating Google Auth URL...');
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.json({ success: true, url: authUrl });
});

/**
 * @route GET /api/auth/google/callback
 * @desc Handle Google OAuth callback and token exchange
 */
exports.handleGoogleCallback = asyncHandler(async (req, res) => {
  console.log('=== OAuth Callback Started ===');
  const { code } = req.query;

  if (!code) {
    console.error('No authorization code provided');
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=no_code`);
  }

  try {
    // Exchange code for tokens
    console.log('Exchanging auth code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);
    console.log('Tokens received successfully');

    oauth2Client.setCredentials(tokens);

    // Get user profile
    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const { data: profile } = await oauth2.userinfo.get();
    console.log('Profile received:', profile.email);

    if (!profile.email) {
      return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=no_email`);
    }

    // Simple token mapping - only save what we have
    const googleTokens = {};
    if (tokens.access_token) googleTokens.accessToken = tokens.access_token;
    if (tokens.refresh_token) googleTokens.refreshToken = tokens.refresh_token;
    if (tokens.expiry_date) googleTokens.expiryDate = new Date(tokens.expiry_date);
    if (tokens.scope) googleTokens.scope = tokens.scope;
    if (tokens.token_type) googleTokens.tokenType = tokens.token_type;
    if (tokens.id_token) googleTokens.idToken = tokens.id_token;

    // Find or create user
    let user = await User.findOne({ email: profile.email });

    if (user) {
      console.log('Updating existing user:', user.email);
      user.googleTokens = googleTokens;
      user.name = profile.name || user.name;
      await user.save();
    } else {
      console.log('Creating new user:', profile.email);
      user = await User.create({
        email: profile.email,
        name: profile.name || 'Google User',
        googleTokens: googleTokens
      });
    }

    console.log('User saved successfully');
    
    // Redirect with success
    const redirectUrl = `${process.env.FRONTEND_URL}/dashboard?message=Google Calendar connected!&type=success`;
    res.redirect(redirectUrl);

  } catch (error) {
    console.error('OAuth callback error:', error.message);
    const errorMessage = encodeURIComponent(error.message);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=google_oauth_failed&message=${errorMessage}&type=error`);
  }
});

/**
 * @route POST /api/auth/google/revoke
 * @desc Revoke Google Calendar access
 */
exports.revokeGoogleAccess = asyncHandler(async (req, res) => {
  // For now, just clear tokens from database
  // You can implement proper revocation later
  res.json({
    success: true,
    message: 'Google Calendar disconnected (simplified)'
  });
});

/**
 * @route GET /api/auth/google/status
 * @desc Check Google Calendar connection status
 */
exports.getConnectionStatus = asyncHandler(async (req, res) => {
  // For now, return basic status
  // You can implement proper status checking later
  res.json({
    connected: false,
    message: 'Status check not implemented yet'
  });
});