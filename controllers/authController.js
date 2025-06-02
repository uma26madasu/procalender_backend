const { google } = require('googleapis');

console.log('📝 Loading authController...');

// Import User model with comprehensive error handling
let User;
try {
  User = require('../models/User');
  console.log('✅ User model imported successfully');
} catch (error) {
  console.error('❌ Failed to import User model:', error.message);
  // Create a mock User model to prevent crashes
  User = {
    findOne: () => Promise.resolve(null),
    findOneAndUpdate: () => Promise.resolve(null),
    save: () => Promise.resolve({})
  };
}

// Configuration constants
const FRONTEND_REDIRECT_URI = 'https://procalender-frontend.vercel.app/auth/google/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

console.log('📝 Auth controller configuration loaded');

// Helper function to create OAuth2 client
const createOAuth2Client = () => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Missing Google OAuth credentials in environment variables');
  }
  
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    FRONTEND_REDIRECT_URI
  );
};

// 1. Get Google OAuth URL
async function getGoogleOAuthUrl(req, res) {
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
        scopes: SCOPES,
        timestamp: new Date().toISOString()
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
}

// 2. Handle Google OAuth callback
async function handleGoogleCallback(req, res) {
  try {
    console.log('🔄 Processing Google OAuth callback...');
    console.log('   Method:', req.method);
    console.log('   Body keys:', Object.keys(req.body || {}));

    const { code } = req.body;
    
    if (!code) {
      console.error('❌ No authorization code provided');
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

    // Get user info from Google
    console.log('🔄 Fetching user info from Google...');
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    
    console.log('✅ User info retrieved:', userInfo.email);

    // Save or update user in database
    console.log('🔄 Saving user to database...');
    let user;
    
    try {
      // Try to find existing user first
      user = await User.findOne({ email: userInfo.email });
      
      if (user) {
        console.log('✅ Existing user found, updating...');
        // Update existing user
        user.googleId = userInfo.id;
        user.name = userInfo.name;
        user.picture = userInfo.picture;
        user.accessToken = tokens.access_token;
        user.refreshToken = tokens.refresh_token;
        user.tokenExpiry = tokens.expiry_date;
        user.updatedAt = new Date();
        await user.save();
      } else {
        console.log('✅ Creating new user...');
        // Create new user
        user = new User({
          googleId: userInfo.id,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiry: tokens.expiry_date
        });
        await user.save();
      }
      
    } catch (dbError) {
      console.error('❌ Database error:', dbError);
      
      // Handle duplicate key error specifically
      if (dbError.code === 11000 || dbError.message.includes('duplicate')) {
        console.log('🔄 Handling duplicate key, trying findOneAndUpdate...');
        user = await User.findOneAndUpdate(
          { email: userInfo.email },
          {
            googleId: userInfo.id,
            name: userInfo.name,
            picture: userInfo.picture,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            tokenExpiry: tokens.expiry_date,
            updatedAt: new Date()
          },
          { new: true, upsert: true }
        );
      } else {
        throw dbError;
      }
    }

    console.log('✅ User saved successfully:', user.email);

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
      error: error.message,
      debug: {
        step: 'OAuth callback processing',
        timestamp: new Date().toISOString()
      }
    });
  }
}

// 3. Check Google OAuth status
async function checkGoogleOAuthStatus(req, res) {
  try {
    console.log('🔄 Checking OAuth status...');
    
    const email = req.query.email || req.body.email;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email parameter is required'
      });
    }

    console.log('🔍 Looking up user:', email);
    const user = await User.findOne({ email: email });
    
    if (!user) {
      console.log('❌ User not found:', email);
      return res.json({
        connected: false,
        message: 'User not found',
        email: email
      });
    }

    const now = new Date();
    const tokenExpiry = user.tokenExpiry ? new Date(user.tokenExpiry) : null;
    const isExpired = tokenExpiry ? now >= tokenExpiry : false;

    console.log('✅ User found:', user.email, 'Expired:', isExpired);

    res.json({
      connected: true,
      email: user.email,
      name: user.name,
      picture: user.picture,
      connectedAt: user.updatedAt || user.createdAt,
      isExpired: isExpired,
      debug: {
        foundEmail: user.email,
        hasAccessToken: !!user.accessToken,
        hasRefreshToken: !!user.refreshToken,
        tokenExpiry: user.tokenExpiry,
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
}

// 4. Disconnect Google OAuth
async function disconnectGoogleOAuth(req, res) {
  try {
    console.log('🔄 Disconnecting Google OAuth...');
    
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    console.log('🔄 Removing tokens for:', email);
    const result = await User.findOneAndUpdate(
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

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ OAuth disconnected successfully for:', email);

    res.json({
      success: true,
      message: `Google Calendar disconnected for ${email}`,
      user: {
        email: result.email,
        name: result.name,
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
}

// Log function definitions
console.log('✅ Auth controller functions defined:');
console.log('   - getGoogleOAuthUrl:', typeof getGoogleOAuthUrl);
console.log('   - handleGoogleCallback:', typeof handleGoogleCallback);
console.log('   - checkGoogleOAuthStatus:', typeof checkGoogleOAuthStatus);
console.log('   - disconnectGoogleOAuth:', typeof disconnectGoogleOAuth);

// Export functions explicitly
const authController = {
  getGoogleOAuthUrl: getGoogleOAuthUrl,
  handleGoogleCallback: handleGoogleCallback,
  checkGoogleOAuthStatus: checkGoogleOAuthStatus,
  disconnectGoogleOAuth: disconnectGoogleOAuth
};

// Verify exports before exporting
console.log('📝 Verifying exports...');
Object.keys(authController).forEach(key => {
  const func = authController[key];
  if (typeof func !== 'function') {
    console.error(`❌ Export ${key} is not a function:`, typeof func);
  } else {
    console.log(`✅ Export ${key}: function`);
  }
});

console.log('✅ authController exported successfully with', Object.keys(authController).length, 'functions');

module.exports = authController;