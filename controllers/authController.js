const { google } = require('googleapis');
const User = require('../models/User');

// 🔧 CORRECTED: Use frontend redirect URI consistently
const FRONTEND_REDIRECT_URI = 'https://procalender-frontend-uma26madasus-projects.vercel.app/auth/google/callback';

// OAuth scopes
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

// Helper function to create OAuth2 client
const createOAuth2Client = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    FRONTEND_REDIRECT_URI // Always use frontend redirect URI
  );
};

// Generate Google OAuth URL
exports.getGoogleOAuthUrl = (req, res) => {
  try {
    console.log('🔄 Generating Google OAuth URL...');
    
    const oauth2Client = createOAuth2Client();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      include_granted_scopes: true
    });

    console.log('✅ Generated OAuth URL successfully');
    console.log('🔧 Using redirect URI:', FRONTEND_REDIRECT_URI);

    res.json({
      success: true,
      url: authUrl,
      debug: {
        redirectUri: FRONTEND_REDIRECT_URI,
        scopes: SCOPES,
        clientId: process.env.GOOGLE_CLIENT_ID ? 'Present' : 'Missing'
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
exports.handleGoogleCallback = async (req, res) => {
  try {
    console.log('🔄 Processing Google OAuth callback...');
    console.log('🔧 Request details:');
    console.log('   Method:', req.method);
    console.log('   Protocol:', req.protocol);
    console.log('   Secure:', req.secure);
    console.log('   X-Forwarded-Proto:', req.headers['x-forwarded-proto']);
    console.log('   Host:', req.headers.host);
    console.log('   Body:', req.body);

    const { code } = req.body;
    
    if (!code) {
      console.error('❌ No authorization code provided');
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required'
      });
    }

    console.log('🔄 Exchanging code for tokens...');
    console.log('🔧 Using redirect URI for token exchange:', FRONTEND_REDIRECT_URI);

    // Create OAuth2 client with frontend redirect URI
    const oauth2Client = createOAuth2Client();

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log('✅ Token exchange successful');
    console.log('🔧 Received tokens:', {
      access_token: tokens.access_token ? 'Present' : 'Missing',
      refresh_token: tokens.refresh_token ? 'Present' : 'Missing',
      expiry_date: tokens.expiry_date
    });

    // Set credentials for API calls
    oauth2Client.setCredentials(tokens);

    // Get user info
    console.log('🔄 Fetching user info...');
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    console.log('✅ User info retrieved:', userInfo.email);

    // Save user and tokens to database
    console.log('🔄 Saving user to database...');
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

    console.log('✅ User saved successfully:', user.email);

    // Return success response
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
    console.error('❌ Error during token exchange:', error);
    
    let errorMessage = 'Authentication failed';
    let errorDetails = { error: error.message };
    
    if (error.message.includes('redirect_uri_mismatch')) {
      errorMessage = 'redirect_uri_mismatch';
      errorDetails = {
        error: 'Redirect URI mismatch',
        configuredUri: FRONTEND_REDIRECT_URI,
        expectedUri: 'Must match Google Cloud Console configuration',
        suggestion: 'Check Google Cloud Console OAuth 2.0 Client ID settings',
        currentConfig: {
          clientId: process.env.GOOGLE_CLIENT_ID ? 'Present' : 'Missing',
          clientSecret: process.env.GOOGLE_CLIENT_SECRET ? 'Present' : 'Missing',
          redirectUri: FRONTEND_REDIRECT_URI
        }
      };
    } else if (error.message.includes('invalid_grant')) {
      errorMessage = 'invalid_grant';
      errorDetails = {
        error: 'Authorization code expired or already used',
        suggestion: 'Please try the OAuth flow again',
        note: 'Each authorization code can only be used once'
      };
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      debug: errorDetails
    });
  }
};

// Check Google OAuth status
exports.checkGoogleOAuthStatus = async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email parameter is required'
      });
    }

    console.log('🔄 Checking OAuth status for:', email);

    const user = await User.findOne({ email: email });
    
    if (!user) {
      return res.json({
        connected: false,
        message: 'User not found'
      });
    }

    // Check if tokens are still valid
    const now = new Date();
    const tokenExpiry = new Date(user.tokenExpiry);
    const isExpired = now >= tokenExpiry;

    console.log('✅ OAuth status checked:', {
      email: user.email,
      connected: true,
      isExpired: isExpired
    });

    res.json({
      connected: true,
      email: user.email,
      name: user.name,
      picture: user.picture,
      connectedAt: user.updatedAt,
      isExpired: isExpired,
      tokenExpiry: user.tokenExpiry,
      debug: {
        foundEmail: user.email,
        hasAccessToken: !!user.accessToken,
        hasRefreshToken: !!user.refreshToken,
        totalTokens: user.accessToken ? 1 : 0
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
exports.disconnectGoogleOAuth = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    console.log('🔄 Disconnecting Google OAuth for:', email);

    // Find and remove user tokens
    const user = await User.findOneAndUpdate(
      { email: email },
      {
        $unset: {
          accessToken: "",
          refreshToken: "",
          tokenExpiry: ""
        },
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ Google OAuth disconnected for:', email);

    res.json({
      success: true,
      message: `Google Calendar disconnected for ${email}`,
      user: {
        email: user.email,
        name: user.name,
        connected: false
      }
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

// Refresh access token
exports.refreshAccessToken = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    console.log('🔄 Refreshing access token for:', email);

    const user = await User.findOne({ email: email });
    
    if (!user || !user.refreshToken) {
      return res.status(404).json({
        success: false,
        message: 'User not found or no refresh token available'
      });
    }

    // Create OAuth2 client and set refresh token
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      refresh_token: user.refreshToken
    });

    // Refresh the access token
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    // Update user with new tokens
    user.accessToken = credentials.access_token;
    if (credentials.refresh_token) {
      user.refreshToken = credentials.refresh_token;
    }
    user.tokenExpiry = credentials.expiry_date;
    user.updatedAt = new Date();
    
    await user.save();

    console.log('✅ Access token refreshed for:', email);

    res.json({
      success: true,
      message: 'Access token refreshed successfully',
      tokens: {
        access_token: credentials.access_token,
        expiry_date: credentials.expiry_date
      }
    });

  } catch (error) {
    console.error('❌ Error refreshing access token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh access token',
      error: error.message
    });
  }
};

module.exports = exports;