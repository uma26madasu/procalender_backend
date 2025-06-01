// controllers/authController.js - SIMPLIFIED VERSION WITHOUT DEPENDENCIES
const { google } = require('googleapis');

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

// Handle Google OAuth callback - SIMPLIFIED VERSION
exports.handleGoogleCallback = async (req, res) => {
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
    // IMPORTANT: Use the original redirect_uri that was used to generate the code
    const originalRedirectUri = req.body.redirect_uri || req.query.redirect_uri;
    console.log('🔄 Exchanging code for tokens...');
    console.log('Using redirect_uri:', originalRedirectUri);
    
    const { tokens } = await oauth2Client.getToken({
      code: code,
      redirect_uri: originalRedirectUri
    });
    
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

    // TODO: Save tokens to your database if needed
    // For now, just log success and redirect
    console.log('✅ OAuth tokens received:', {
      access_token: tokens.access_token ? 'Present' : 'Missing',
      refresh_token: tokens.refresh_token ? 'Present' : 'Missing',
      expiry_date: tokens.expiry_date
    });

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

// Check Google Calendar connection status - SIMPLIFIED
exports.getGoogleAuthStatus = async (req, res) => {
  try {
    // For now, just return not connected since we're not storing tokens yet
    // You can implement token storage later
    res.json({ 
      connected: false, 
      email: '',
      message: 'Token storage not implemented yet' 
    });
  } catch (error) {
    console.error('Error checking Google auth status:', error);
    res.json({ 
      connected: false, 
      email: '' 
    });
  }
};

// Disconnect Google Calendar - SIMPLIFIED
exports.disconnectGoogleCalendar = async (req, res) => {
  try {
    // For now, just return success
    // You can implement token cleanup later
    console.log('✅ Google Calendar disconnect requested');
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

// Simplified auth middleware - no verification for now
exports.verifyAuth = async (req, res, next) => {
  try {
    // For now, just continue without verification
    // You can add your own auth logic here later
    console.log('Auth middleware - skipping verification for now');
    next();
  } catch (error) {
    console.error('Auth verification error:', error);
    return res.status(401).json({ error: 'Unauthorized' });
  }
};