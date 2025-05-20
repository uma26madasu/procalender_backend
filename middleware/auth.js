// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - middleware to verify user is authenticated
exports.protect = async (req, res, next) => {
  try {
    let token;
    
    // Check for token in Authorization header with Bearer prefix
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } 
    // For testing/development - can also accept token as a query parameter
    else if (req.query && req.query.token) {
      token = req.query.token;
    }
    
    // If no token found
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }
    
    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Find user by id from token
      const user = await User.findById(decoded.id);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Attach user to request object
      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Token is invalid or expired'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

// Optional middleware - for development/testing, allow skipping auth in dev environment
exports.optionalAuth = async (req, res, next) => {
  // For development environments, allow skipping authentication
  if (process.env.NODE_ENV === 'development' && req.query.skipAuth === 'true') {
    // Set a dummy user ID or use a test user
    req.user = { id: process.env.TEST_USER_ID || '64e5f5f0e12345678901234' };
    return next();
  }
  
  // Otherwise use regular auth protection
  return exports.protect(req, res, next);
};

// Admin only routes
exports.adminOnly = async (req, res, next) => {
  // First ensure the user is authenticated
  exports.protect(req, res, (err) => {
    if (err) return next(err);
    
    // Check if user is an admin
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required for this route'
      });
    }
    
    next();
  });
};