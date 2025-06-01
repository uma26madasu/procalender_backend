const { google } = require('googleapis');
const User = require('../models/User');

console.log('📝 Loading authController...');

// Frontend redirect URI
const FRONTEND_REDIRECT_URI = 'https://procalender-frontend-uma26madasus-projects.vercel.app/auth/google/callback';

// OAuth scopes
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

// Create OAuth2 client
const createOAuth2Client = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    FRONTEND_REDIRECT_URI
  );
};

// Get Google OAuth URL
const getGoogleOAuthUrl = (req, res) => {
  try {
    console.log('🔄 Generating Google OAuth URL...');
    
    const oauth2Client = createOAuth2Client();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });

    console.log('✅ OAuth URL generated successfully');
    
    res.json({
      success: true,
      url: authUrl,
      debug: {
        redirectUri: FRONTEND_REDIRECT_URI,
        scopes: SCOPES
      }
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

// Handle Google OAuth callback
const handleGoogleCallback = async (req, res) => {
  try {
    console.log('🔄 Processing Google OAuth callback...');
    console.log('   Method:', req.method);
    console.log('   Body:', req.body);

    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required'
      });
    }

    console.log('🔄 Exchanging code for tokens...');
    
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('✅ Token exchange successful');
    
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    
    console.log('✅ User info retrieved:', userInfo.email);

    // Save user to database
    const user = await User.findOneAndUpdate(
      { googleId: userInfo.id },
      {
        googleId: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokens.expiry_date,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    console.log('✅ User saved to database:', user.email);

    res.json({
      success: true,
      message: `Google Calendar connected successfully for ${user.email}`,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        picture: user.picture
      },
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date
      }
    });

  } catch (error) {
    console.error('❌ OAuth callback error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

// Check Google OAuth status
const checkGoogleOAuthStatus = async (req, res) => {
  try {
    console.log('🔄 Checking OAuth status...');
    console.log('   Query:', req.query);
    console.log('   Body:', req.body);
    
    const email = req.query.email || req.body.email;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email parameter is required'
      });
    }

    const user = await User.findOne({ email: email });
    
    if (!user) {
      return res.json({
        connected: false,
        message: 'User not found',
        email: email
      });
    }

    const now = new Date();
    const tokenExpiry = new Date(user.tokenExpiry);
    const isExpired = now >= tokenExpiry;

    console.log('✅ User found:', user.email);

    res.json({
      connected: true,
      email: user.email,
      name: user.name,
      picture: user.picture,
      connectedAt: user.updatedAt,
      isExpired: isExpired,
      debug: {
        foundEmail: user.email,
        hasAccessToken: !!user.accessToken,
        hasRefreshToken: !!user.refreshToken,
        totalTokens: 1
      }
    });

  } catch (error) {
    console.error('❌ Error checking OAuth status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check OAuth status',
      error: error.message
    });
  }
};

// Disconnect Google OAuth
const disconnectGoogleOAuth = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    await User.findOneAndUpdate(
      { email: email },
      {
        $unset: {
          accessToken: "",
          refreshToken: "",
          tokenExpiry: ""
        }
      }
    );

    res.json({
      success: true,
      message: `Google Calendar disconnected for ${email}`
    });

  } catch (error) {
    console.error('❌ Error disconnecting OAuth:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect OAuth',
      error: error.message
    });
  }
};

console.log('✅ authController functions defined');

// Export all functions
module.exports = {
  getGoogleOAuthUrl,
  handleGoogleCallback,
  checkGoogleOAuthStatus,
  disconnectGoogleOAuth
};

console.log('✅ authController exported successfully');