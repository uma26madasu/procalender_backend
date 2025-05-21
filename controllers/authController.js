// /controllers/authController.js
const { google } = require('googleapis');
const { User } = require('../models');

// Configure Google OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Set OAuth scopes
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

exports.getGoogleAuthUrl = (req, res) => {
  // Generate a URL for OAuth consent
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'  // Force to always show consent screen to get refresh_token
  });
  
  res.json({ success: true, url: authUrl });
};

exports.handleGoogleCallback = async (req, res) => {
  try {
    const { code, userId } = req.body;
    
    if (!code || !userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing code or userId' 
      });
    }
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    // Set credentials to get user info
    oauth2Client.setCredentials(tokens);
    
    // Get user info to confirm email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    // Find and update user with tokens
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    // Store tokens securely
    user.googleTokens = tokens;
    user.googleEmail = userInfo.data.email;
    
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'Google Calendar connected successfully',
      email: userInfo.data.email
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to connect Google Calendar',
      error: error.message
    });
  }
};

exports.revokeGoogleAccess = async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing userId' 
      });
    }
    
    // Find user
    const user = await User.findById(userId);
    
    if (!user || !user.googleTokens) {
      return res.status(404).json({ 
        success: false, 
        message: 'User or tokens not found' 
      });
    }
    
    // Revoke access
    const tokens = user.googleTokens;
    if (tokens.access_token) {
      try {
        await oauth2Client.revokeToken(tokens.access_token);
      } catch (revokeError) {
        console.error('Token revocation error:', revokeError);
        // Continue even if revocation fails
      }
    }
    
    // Remove tokens from user
    user.googleTokens = undefined;
    user.googleEmail = undefined;
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'Google Calendar disconnected successfully' 
    });
  } catch (error) {
    console.error('Revoke access error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to disconnect Google Calendar' 
    });
  }
};