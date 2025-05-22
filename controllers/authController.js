exports.handleGoogleCallback = async (req, res) => {
  try {
    const { code, state } = req.query; // GET from query params, not body
    
    if (!code) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing authorization code' 
      });
    }
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    // Set credentials to get user info
    oauth2Client.setCredentials(tokens);
    
    // Get user info to confirm email
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    // Create or find user by email (since we don't have userId yet)
    let user = await User.findOne({ email: userInfo.data.email });
    
    if (!user) {
      // Create new user if doesn't exist
      user = new User({
        email: userInfo.data.email,
        name: userInfo.data.name || userInfo.data.email
      });
    }
    
    // Store tokens securely
    user.googleTokens = tokens;
    user.googleEmail = userInfo.data.email;
    
    await user.save();
    
    // Redirect to frontend with success
    res.redirect(`https://procalender-frontend-uma26madasus-projects.vercel.app/dashboard?connected=true`);
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    // Redirect to frontend with error
    res.redirect(`https://procalender-frontend-uma26madasus-projects.vercel.app/dashboard?error=connection_failed`);
  }
};