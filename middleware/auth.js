// middleware/auth.js
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { errorResponse } = require('../utils/errorHandler');

/**
 * Protect routes - Middleware to verify user is authenticated
 */
exports.protect = async (req, res, next) => {
  try {
    let token;
    
    // Check for token in Authorization header with Bearer prefix
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    // If no token found
    if (!token) {
      return errorResponse(res, 401, 'Access denied. No token provided');
    }
    
    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Find user by id from token
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return errorResponse(res, 401, 'User not found');
      }
      
      // Attach user to request object
      req.user = user;
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return errorResponse(res, 401, 'Token expired');
      }
      return errorResponse(res, 401, 'Invalid token');
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return errorResponse(res, 500, 'Server error in authentication');
  }
};

/**
 * Admin only routes
 */
exports.adminOnly = async (req, res, next) => {
  try {
    // First ensure the user is authenticated
    if (!req.user) {
      return errorResponse(res, 401, 'Access denied. Not authenticated');
    }
    
    // Check if user is an admin
    if (!req.user.isAdmin) {
      return errorResponse(res, 403, 'Access denied. Admin privileges required');
    }
    
    next();
  } catch (error) {
    return errorResponse(res, 500, 'Server error', error);
  }
};