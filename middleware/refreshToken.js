// middleware/refreshToken.js
const { refreshTokensIfNeeded } = require('../services/calendarService');

/**
 * Middleware to refresh tokens before API requests
 */
const refreshToken = async (req, res, next) => {
  try {
    if (req.user && req.user.id) {
      await refreshTokensIfNeeded(req.user.id);
    }
    next();
  } catch (error) {
    console.error('Token refresh middleware error:', error);
    
    // If token refresh fails, clear tokens and notify user
    if (error.message.includes('Failed to refresh')) {
      // Only send unauthorized if it's a Google API request
      if (req.path.includes('/google-calendar')) {
        return res.status(401).json({
          success: false,
          message: 'Google Calendar authentication expired. Please reconnect your account.'
        });
      }
    }
    
    next(error);
  }
};

module.exports = refreshToken;