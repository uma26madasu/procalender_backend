// src/controllers/authController.js
const { google } = require('googleapis');
const User = require('../models/User');
const asyncHandler = require('../middleware/asyncHandler');
const { refreshGoogleToken } = require('../utils/tokenManager');

console.log('--- Inside src/controllers/authController.js ---');

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
  console.log('Attempting to generate Google Auth URL...');
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  console.log('Generated auth URL');
  res.json({ success: true, url: authUrl });
});

/**
 * @route GET /api/auth/google/callback
 * @desc Handle Google OAuth callback and token exchange
 */
exports.handleGoogleCallback = asyncHandler(async (req, res) => {
  console.log('=== OAuth Callback Started ===');
  console.log('Query params:', req.query);

  const { code } = req.query;

  if (!code) {
    console.error('No authorization code provided');
    return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=no_code`);
  }

  try {
    // Exchange code for tokens
    console.log('Exchanging auth code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);
    console.log('Tokens received:', { 
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date 
    });

    // Validate required tokens
    if (!tokens.access_token) {
      throw new Error('No access token received from Google');
    }

    oauth2Client.setCredentials(tokens);

    // Get user's profile information
    console.log('Fetching user profile...');
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2'
    });
    const { data: profile } = await oauth2.userinfo.get();
    console.log('User profile received:', { email: profile.email, name: profile.name });

    if (!profile.email) {
      console.error('Google profile did not return an email.');
      return res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=no_email`);
    }

    // Map Google tokens to our schema format, with fallbacks for missing values
    const googleTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || '', // Some OAuth flows might not return refresh token
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600000), // Default to 1 hour from now
      scope: tokens.scope || SCOPES.join(' '),
      tokenType: tokens.token_type || 'Bearer',
      idToken: tokens.id_token || ''
    };

    // Validate that we have the minimum required tokens
    if (!googleTokens.refreshToken) {
      console.warn('No refresh token received - user may need to reauthorize periodically');
    }

    // Find or create user in database
    let user = await User.findOne({ email: profile.email });

    if (user) {
      console.log('User found in DB:', user.email);
      // Update existing user's Google tokens and profile info
      user.googleTokens = googleTokens;
      user.name = profile.name || user.name;
      
      // Only update firebaseUid if it's provided and user doesn't already have one
      if (req.user?.firebaseUid && !user.firebaseUid) {
        user.firebaseUid = req.user.firebaseUid;
      }
      
      await user.save();
      console.log('Existing user updated.');
    } else {
      console.log('Creating new user in DB:', profile.email);
      // Create new user
      const userData = {
        email: profile.email,
        name: profile.name,
        googleTokens: googleTokens
      };

      // Only add firebaseUid if it's provided
      if (req.user?.firebaseUid) {
        userData.firebaseUid = req.user.firebaseUid;
      }

      user = await User.create(userData);
      console.log('New user created.');
    }

    // Generate JWT for your application's session (if you have this functionality)
    let redirectUrl;
    
    try {
      const { generateToken } = require('../utils/tokenManager');
      const appJwt = generateToken({ id: user._id, firebaseUid: user.firebaseUid });
      redirectUrl = `${process.env.FRONTEND_URL}/dashboard?token=${appJwt}&message=Google Calendar connected!&type=success`;
    } catch (jwtError) {
      console.log('JWT generation not available, redirecting without token');
      redirectUrl = `${process.env.FRONTEND_URL}/dashboard?message=Google Calendar connected!&type=success`;
    }

    console.log('Redirecting to frontend with success');
    res.redirect(redirectUrl);

  } catch (error) {
    console.error('Error handling Google callback:', error.message);
    console.error('Stack:', error.stack);
    
    // Redirect to frontend with error message
    const errorMessage = encodeURIComponent(error.message);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?error=google_oauth_failed&message=${errorMessage}&type=error`);
  }
});

/**
 * @route POST /api/auth/google/revoke
 * @desc Revoke Google Calendar access
 */
exports.revokeGoogleAccess = asyncHandler(async (req, res) => {
  console.log('Attempting to revoke Google access...');
  const firebaseUid = req.user?.uid;

  if (!firebaseUid) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  try {
    const user = await User.findOne({ firebaseUid: firebaseUid });

    if (!user || !user.googleTokens?.refreshToken) {
      console.log('User or valid Google refresh token not found for revoke operation.');
      return res.status(200).json({ success: true, message: 'Google Calendar already disconnected or no valid tokens.' });
    }

    // Set credentials for revocation
    oauth2Client.setCredentials({
      refresh_token: user.googleTokens.refreshToken
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
    console.error('Revoke access error:', error.message);
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
  console.log('Checking Google Calendar connection status...');
  const firebaseUid = req.user?.uid;

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

    if (tokens?.refreshToken) {
      try {
        console.log('Attempting to refresh Google token for status check...');
        const refreshedTokens = await refreshGoogleToken(user);
        if (refreshedTokens?.accessToken) {
          isConnected = true;
          email = user.email;
          console.log('Google token refreshed successfully.');
        } else {
          console.warn('Refresh token failed for status check, no accessToken received.');
        }
      } catch (refreshError) {
        console.warn('Google token refresh failed during status check:', refreshError.message);
        isConnected = false;
        user.googleTokens = undefined;
        await user.save();
        console.log('Invalid tokens cleared.');
      }
    } else if (tokens?.accessToken) {
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
    console.error('Error checking Google Calendar status:', error.message);
    res.status(500).json({ connected: false, message: 'Server error checking status.' });
  }
});

console.log('--- Exiting src/controllers/authController.js ---');