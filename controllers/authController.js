// Fixed OAuth callback handler for authController.js
// Replace the handleGoogleCallback function with this version

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

    // FIXED: Handle existing users properly
    let user;
    
    try {
      // First, try to find existing user by email
      user = await User.findOne({ email: userInfo.email });
      
      if (user) {
        console.log('✅ Existing user found, updating tokens...');
        
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
        console.log('✅ New user, creating...');
        
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
      console.error('❌ Database operation failed:', dbError);
      
      // If still getting duplicate key error, try alternative approach
      if (dbError.code === 11000) {
        console.log('🔄 Duplicate key error, trying alternative update...');
        
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
          { 
            new: true,
            runValidators: true
          }
        );
        
        if (!user) {
          throw new Error('Failed to update existing user');
        }
      } else {
        throw dbError;
      }
    }

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