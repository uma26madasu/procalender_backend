// /controllers/authController.js
const { google } = require('googleapis');

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
    const { code } = req.query;
    
    if (!code) {
      console.error('No authorization code provided');
      return res.redirect(`https://procalender-frontend-uma26madasus-projects.vercel.app/dashboard?error=no_code`);
    }
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    // Set credentials to get user info
    oauth2Client.setCredentials(tokens);
    
    // Get user info to confirm email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    // Get database from app locals (set in server.js)
    const db = req.app.locals.db;
    const usersCollection = db.collection('users');
    
    // Create or update user
    const userData = {
      email: userInfo.data.email,
      name: userInfo.data.name || userInfo.data.email,
      googleTokens: tokens,
      googleEmail: userInfo.data.email,
      updatedAt: new Date()
    };
    
    // Use upsert to create or update
    await usersCollection.updateOne(
      { email: userInfo.data.email },
      { 
        $set: userData,
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    
    console.log('User tokens saved successfully for:', userInfo.data.email);
    
    // Redirect to frontend with success
    res.redirect(`https://procalender-frontend-uma26madasus-projects.vercel.app/dashboard?connected=true&email=${encodeURIComponent(userInfo.data.email)}`);
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    // Redirect to frontend with error
    res.redirect(`https://procalender-frontend-uma26madasus-projects.vercel.app/dashboard?error=connection_failed&details=${encodeURIComponent(error.message)}`);
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
    
    // Get database from app locals
    const db = req.app.locals.db;
    const usersCollection = db.collection('users');
    const { ObjectId } = require('mongodb');
    
    // Find user
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    
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
    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { 
        $unset: { 
          googleTokens: "",
          googleEmail: ""
        },
        $set: {
          updatedAt: new Date()
        }
      }
    );
    
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


exports.handleGoogleCallback = async (req, res) => {
  try {
    console.log('=== OAuth Callback Started ===');
    console.log('Query params:', req.query);
    
    const { code } = req.query;
    
    if (!code) {
      console.error('No authorization code provided');
      return res.redirect(`https://procalender-frontend-uma26madasus-projects.vercel.app/dashboard?error=no_code`);
    }
    
    console.log('Authorization code received, exchanging for tokens...');
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log('Tokens received successfully');
    
    // Set credentials to get user info
    oauth2Client.setCredentials(tokens);
    
    console.log('Getting user info from Google...');
    // Get user info to confirm email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    console.log('User info received:', userInfo.data.email);
    
    // Check if database is available
    console.log('Checking database connection...');
    const db = req.app.locals.db;
    if (!db) {
      throw new Error('Database not available in app.locals');
    }
    console.log('Database connection confirmed');
    
    const usersCollection = db.collection('users');
    console.log('Users collection accessed');
    
    // Create or update user
    const userData = {
      email: userInfo.data.email,
      name: userInfo.data.name || userInfo.data.email,
      googleTokens: tokens,
      googleEmail: userInfo.data.email,
      updatedAt: new Date()
    };
    
    console.log('Saving user data to database...');
    // Use upsert to create or update
    const result = await usersCollection.updateOne(
      { email: userInfo.data.email },
      { 
        $set: userData,
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    
    console.log('Database operation result:', result);
    console.log('User tokens saved successfully for:', userInfo.data.email);
    
    // Redirect to frontend with success
    res.redirect(`https://procalender-frontend-uma26madasus-projects.vercel.app/dashboard?connected=true&email=${encodeURIComponent(userInfo.data.email)}`);
    
  } catch (error) {
    console.error('=== OAuth Callback Error ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Redirect to frontend with error
    res.redirect(`https://procalender-frontend-uma26madasus-projects.vercel.app/dashboard?error=connection_failed&details=${encodeURIComponent(error.message)}`);
  }
};