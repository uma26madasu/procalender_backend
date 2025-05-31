// src/utils/tokenManager.js
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Ensure this path is correct based on your project structure

// Configure Google OAuth client
// IMPORTANT: This oauth2Client needs to be consistent across tokenManager, authController,
// and googleCalendarController.
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI // Ensure this is correctly configured and used here
);

/**
 * Check and refresh Google token if expired.
 * Updates the user's googleTokens in the database if refreshed.
 * @param {Object} user - User document with googleTokens. MUST be a Mongoose document.
 * @returns {Object} Updated tokens as a plain JavaScript object.
 * @throws {Error} If user has no Google tokens or token refresh fails.
 */
exports.refreshGoogleToken = async (user) => {
  if (!user || !user.googleTokens || !user.googleTokens.refreshToken) {
    // If there are no tokens or no refresh token, assume not connected or needs re-auth
    throw new Error('User has no Google refresh token or calendar is not connected.');
  }

  const { accessToken, refreshToken, expiryDate } = user.googleTokens;

  // Check if access token is expired or about to expire (5 min buffer)
  // expiryDate is a Date object, so compare with new Date().getTime()
  const isExpired = !accessToken || new Date().getTime() >= (new Date(expiryDate).getTime() - (5 * 60 * 1000)); // 5 minutes buffer

  if (isExpired) { // Only attempt refresh if expired/missing access token
    console.log(`Access token for user ${user._id} is expired or missing. Attempting to refresh...`);
    try {
      // Set refresh token on the OAuth2Client for refreshing
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      // Refresh the token
      const { credentials } = await oauth2Client.refreshAccessToken();

      // Update user's tokens in database with the new credentials
      // Mongoose automatically handles updating embedded documents
      user.googleTokens.accessToken = credentials.access_token;
      user.googleTokens.expiryDate = new Date(credentials.expiry_date); // Ensure it's a Date object
      user.googleTokens.idToken = credentials.id_token || user.googleTokens.idToken; // Update idToken if provided
      // NOTE: A new refresh_token is rarely issued. If it is, update it.
      if (credentials.refresh_token) {
        user.googleTokens.refreshToken = credentials.refresh_token;
      }
      await user.save(); // Save the updated user document

      console.log(`Access token refreshed and saved for user: ${user._id}`);
      return user.googleTokens.toObject(); // Return as plain JS object
    } catch (error) {
      console.error(`Error refreshing Google token for user ${user._id}:`, error);
      // If refresh fails, consider the connection broken and clear tokens
      user.googleTokens = undefined; // Clear the embedded document
      await user.save();
      throw new Error('Failed to refresh Google token. Please re-authenticate.');
    }
  }

  return user.googleTokens.toObject(); // Token is valid, return existing tokens as plain object
};

/**
 * Generate JWT token for authentication
 * @param {Object} payload - Payload to include in token
 * @param {String} expiresIn - Token expiration time
 * @returns {String} JWT token
 */
exports.generateToken = (payload, expiresIn = '7d') => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};