// utils/tokenManager.js
const { google } = require('googleapis');
const User = require('../models/User');

// Configure Google OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Check and refresh Google token if expired
 * @param {Object} user - User document with googleTokens
 * @returns {Object} Updated tokens
 */
exports.refreshGoogleToken = async (user) => {
  if (!user || !user.googleTokens) {
    throw new Error('User has no Google tokens');
  }
  
  const tokens = user.googleTokens;
  
  // Check if token is expired or about to expire (5 min buffer)
  const isExpired = !tokens.expiry_date || tokens.expiry_date <= Date.now() + 300000;
  
  if (isExpired && tokens.refresh_token) {
    try {
      // Set refresh token
      oauth2Client.setCredentials({
        refresh_token: tokens.refresh_token
      });
      
      // Refresh the token
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      // Update user's tokens in database
      user.googleTokens = credentials;
      await user.save();
      
      return credentials;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw new Error('Failed to refresh Google token');
    }
  }
  
  return tokens;
};

/**
 * Generate a signed JWT
 * @param {Object} payload - Token payload
 * @param {String} expiresIn - Expiration time (default: 1d)
 * @returns {String} Signed JWT
 */
exports.generateToken = (payload, expiresIn = '1d') => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

/**
 * Verify a token
 * @param {String} token - JWT to verify
 * @returns {Object} Decoded token payload
 */
exports.verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw error;
  }
};