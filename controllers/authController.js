// controllers/authController.js - UPDATED WITH TOKEN STORAGE
const { google } = require('googleapis');
const User = require('../models/User');

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

// In-memory token storage (for immediate fix)
global.userTokens = global.userTokens || {};

// Generate Google OAuth URL
exports.getGoogleAuthUrl = async (req, res) => {
  try {
    console.log('🔄 Generating Google OAuth URL...');
    
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
};

// Handle Google OAuth callback with TOKEN STORAGE
exports.handleGoogleCallback = async (req, res) => {
  try {
    console.log('🔄 Processing Google OAuth callback...');
    
    const code = req.query.code || req.body.code;
    const error = req.query.error;

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

    // **STORE TOKENS** in memory for immediate use
    global.userTokens[googleUser.email] = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date,
      scope: tokens.scope,
      tokenType: tokens.token_type,
      email: googleUser.email,
      name: googleUser.name,
      connectedAt: new Date()
    };

    console.log('✅ Tokens stored for:', googleUser.email);
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
};

// Check Google Calendar connection status - WITH TOKEN CHECK
exports.getGoogleAuthStatus = async (req, res) => {
  try {
    // Check if we have any stored tokens
    const userTokens = global.userTokens || {};
    const tokenEntries = Object.values(userTokens);
    
    if (tokenEntries.length === 0) {
      return res.json({ 
        connected: false, 
        email: '',
        message: 'No Google Calendar connection found' 
      });
    }
    
    // Return the first connected account (you can modify this logic)
    const firstToken = tokenEntries[0];
    
    // Check if token is expired
    const isExpired = firstToken.expiryDate && Date.now() >= firstToken.expiryDate;
    
    res.json({ 
      connected: !isExpired, 
      email: firstToken.email || '',
      name: firstToken.name || '',
      connectedAt: firstToken.connectedAt,
      isExpired: isExpired
    });
  } catch (error) {
    console.error('Error checking Google auth status:', error);
    res.json({ 
      connected: false, 
      email: '',
      error: error.message 
    });
  }
};

// Disconnect Google Calendar - WITH TOKEN CLEANUP
exports.disconnectGoogleCalendar = async (req, res) => {
  try {
    // Clear all stored tokens
    global.userTokens = {};
    
    console.log('✅ Google Calendar tokens cleared');
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
};

// Updated auth middleware to use stored tokens
exports.verifyAuth = async (req, res, next) => {
  try {
    // Check if we have any stored tokens (simplified approach)
    const userTokens = global.userTokens || {};
    const tokenEntries = Object.values(userTokens);
    
    if (tokenEntries.length === 0) {
      return res.status(401).json({ 
        error: 'Unauthorized - No Google Calendar connection found' 
      });
    }
    
    // Attach token info to request for use in calendar routes
    req.googleTokens = tokenEntries[0]; // Use first available token
    
    console.log('✅ Auth verified with stored tokens');
    next();
  } catch (error) {
    console.error('Auth verification error:', error);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};