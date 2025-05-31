// src/models/User.js
const mongoose = require('mongoose');
const validator = require('validator');

// Simple Google tokens schema - no required fields
const googleTokensSchema = new mongoose.Schema({
  accessToken: String,
  refreshToken: String,
  expiryDate: Date,
  scope: String,
  tokenType: String,
  idToken: String
}, { _id: false });

// Simple user schema - minimal required fields
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: validator.isEmail,
      message: 'Please provide a valid email address'
    }
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  firebaseUid: {
    type: String,
    required: false, // NOT REQUIRED
    unique: true,
    sparse: true // Allow multiple null values
  },
  googleTokens: googleTokensSchema, // NOT REQUIRED
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ firebaseUid: 1 }, { unique: true, sparse: true });

// Error handling
userSchema.post('save', function(error, doc, next) {
  if (error.name === 'MongoServerError' && error.code === 11000) {
    if (error.message.includes('email')) {
      next(new Error('Email address is already registered'));
    } else if (error.message.includes('firebaseUid')) {
      next(new Error('User with this Firebase ID is already registered'));
    } else {
      next(error);
    }
  } else {
    next(error);
  }
});

module.exports = mongoose.model('User', userSchema);