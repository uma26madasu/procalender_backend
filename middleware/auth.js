// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const asyncHandler = require('./asyncHandler'); // Assuming asyncHandler is also in middleware
const User = require('../models/User'); // Import your User model

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
    return res.status(401).json({ success: false, message: 'Not authorized to access this route. No token.' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to the request (e.g., from Firebase UID)
    // Assuming your JWT payload contains `uid` or `firebaseUid`
    req.user = await User.findOne({ firebaseUid: decoded.uid || decoded.firebaseUid }); // Adjust based on your JWT payload field for UID

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authorized, user not found.' });
    }

    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, message: 'Token expired. Please log in again.', expired: true });
    }
    res.status(401).json({ success: false, message: 'Not authorized to access this route. Token failed.' });
  }
});