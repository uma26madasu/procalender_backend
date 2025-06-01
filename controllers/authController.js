// controllers/authController.js - DEBUG VERSION
const { google } = require('googleapis');
const User = require('../models/User');

// OAuth2 configuration with explicit redirect URI handling
const createOAuth2Client = () => {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  // Explicitly set the redirect URI to ensure consistency
  client.redirectUri = process.env.GOOGLE_REDIRECT_URI;
  
  return client;
};

// OAuth scopes
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

// In-memory token storage
global.userTokens = global.userTokens || {};

// Generate Google OAuth URL with debugging
exports.getGoogleAuthUrl = async (req, res) => {
  try {
    console.log('🔄 Generating Google OAuth URL...');
    console.log('🔧 Environment check:');
    console.log('   GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Missing');
    console.log('   GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Missing');
    console.log('   GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI);
    
    const oauth2Client = createOAuth2Client();
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      redirect_uri: process.env.GOOGLE_REDIRECT_URI, // Explicitly set
      include_granted_scopes: true
    });

    console.log('✅ Generated OAuth URL successfully');
    console.log('🔧 Auth URL contains redirect_uri:', authUrl.includes(process.env.GOOGLE_REDIRECT_URI));
    
    // Extract the redirect_uri from the generated URL for debugging
    const urlParams = new URLSearchParams(authUrl.split('?')[1]);
    const redirectUriInUrl = urlParams.get('redirect_uri');
    
    res.json({ 
      success: true, 
      url: authUrl,
      debug: {
        configuredRedirectUri: process.env.GOOGLE_REDIRECT_URI,
        urlRedirectUri: redirectUriInUrl,
        match: process.env.GOOGLE_REDIRECT_URI === redirectUriInUrl,
        clientId: process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Missing'
      }
    });
  } catch (error) {
    console.error('❌ Error generating OAuth URL:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate OAuth URL',
      error: error.message,
      debug: {
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
        clientId: process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Missing'
      }
    });
  }
};

// Handle Google OAuth callback with enhanced debugging
exports.handleGoogleCallback = async (req, res) => {
  try {
    console.log('🔄 Processing Google OAuth callback...');
    console.log('🔧 Request details:');
    console.log('   Method:', req.method);
    console.log('   Headers:', JSON.stringify(req.headers, null, 2));
    console.log('   Query:', JSON.stringify(req.query, null, 2));
    console.log('   Body:', JSON.stringify(req.body, null, 2));
    console.log('   URL:', req.url);
    console.log('   Full URL:', req.protocol + '://' + req.get('host') + req.originalUrl);
    
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
    console.log('🔧 Using redirect URI for token exchange:', process.env.GOOGLE_REDIRECT_URI);
    
    const oauth2Client = createOAuth2Client();
    
    // Create the token request manually for debugging
    try {
      const { tokens } = await oauth2Client.getToken({
        code: code,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI
      });
      
      if (!tokens.access_token) {
        throw new Error('No access token received from Google');
      }

      console.log('✅ Received tokens from Google');
      console.log('🔧 Token details:', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiryDate: tokens.expiry_date,
        scope: tokens.scope
      });

      // Set credentials for user info request
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
        console.log('🔄 Creating new user...');
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
      } else {
        console.log('🔄 Updating existing user tokens...');
        user.googleTokens = {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || user.googleTokens?.refreshToken,
          expiryDate: new Date(tokens.expiry_date || Date.now() + 3600000),
          scope: tokens.scope,
          tokenType: tokens.token_type || 'Bearer',
          idToken: tokens.id_token
        };
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

    } catch (tokenError) {
      console.error('❌ Error during token exchange:', tokenError);
      
      if (tokenError.message?.includes('redirect_uri_mismatch')) {
        console.error('🔧 REDIRECT_URI_MISMATCH DEBUG:');
        console.error('   Configured URI:', process.env.GOOGLE_REDIRECT_URI);
        console.error('   Request came from:', req.get('host'));
        console.error('   Full request URL:', req.protocol + '://' + req.get('host') + req.originalUrl);
        
        // Check if there's a URL mismatch
        const expectedHost = 'procalender-backend.onrender.com';
        const actualHost = req.get('host');
        
        if (actualHost !== expectedHost) {
          console.error('   HOST MISMATCH! Expected:', expectedHost, 'Got:', actualHost);
        }
      }
      
      throw tokenError;
    }

  } catch (error) {
    console.error('❌ Error in Google OAuth callback:', error);
    
    const errorMessage = error.message || 'Authentication failed. Please try again.';
    
    if (req.method === 'POST') {
      return res.status(500).json({ 
        success: false, 
        message: errorMessage,
        debug: {
          redirectUri: process.env.GOOGLE_REDIRECT_URI,
          requestUrl: req.protocol + '://' + req.get('host') + req.originalUrl,
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
      await User.updateOne(
        { email: userEmail },
        { $unset: { googleTokens: "" } }
      );
      delete global.userTokens[userEmail];
    } else {
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

// Simplified auth middleware
exports.verifyAuth = async (req, res, next) => {
  try {
    const userTokens = global.userTokens || {};
    const tokenEntries = Object.values(userTokens);
    
    if (tokenEntries.length === 0) {
      return res.status(401).json({ 
        error: 'Unauthorized - No Google Calendar connection found',
        needsAuth: true
      });
    }
    
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