// controllers/authController.js - FIXED VERSION WITH IMPROVED CALLBACK HANDLING
const { google } = require('googleapis');
const admin = require('../firebase/admin');
const asyncHandler = require('express-async-handler');
const TokenManager = require('../utils/tokenManager');

// OAuth2 configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// OAuth scopes
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

// Generate Google OAuth URL
exports.getGoogleAuthUrl = asyncHandler(async (req, res) => {
  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });

    console.log('✅ Generated OAuth URL successfully');
    res.json({ 
      success: true, 
      url: authUrl 
    });
  } catch (error) {
    console.error('❌ Error generating OAuth URL:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate OAuth URL' 
    });
  }
});

// Handle Google OAuth callback - FIXED VERSION
exports.handleGoogleCallback = asyncHandler(async (req, res) => {
  try {
    console.log('🔄 Processing Google OAuth callback...');
    console.log('Request method:', req.method);
    console.log('Query params:', req.query);
    console.log('Body:', req.body);

    // Handle both GET (from Google redirect) and POST (from frontend)
    const code = req.query.code || req.body.code;
    const error = req.query.error;

    // Check for OAuth errors
    if (error) {
      console.error('❌ OAuth error:', error);
      const errorMessage = error === 'access_denied' 
        ? 'Access denied by user' 
        : `OAuth error: ${error}`;
      
      if (req.method === 'POST') {
        return res.status(400).json({ 
          success: false, 
          message: errorMessage 
        });
      }
      
      return res.redirect(
        `${process.env.FRONTEND_URL}/dashboard?message=${encodeURIComponent(errorMessage)}&type=error`
      );
    }

    // Check for authorization code
    if (!code) {
      console.error('❌ No authorization code received');
      const message = 'No authorization code received';
      
      if (req.method === 'POST') {
        return res.status(400).json({ 
          success: false, 
          message 
        });
      }
      
      return res.redirect(
        `${process.env.FRONTEND_URL}/dashboard?message=${encodeURIComponent(message)}&type=error`
      );
    }

    // Exchange authorization code for tokens
    console.log('🔄 Exchanging code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token) {
      throw new Error('No access token received from Google');
    }

    // Set credentials for this session
    oauth2Client.setCredentials(tokens);

    // Get user information from Google
    console.log('🔄 Fetching user information...');
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    const googleUser = userInfo.data;
    console.log('✅ Google user info:', {
      id: googleUser.id,
      email: googleUser.email,
      name: googleUser.name
    });

    // Get Firebase user from request (set by auth middleware)
    const firebaseUID = req.user?.uid;
    
    if (!firebaseUID) {
      console.error('❌ No Firebase user found in request');
      const message = 'Authentication required. Please login first.';
      
      if (req.method === 'POST') {
        return res.status(401).json({ 
          success: false, 
          message 
        });
      }
      
      return res.redirect(
        `${process.env.FRONTEND_URL}/dashboard?message=${encodeURIComponent(message)}&type=error`
      );
    }

    // Save tokens to database using TokenManager
    console.log('🔄 Saving tokens to database...');
    await TokenManager.saveTokens(firebaseUID, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
      token_type: tokens.token_type
    });

    // Update user document with Google account info
    const userRef = admin.firestore().collection('users').doc(firebaseUID);
    await userRef.set({
      googleCalendar: {
        connected: true,
        email: googleUser.email,
        name: googleUser.name,
        googleId: googleUser.id,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSyncAt: admin.firestore.FieldValue.serverTimestamp()
      }
    }, { merge: true });

    console.log('✅ Google Calendar connected successfully');
    const successMessage = `Google Calendar connected successfully for ${googleUser.email}!`;

    // Return appropriate response based on request method
    if (req.method === 'POST') {
      return res.json({ 
        success: true, 
        message: successMessage,
        user: {
          email: googleUser.email,
          name: googleUser.name
        }
      });
    }

    // Redirect for GET requests (from Google)
    res.redirect(
      `${process.env.FRONTEND_URL}/dashboard?` +
      `message=${encodeURIComponent(successMessage)}&` +
      `type=success&` +
      `email=${encodeURIComponent(googleUser.email)}`
    );

  } catch (error) {
    console.error('❌ Error in Google OAuth callback:', error);
    
    const errorMessage = error.message || 'Authentication failed. Please try again.';
    
    if (req.method === 'POST') {
      return res.status(500).json({ 
        success: false, 
        message: errorMessage 
      });
    }
    
    res.redirect(
      `${process.env.FRONTEND_URL}/dashboard?message=${encodeURIComponent(errorMessage)}&type=error`
    );
  }
});

// Check Google Calendar connection status
exports.getGoogleAuthStatus = asyncHandler(async (req, res) => {
  try {
    const firebaseUID = req.user.uid;
    
    // Check if user has valid tokens
    const tokens = await TokenManager.getTokens(firebaseUID);
    
    if (!tokens || !tokens.access_token) {
      return res.json({ 
        connected: false, 
        email: '' 
      });
    }

    // Get user's Google info from Firestore
    const userDoc = await admin.firestore()
      .collection('users')
      .doc(firebaseUID)
      .get();
    
    const userData = userDoc.data();
    const googleCalendar = userData?.googleCalendar;

    if (!googleCalendar?.connected) {
      return res.json({ 
        connected: false, 
        email: '' 
      });
    }

    res.json({ 
      connected: true, 
      email: googleCalendar.email || '',
      name: googleCalendar.name || '',
      connectedAt: googleCalendar.connectedAt
    });

  } catch (error) {
    console.error('Error checking Google auth status:', error);
    res.json({ 
      connected: false, 
      email: '' 
    });
  }
});

// Disconnect Google Calendar
exports.disconnectGoogleCalendar = asyncHandler(async (req, res) => {
  try {
    const firebaseUID = req.user.uid;
    
    // Revoke Google tokens
    const tokens = await TokenManager.getTokens(firebaseUID);
    if (tokens?.access_token) {
      try {
        oauth2Client.setCredentials(tokens);
        await oauth2Client.revokeCredentials();
      } catch (revokeError) {
        console.warn('Warning: Could not revoke Google tokens:', revokeError.message);
        // Continue with disconnect even if revoke fails
      }
    }

    // Remove tokens from database
    await TokenManager.deleteTokens(firebaseUID);

    // Update user document
    const userRef = admin.firestore().collection('users').doc(firebaseUID);
    await userRef.set({
      googleCalendar: {
        connected: false,
        disconnectedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    }, { merge: true });

    console.log('✅ Google Calendar disconnected successfully');
    res.json({ 
      success: true, 
      message: 'Google Calendar disconnected successfully' 
    });

  } catch (error) {
    console.error('❌ Error disconnecting Google Calendar:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to disconnect Google Calendar' 
    });
  }
});