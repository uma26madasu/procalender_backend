// controllers/authController.js - FIXED VERSION
const { google } = require('googleapis');
const User = require('../models/User');

// OAuth2 configuration - Ensure this matches your .env exactly
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI // This MUST match Google Cloud Console
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
    console.log('🔧 Using redirect URI:', process.env.GOOGLE_REDIRECT_URI);
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      redirect_uri: process.env.GOOGLE_REDIRECT_URI // Explicitly set redirect URI
    });

    console.log('✅ Generated OAuth URL successfully');
    res.json({ 
      success: true, 
      url: authUrl,
      redirectUri: process.env.GOOGLE_REDIRECT_URI // Debug info
    });
  } catch (error) {
    console.error('❌ Error generating OAuth URL:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate OAuth URL',
      error: error.message
    });
  }
};

// Handle Google OAuth callback with improved error handling
exports.handleGoogleCallback = async (req, res) => {
  try {
    console.log('🔄 Processing Google OAuth callback...');
    console.log('🔧 Request method:', req.method);
    console.log('🔧 Query params:', req.query);
    console.log('🔧 Expected redirect URI:', process.env.GOOGLE_REDIRECT_URI);
    
    const code = req.query.code || req.body.code;
    const error = req.query.error;
    const state = req.query.state;

    // Handle OAuth errors
    if (error) {
      console.error('❌ OAuth error from Google:', error);
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
        `${process.env.FRONTEND_URL}?error=${encodeURIComponent(errorMessage)}`
      );
    }

    // Check for authorization code
    if (!code) {
      console.error('❌ No authorization code received');
      const message = 'No authorization code received from Google';
      
      if (req.method === 'POST') {
        return res.status(400).json({ 
          success: false, 
          message 
        });
      }
      
      return res.redirect(
        `${process.env.FRONTEND_URL}?error=${encodeURIComponent(message)}`
      );
    }

    // Exchange authorization code for tokens
    console.log('🔄 Exchanging code for tokens...');
    
    // Explicitly set redirect URI to match what we sent to Google
    oauth2Client.redirectUri = process.env.GOOGLE_REDIRECT_URI;
    
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token) {
      throw new Error('No access token received from Google');
    }

    console.log('✅ Received tokens from Google');

    // Set credentials for this session
    oauth2Client.setCredentials(tokens);

    // Get user information from Google
    console.log('🔄 Fetching user information...');
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    const googleUser = userInfo.data;
    console.log('✅ Google user info received:', {
      id: googleUser.id,
      email: googleUser.email,
      name: googleUser.name
    });

    // Find or create user in database
    let user = await User.findOne({ email: googleUser.email });
    
    if (!user) {
      // Create new user
      user = new User({
        email: googleUser.email,
        name: googleUser.name,
        googleTokens: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiryDate: new Date(tokens.expiry_date || Date.now() + 3600000),
          scope: tokens.scope,
          tokenType: tokens.token_type || 'Bearer',
          idToken: tokens.id_token
        }
      });
      console.log('🔄 Creating new user...');
    } else {
      // Update existing user tokens
      user.googleTokens = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || user.googleTokens?.refreshToken,
        expiryDate: new Date(tokens.expiry_date || Date.now() + 3600000),
        scope: tokens.scope,
        tokenType: tokens.token_type || 'Bearer',
        idToken: tokens.id_token
      };
      console.log('🔄 Updating existing user tokens...');
    }
    
    await user.save();

    // Store tokens in memory for immediate use
    global.userTokens[googleUser.email] = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date,
      scope: tokens.scope,
      tokenType: tokens.token_type,
      email: googleUser.email,
      name: googleUser.name,
      userId: user._id.toString(),
      connectedAt: new Date()
    };

    console.log('✅ User saved and tokens stored for:', googleUser.email);
    
    const successMessage = `Google Calendar connected successfully for ${googleUser.email}!`;

    // Return appropriate response based on request method
    if (req.method === 'POST') {
      return res.json({ 
        success: true, 
        message: successMessage,
        user: {
          id: user._id,
          email: googleUser.email,
          name: googleUser.name
        }
      });
    }

    // Redirect for GET requests (from Google)
    res.redirect(
      `${process.env.FRONTEND_URL}?` +
      `message=${encodeURIComponent(successMessage)}&` +
      `type=success&` +
      `email=${encodeURIComponent(googleUser.email)}`
    );

  } catch (error) {
    console.error('❌ Error in Google OAuth callback:', error);
    
    // Log specific error details for debugging
    if (error.message?.includes('redirect_uri_mismatch')) {
      console.error('🔧 Redirect URI mismatch! Check Google Cloud Console configuration.');
      console.error('🔧 Expected URI:', process.env.GOOGLE_REDIRECT_URI);
    }
    
    const errorMessage = error.message || 'Authentication failed. Please try again.';
    
    if (req.method === 'POST') {
      return res.status(500).json({ 
        success: false, 
        message: errorMessage,
        debug: {
          redirectUri: process.env.GOOGLE_REDIRECT_URI,
          error: error.message
        }
      });
    }
    
    res.redirect(
      `${process.env.FRONTEND_URL}?error=${encodeURIComponent(errorMessage)}`
    );
  }
};

// Check Google Calendar connection status
exports.getGoogleAuthStatus = async (req, res) => {
  try {
    // Check database for user tokens
    const userEmail = req.query.email || req.user?.email;
    
    if (userEmail) {
      const user = await User.findOne({ email: userEmail });
      if (user?.googleTokens?.accessToken) {
        const isExpired = user.googleTokens.expiryDate && 
                         Date.now() >= user.googleTokens.expiryDate.getTime();
        
        return res.json({ 
          connected: !isExpired, 
          email: user.email,
          name: user.name,
          connectedAt: user.googleTokens.connectedAt || user.updatedAt,
          isExpired: isExpired
        });
      }
    }
    
    // Check in-memory storage as fallback
    const userTokens = global.userTokens || {};
    const tokenEntries = Object.values(userTokens);
    
    if (tokenEntries.length === 0) {
      return res.json({ 
        connected: false, 
        email: '',
        message: 'No Google Calendar connection found' 
      });
    }
    
    const firstToken = tokenEntries[0];
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

// Disconnect Google Calendar
exports.disconnectGoogleCalendar = async (req, res) => {
  try {
    const userEmail = req.user?.email || req.body.email;
    
    if (userEmail) {
      // Clear from database
      await User.updateOne(
        { email: userEmail },
        { $unset: { googleTokens: "" } }
      );
      
      // Clear from memory
      delete global.userTokens[userEmail];
    } else {
      // Clear all stored tokens if no specific user
      global.userTokens = {};
    }
    
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

// Auth middleware to use stored tokens
exports.verifyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let userEmail = null;
    
    // Try to get user email from various sources
    if (authHeader?.startsWith('Bearer ')) {
      // Handle JWT token or direct email
      const token = authHeader.split(' ')[1];
      
      // Check if it's an email (simple check)
      if (token.includes('@')) {
        userEmail = token;
      }
    }
    
    // Check query params
    if (!userEmail) {
      userEmail = req.query.email;
    }
    
    // Look up user in database first
    if (userEmail) {
      const user = await User.findOne({ email: userEmail });
      if (user?.googleTokens?.accessToken) {
        req.user = user;
        req.googleTokens = user.googleTokens;
        return next();
      }
    }
    
    // Fallback to in-memory storage
    const userTokens = global.userTokens || {};
    const tokenEntries = Object.values(userTokens);
    
    if (tokenEntries.length === 0) {
      return res.status(401).json({ 
        error: 'Unauthorized - No Google Calendar connection found',
        needsAuth: true
      });
    }
    
    // Use first available token
    req.googleTokens = tokenEntries[0];
    req.user = { 
      email: tokenEntries[0].email,
      id: tokenEntries[0].userId 
    };
    
    console.log('✅ Auth verified with stored tokens');
    next();
  } catch (error) {
    console.error('Auth verification error:', error);
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: error.message
    });
  }
};