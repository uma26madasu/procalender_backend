// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const asyncHandler = require('./asyncHandler'); // Assuming asyncHandler is also in middleware
const User = require('../models/User'); // Import your User model

console.log('--- Inside src/middleware/auth.js ---');
console.log('asyncHandler is:', typeof asyncHandler); // Should be 'function'
console.log('User model is:', typeof User); // Should be 'function' (Mongoose model constructor)

exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  // Check for token in headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // If no token, or if using cookies, check for token in cookies
  // else if (req.cookies.token) {
  //   token = req.cookies.token;
  // }

  if (!token) {
    console.error('No token found for protect middleware.');
    return res.status(401).json({ success: false, message: 'Not authorized to access this route. No token.' });
  }

  try {
    // Verify token
    console.log('Attempting to verify JWT with token:', token.substring(0, 10) + '...');
    console.log('Using JWT_SECRET length:', process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 'undefined');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('JWT decoded:', decoded);

    // Attach user to the request (e.g., from Firebase UID)
    // Assuming your JWT payload contains `uid` or `firebaseUid`
    req.user = await User.findOne({ firebaseUid: decoded.uid || decoded.firebaseUid }); // Adjust based on your JWT payload field for UID

    if (!req.user) {
      console.error('User not found after JWT verification for UID:', decoded.uid || decoded.firebaseUid);
      return res.status(401).json({ success: false, message: 'Not authorized, user not found.' });
    }
    console.log('User attached to request:', req.user.email);
    next();
  } catch (error) {
    console.error('Token verification error in protect middleware:', error.message);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, message: 'Not authorized, token failed.' });
  }
});

console.log('exports.protect is:', typeof exports.protect); // Should be 'function'
console.log('--- Exiting src/middleware/auth.js ---');