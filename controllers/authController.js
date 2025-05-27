// src/controllers/authController.js
const { google } = require('googleapis');
const User = require('../models/User'); // <--- IMPORTANT: Ensure this is imported
const asyncHandler = require('../middleware/asyncHandler'); // <--- IMPORTANT: Ensure this is imported
const { refreshGoogleToken } = require('../utils/tokenManager'); // <--- IMPORTANT: Ensure this is imported

console.log('--- Inside src/controllers/authController.js ---');
console.log('User model is:', typeof User); // Should be 'function' (Mongoose model constructor)
console.log('asyncHandler is:', typeof asyncHandler); // Should be 'function'
console.log('refreshGoogleToken is:', typeof refreshGoogleToken); // Should be 'function'

// Configure Google OAuth client
// Ensure this oauth2Client is consistent with the one in tokenManager.js
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
console.log('oauth2Client initialized. Client ID:', process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.substring(0, 5) + '...' : 'undefined');

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
exports.getGoogleAuthUrl = asyncHandler(async (req, res) => { // Wrapped with asyncHandler
  console.log('Attempting to generate Google Auth URL...');
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Critical for getting a refresh token
    scope: SCOPES,
    prompt: 'consent' // Force to always show consent screen to get refresh_token
  });
  console.log('Generated auth URL:', authUrl.substring(0, 50) + '...');
  res.json({ success: true, url: authUrl });
});
console.log('exports.getGoogleAuthUrl is:', typeof exports.getGoogleAuthUrl); // Should be 'function'


/**
 * @route GET /api/auth/google/callback
 * @desc Handle Google OAuth callback and token exchange
 */
exports.handleGoogleCallback = asyncHandler(async (req, res) => { // Wrapped with asyncHandler
  console.log('=== OAuth Callback Started ===');
  console.log('Query params:', req.query);

  const { code } = req.query;

  if (!code) {
    console.error('No authorization code provided');
    return res.redirect(`https://procalender-frontend-uma26madasus-projects.vercel.app/dashboard?error=no_code`);
  }

  try {
    console.log('Exchanging auth code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);
    console.log('Tokens received:', tokens);

    oauth2Client.setCredentials(tokens);

    // Get user's profile information
    console.log('Fetching user profile...');
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2'
    });
    const { data: profile } = await oauth2.userinfo.get();
    console.log('User profile:', profile);

    if (!profile.email) {
      console.error('Google profile did not return an email.');
      return res.redirect(`https://procalender-frontend-uma26madasus-projects.vercel.app/dashboard?error=no_email`);
    }

    // Find or create user in your database
    let user = await User.findOne({ email: profile.email });

    if (user) {
      console.log('User found in DB:', user.email);
      // Update existing user's Google tokens and profile info
      user.googleTokens = tokens;
      user.name = profile.name || user.name;
      // Also update firebaseUid if available in the JWT from your frontend authentication
      if (req.user && req.user.firebaseUid) { // Assuming protect middleware runs for this route or similar auth
          user.firebaseUid = req.user.firebaseUid;
      }
      await user.save();
      console.log('Existing user updated.');
    } else {
      console.log('Creating new user in DB:', profile.email);
      // Create new user (you might want to link this to your main user registration if Firebase is used)
      user = await User.create({
        email: profile.email,
        name: profile.name,
        googleTokens: tokens,
        // If you have Firebase UID from frontend, you might set it here during initial registration
        firebaseUid: req.user ? req.user.firebaseUid : null // Set if coming from an authenticated session
      });
      console.log('New user created.');
    }

    // Generate JWT for your application's session
    const appJwt = require('../utils/tokenManager').generateToken({ id: user._id, firebaseUid: user.firebaseUid }); // Assuming generateToken exists

    // Redirect to frontend dashboard with token or success message
    const redirectUrl = `https://procalender-frontend-uma26madasus-projects.vercel.app/dashboard?token=${appJwt}&message=Google Calendar connected!&type=success`;
    console.log('Redirecting to frontend:', redirectUrl.substring(0, 100) + '...');
    res.redirect(redirectUrl);

  } catch (error) {
    console.error('Error handling Google callback:', error.message, error.stack);
    // Redirect to frontend with error message
    res.redirect(`https://procalender-frontend-uma26madasus-projects.vercel.app/dashboard?error=google_oauth_failed&message=${encodeURIComponent(error.message)}&type=error`);
  }
});
console.log('exports.handleGoogleCallback is:', typeof exports.handleGoogleCallback); // Should be 'function'


/**
 * @route POST /api/auth/google/revoke
 * @desc Revoke Google Calendar access
 */
exports.revokeGoogleAccess = asyncHandler(async (req, res) => { // Wrapped with asyncHandler
  console.log('Attempting to revoke Google access...');
  const firebaseUid = req.user ? req.user.uid : null; // Get firebaseUid from auth token

  if (!firebaseUid) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });

    if (!user || !user.googleTokens || !user.googleTokens.refresh_token) {
      console.log('User or valid Google refresh token not found for revoke operation.');
      return res.status(200).json({ success: true, message: 'Google Calendar already disconnected or no valid tokens.' });
    }

    // Set credentials for revocation
    oauth2Client.setCredentials({
      refresh_token: user.googleTokens.refresh_token
    });

    console.log('Revoking token...');
    await oauth2Client.revokeCredentials();
    console.log('Google token revoked successfully.');

    // Clear Google tokens from user document
    user.googleTokens = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Google Calendar disconnected successfully'
    });
  } catch (error) {
    console.error('Revoke access error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect Google Calendar'
    });
  }
});
console.log('exports.revokeGoogleAccess is:', typeof exports.revokeGoogleAccess); // Should be 'function'


/**
 * @route GET /api/auth/google/status
 * @desc Check Google Calendar connection status for the authenticated user
 */
exports.getConnectionStatus = asyncHandler(async (req, res) => { // Wrapped with asyncHandler
  console.log('Checking Google Calendar connection status...');
  const firebaseUid = req.user ? req.user.uid : null; // Get firebaseUid from auth token

  if (!firebaseUid) {
    console.log('No firebaseUid found for status check.');
    return res.status(401).json({ connected: false, message: 'Authentication required.' });
  }

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });

    if (!user) {
      console.log('User not found in DB for firebaseUid:', firebaseUid);
      return res.json({ connected: false, message: 'User not found.' });
    }

    let tokens = user.googleTokens;
    let isConnected = false;
    let email = user.email || '';

    if (tokens && tokens.refresh_token) {
      try {
        console.log('Attempting to refresh Google token for status check...');
        const refreshedTokens = await refreshGoogleToken(user);
        if (refreshedTokens && refreshedTokens.access_token) {
          isConnected = true;
          email = user.email;
          console.log('Google token refreshed successfully.');
        } else {
          console.warn('Refresh token failed for status check, no access_token received.');
        }
      } catch (refreshError) {
        console.warn('Google token refresh failed during status check:', refreshError.message);
        isConnected = false;
        user.googleTokens = null; // Clear invalid tokens
        await user.save();
        console.log('Invalid tokens cleared.');
      }
    } else if (tokens && tokens.access_token) { // Case for access token without refresh token (less common for long-lived apps)
      isConnected = true;
      email = user.email;
      console.log('User has access token (no refresh token found).');
    } else {
      console.log('User has no valid Google tokens.');
    }

    res.json({
      connected: isConnected,
      email: email,
      message: isConnected ? 'Google Calendar connected.' : 'Google Calendar not connected.'
    });
    console.log('Connection status returned: Connected -', isConnected, 'Email -', email);
  } catch (error) {
    console.error('Error checking Google Calendar status:', error.message, error.stack);
    res.status(500).json({ connected: false, message: 'Server error checking status.' });
  }
});
console.log('exports.getConnectionStatus is:', typeof exports.getConnectionStatus); // Should be 'function'

console.log('--- Exiting src/controllers/authController.js ---');